/* =====================================================
   URVI – mycertificates.js | Dynamic Eco Certificate System
   ===================================================== */
import { db, ref, get, child, set, update } from "../config.js";

// Global Certificate Store for Preview and Downloads
const userCertificatesStore = {};

document.addEventListener("DOMContentLoaded", () => {
    loadCertificates();
});

function getActiveUserId() {
    let raw = localStorage.getItem("urvi_logged_user");
    if (!raw || raw === "undefined" || raw === "null") {
        try {
            const userData = JSON.parse(localStorage.getItem("urvi_user_data") || "{}");
            raw = userData.user_id || userData.id || userData.uid || userData.email;
        } catch (e) { /* ignore */ }
    }
    return (raw && raw !== "undefined" && raw !== "null") ? String(raw).trim() : null;
}

async function loadCertificates() {
    const activeUserId = getActiveUserId();
    const container = document.getElementById("certificates-grid");
    if (!container) return;

    if (!activeUserId) {
        container.innerHTML = `
            <div class="col-12 text-center py-5">
                <div class="p-4 p-md-5 bg-white rounded-4 border shadow-sm mx-auto" style="max-width:500px;">
                    <div class="mb-3" style="font-size:42px;">🔒</div>
                    <h4 class="fw-bold text-dark mb-2">Login Required</h4>
                    <p class="text-muted small mb-4">Please log in to view your verified eco certificates.</p>
                    <a href="../logins/login.html" class="btn btn-success rounded-pill px-4 py-2 fw-semibold">Log In / Sign Up</a>
                </div>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <div class="col-12 text-center py-5">
            <div class="spinner-border text-success" role="status"></div>
            <p class="text-muted small mt-2">Loading your eco certificates...</p>
        </div>
    `;

    try {
        let user = {};
        try {
            const uSnap = await get(child(ref(db), `users/${activeUserId}`));
            if (uSnap.exists()) user = uSnap.val();
        } catch (err) {
            console.warn("User record load warning:", err);
        }

        // Secondary fallback to local cached user data if available
        if (!user || Object.keys(user).length === 0) {
            try {
                const cached = localStorage.getItem("urvi_user_data");
                if (cached) user = JSON.parse(cached);
            } catch (e) { /* ignore */ }
        }

        const fullName = `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.user_id || activeUserId;
        const userHandle = user.user_id || activeUserId;

        const certsList = [];
        const seenCertIds = new Set();

        // 1. Check user-specific certificates node (certificates/{activeUserId})
        try {
            const userCertsSnap = await get(child(ref(db), `certificates/${activeUserId}`));
            if (userCertsSnap.exists()) {
                const val = userCertsSnap.val();
                Object.keys(val).forEach(k => {
                    const c = val[k];
                    if (c && typeof c === "object") {
                        const normalized = normalizeCertRecord(k, c, fullName, userHandle);
                        if (!seenCertIds.has(normalized.certificateId)) {
                            seenCertIds.add(normalized.certificateId);
                            certsList.push(normalized);
                        }
                    }
                });
            }
        } catch (err) {
            console.warn("Could not query certificates by activeUserId:", err);
        }

        // 2. If handle differs from activeUserId, check certificates/{userHandle}
        if (userHandle && userHandle !== activeUserId) {
            try {
                const handleCertsSnap = await get(child(ref(db), `certificates/${userHandle}`));
                if (handleCertsSnap.exists()) {
                    const val = handleCertsSnap.val();
                    Object.keys(val).forEach(k => {
                        const c = val[k];
                        if (c && typeof c === "object") {
                            const normalized = normalizeCertRecord(k, c, fullName, userHandle);
                            if (!seenCertIds.has(normalized.certificateId)) {
                                seenCertIds.add(normalized.certificateId);
                                certsList.push(normalized);
                            }
                        }
                    });
                }
            } catch (err) {
                console.warn("Could not query certificates by userHandle:", err);
            }
        }

        // If no certificates exist yet, create a sample onboarding certificate
        if (certsList.length === 0) {
            const initialCert = createSampleCert(activeUserId, fullName, userHandle);
            certsList.push(initialCert);
            try {
                await set(ref(db, `certificates/${activeUserId}/${initialCert.certificateId}`), initialCert);
            } catch (err) { /* ignore seed error */ }
        }

        // Filter out revoked certificates
        const activeCerts = certsList.filter(c => c.status !== "revoked");

        // Store active certificates in global registry
        activeCerts.forEach(c => {
            userCertificatesStore[c.certificateId] = c;
        });

        // Render Certificate Cards Grid
        container.innerHTML = activeCerts.map(cert => renderCertificateCard(cert)).join("");

    } catch (e) {
        console.error("Load certificates error:", e);
        container.innerHTML = `
            <div class="col-12 text-center py-5">
                <p class="text-danger fw-semibold">Unable to load your certificates. Please try again.</p>
                <button type="button" class="btn btn-sm btn-outline-success rounded-pill px-3" onclick="location.reload()">Retry</button>
            </div>
        `;
    }
}

/** Normalize raw certificate object from Firebase RTDB */
function normalizeCertRecord(key, c, defaultName, defaultHandle) {
    const certTypeRaw = (c.certificateType || c.type || "PARTICIPATION").toUpperCase();
    let certType = "PARTICIPATION";
    if (certTypeRaw.includes("MEMBERSHIP") || certTypeRaw.includes("INDUCTION")) certType = "MEMBERSHIP";
    else if (certTypeRaw.includes("APPRECIATION")) certType = "APPRECIATION";
    else if (certTypeRaw.includes("COMPLETION")) certType = "COMPLETION";
    else if (certTypeRaw.includes("EXCELLENCE")) certType = "EXCELLENCE";

    let eventName = c.eventName || c.eventTitle || c.title || "URVI Clean & Green Initiative";
    let description = c.description || c.reason || "";

    // Auto-migrate old placeholder "Green Champion" record from Firebase to official Membership Induction
    const isOldGreenChampion = eventName.includes("Green Champion") || (description && description.includes("Green Champion"));
    if (isOldGreenChampion) {
        eventName = "URVI Induction & Membership";
        certType = "MEMBERSHIP";
        description = `In formal recognition of joining URVI (A Greenery Organization) and dedicating your pledge toward environmental conservation, tree plantation, carbon reduction, and ecological stewardship for our Mother Earth.`;

        // Update database asynchronously
        const targetUid = c.userId || defaultHandle;
        const targetCertId = c.certificateId || c.certId || key;
        if (targetUid && targetCertId) {
            try {
                update(ref(db, `certificates/${targetUid}/${targetCertId}`), {
                    eventName,
                    certificateType: certType,
                    description,
                    founderName: "Dasari Sai Balaji",
                    coFounder2Name: "J.V.N.H Amarnath",
                    coFounderName: "Nakka Sai Suchit",
                    updatedAt: Date.now()
                }).catch(() => {});
            } catch (e) { /* ignore */ }
        }
    } else if (!description) {
        description = `In recognition of distinguished dedication and active participation in the "${eventName}" environmental initiative. Awarded for exemplary stewardship toward carbon reduction, biodiversity preservation, and advancing a greener planet.`;
    }

    const certId = c.certificateId || c.certId || key || `URVI-2026-${certType.slice(0, 4)}-${Math.floor(100000 + Math.random() * 900000)}`;

    return {
        certificateId: certId,
        userId: c.userId || defaultHandle,
        recipientName: c.recipientName || c.recipient || defaultName,
        username: c.username || c.handle || defaultHandle,
        certificateType: certType,
        eventName: eventName,
        eventDate: c.eventDate || c.issueDate || new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
        issueDate: c.issueDate || c.eventDate || new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
        description: description,
        founderName: (!c.founderName || c.founderName === "Sharoon Kasipeta") ? "Dasari Sai Balaji" : c.founderName,
        coFounder2Name: c.coFounder2Name || c.coFounderAmarnath || "J.V.N.H Amarnath",
        coFounderName: (!c.coFounderName || c.coFounderName === "URVI Directorate") ? "Nakka Sai Suchit" : c.coFounderName,
        status: c.status || "issued"
    };
}

/** Create Official URVI Induction & Joining Certificate */
function createSampleCert(userId, fullName, userHandle) {
    const certId = `URVI-2026-MEMB-${Math.floor(100000 + Math.random() * 900000)}`;
    const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

    return {
        certificateId: certId,
        userId: userId,
        recipientName: fullName,
        username: userHandle,
        certificateType: "MEMBERSHIP",
        eventName: "URVI Induction & Membership",
        eventDate: today,
        issueDate: today,
        description: `In formal recognition of joining URVI (A Greenery Organization) and dedicating your pledge toward environmental conservation, tree plantation, carbon reduction, and ecological stewardship for our Mother Earth.`,
        founderName: "Dasari Sai Balaji",
        coFounder2Name: "J.V.N.H Amarnath",
        coFounderName: "Nakka Sai Suchit",
        status: "issued"
    };
}

/** Render Card item for My Certificates page grid */
function renderCertificateCard(cert) {
    const badgeClass = cert.certificateType === "COMPLETION"
        ? "badge-completion"
        : (cert.certificateType === "APPRECIATION" || cert.certificateType === "MEMBERSHIP" ? "badge-appreciation" : (cert.certificateType === "EXCELLENCE" ? "badge-excellence" : "badge-participation"));

    return `
        <div class="col-12 col-md-6 col-lg-6">
            <div class="cert-card-item h-100">
                <div>
                    <!-- Mini Preview Container -->
                    <div class="cert-mini-preview-wrap mb-3" onclick="window.viewCertModal('${cert.certificateId}')" title="Click to view full preview">
                        <span class="cert-type-badge ${badgeClass} mb-2">CERTIFICATE OF ${cert.certificateType}</span>
                        <h6 class="fw-bold text-dark m-0 text-truncate" style="font-family:'Cinzel', serif; font-size:15px;">${cert.eventName}</h6>
                        <small class="text-muted d-block mt-1" style="font-size:11px;">Issued to: <strong>${cert.recipientName}</strong> (@${cert.username})</small>
                    </div>

                    <div class="d-flex align-items-center justify-content-between text-muted small mb-2" style="font-size:12px;">
                        <span>Issued: <strong>${cert.issueDate}</strong></span>
                        <span>ID: <strong class="font-monospace text-success">${cert.certificateId}</strong></span>
                    </div>
                </div>

                <!-- Action Buttons -->
                <div class="cert-card-actions pt-2 border-top">
                    <button type="button" class="btn btn-sm btn-outline-success btn-cert-action" onclick="window.viewCertModal('${cert.certificateId}')">
                        <i class="bi bi-eye-fill me-1"></i> View Certificate
                    </button>
                    <button type="button" class="btn btn-sm btn-success btn-cert-action" onclick="window.downloadCertPNG('${cert.certificateId}')">
                        <i class="bi bi-image me-1"></i> Download PNG
                    </button>
                    <button type="button" class="btn btn-sm btn-dark btn-cert-action" onclick="window.downloadCertPDF('${cert.certificateId}')">
                        <i class="bi bi-file-earmark-pdf-fill me-1"></i> Download PDF
                    </button>
                </div>
            </div>
        </div>
    `;
}

/** Render Complete Formal Landscape Certificate Template */
function renderCertificateHTML(c) {
    const certTitle = `CERTIFICATE OF ${c.certificateType}`;

    return `
        <div class="urvi-certificate-canvas" id="canvas-${c.certificateId}">
            <!-- Unified Master Luxury Vector Frame & Botanical Corners -->
            <svg class="cert-luxury-frame-svg" viewBox="0 0 1000 707" width="1000" height="707" xmlns="http://www.w3.org/2000/svg">
                <!-- Outer Deep Forest Green Border -->
                <rect x="16" y="16" width="968" height="675" rx="2" fill="none" stroke="#0D3B24" stroke-width="4.5" />
                
                <!-- Intermediate Gold Border -->
                <rect x="23" y="23" width="954" height="661" rx="1" fill="none" stroke="#C6A15B" stroke-width="2" />
                
                <!-- Inner Fine Green Accent Border -->
                <rect x="27" y="27" width="946" height="653" rx="0.5" fill="none" stroke="#166534" stroke-width="1" stroke-opacity="0.35" />
                
                <!-- Top-Left Corner Botanical Flourish -->
                <g class="corner-tl" transform="translate(29, 29)">
                    <path d="M 0,0 L 32,0 M 0,0 L 0,32" fill="none" stroke="#C6A15B" stroke-width="2.5" stroke-linecap="round"/>
                    <path d="M 4,4 L 22,4 M 4,4 L 4,22" fill="none" stroke="#0D3B24" stroke-width="1.5" stroke-linecap="round"/>
                    <circle cx="0" cy="0" r="3" fill="#0D3B24" stroke="#C6A15B" stroke-width="1.2" />
                    <path d="M 8,8 Q 18,4 20,0" fill="none" stroke="#C6A15B" stroke-width="1" />
                    <path d="M 8,8 Q 4,18 0,20" fill="none" stroke="#C6A15B" stroke-width="1" />
                </g>

                <!-- Top-Right Corner Botanical Flourish -->
                <g class="corner-tr" transform="translate(971, 29) scale(-1, 1)">
                    <path d="M 0,0 L 32,0 M 0,0 L 0,32" fill="none" stroke="#C6A15B" stroke-width="2.5" stroke-linecap="round"/>
                    <path d="M 4,4 L 22,4 M 4,4 L 4,22" fill="none" stroke="#0D3B24" stroke-width="1.5" stroke-linecap="round"/>
                    <circle cx="0" cy="0" r="3" fill="#0D3B24" stroke="#C6A15B" stroke-width="1.2" />
                    <path d="M 8,8 Q 18,4 20,0" fill="none" stroke="#C6A15B" stroke-width="1" />
                    <path d="M 8,8 Q 4,18 0,20" fill="none" stroke="#C6A15B" stroke-width="1" />
                </g>

                <!-- Bottom-Left Corner Botanical Flourish -->
                <g class="corner-bl" transform="translate(29, 678) scale(1, -1)">
                    <path d="M 0,0 L 32,0 M 0,0 L 0,32" fill="none" stroke="#C6A15B" stroke-width="2.5" stroke-linecap="round"/>
                    <path d="M 4,4 L 22,4 M 4,4 L 4,22" fill="none" stroke="#0D3B24" stroke-width="1.5" stroke-linecap="round"/>
                    <circle cx="0" cy="0" r="3" fill="#0D3B24" stroke="#C6A15B" stroke-width="1.2" />
                    <path d="M 8,8 Q 18,4 20,0" fill="none" stroke="#C6A15B" stroke-width="1" />
                    <path d="M 8,8 Q 4,18 0,20" fill="none" stroke="#C6A15B" stroke-width="1" />
                </g>

                <!-- Bottom-Right Corner Botanical Flourish -->
                <g class="corner-br" transform="translate(971, 678) scale(-1, -1)">
                    <path d="M 0,0 L 32,0 M 0,0 L 0,32" fill="none" stroke="#C6A15B" stroke-width="2.5" stroke-linecap="round"/>
                    <path d="M 4,4 L 22,4 M 4,4 L 4,22" fill="none" stroke="#0D3B24" stroke-width="1.5" stroke-linecap="round"/>
                    <circle cx="0" cy="0" r="3" fill="#0D3B24" stroke="#C6A15B" stroke-width="1.2" />
                    <path d="M 8,8 Q 18,4 20,0" fill="none" stroke="#C6A15B" stroke-width="1" />
                    <path d="M 8,8 Q 4,18 0,20" fill="none" stroke="#C6A15B" stroke-width="1" />
                </g>
            </svg>

            <div class="cert-content-inner">
                <!-- 1. URVI Logo & Header Branding -->
                <div class="cert-brand-header">
                    <img src="../assets/logo.png" class="cert-brand-logo" alt="URVI Logo">
                    <h2 class="cert-brand-title">URVI</h2>
                    <span class="cert-brand-sub">A GREENERY ORGANIZATION</span>
                    <span class="cert-brand-tagline">CONNECT • CARE • CONSERVE</span>
                </div>

                <!-- 2. Award Headline -->
                <div class="cert-title-section">
                    <h1 class="cert-type-headline">${certTitle}</h1>
                    <div class="cert-presentation-text">THIS CERTIFICATE IS PROUDLY PRESENTED TO</div>
                </div>

                <!-- 3. Recipient Name & Username -->
                <div class="cert-recipient-section">
                    <h2 class="cert-recipient-name">${c.recipientName}</h2>
                    <span class="cert-username-handle">@${c.username}</span>
                    <div class="cert-recipient-divider"></div>
                </div>

                <!-- 4. Dynamic Achievement Description -->
                <div class="cert-description-box">
                    ${c.description}
                </div>

                <!-- 5. Event & Date Metadata -->
                <div class="cert-event-meta-row">
                    <span class="cert-meta-item">EVENT / INITIATIVE: <strong>${c.eventName}</strong></span>
                    <span style="color:#C6A15B;">•</span>
                    <span class="cert-meta-item">DATE OF ISSUANCE: <strong>${c.issueDate}</strong></span>
                </div>

                <!-- 6. Signatures & Bottom URVI Emblem -->
                <div class="cert-bottom-row">
                    <!-- 1. Founder Signature (Dasari Sai Balaji) -->
                    <div class="cert-sig-block">
                        <div class="cert-sig-img-wrap">
                            <img src="../assets/signatures/founder-signature.png" class="cert-sig-img" alt="Founder Signature" onerror="this.onerror=null; this.src='../assets/signatures/founder-signature.svg';">
                        </div>
                        <div class="cert-sig-line"></div>
                        <div class="cert-sig-name">${c.founderName || "Dasari Sai Balaji"}</div>
                        <div class="cert-sig-title">Founder & President</div>
                    </div>

                    <!-- 2. Co-Founder Signature (J.V.N.H Amarnath) -->
                    <div class="cert-sig-block">
                        <div class="cert-sig-img-wrap">
                            <img src="../assets/signatures/cofounder2-signature.png" class="cert-sig-img" alt="Co-Founder Signature" onerror="this.onerror=null; this.src='../assets/signatures/cofounder2-signature.svg';">
                        </div>
                        <div class="cert-sig-line"></div>
                        <div class="cert-sig-name">${c.coFounder2Name || "J.V.N.H Amarnath"}</div>
                        <div class="cert-sig-title">Co-Founder & Social Media Head</div>
                    </div>

                    <!-- 3. Clean URVI Official Seal -->
                    <div class="cert-seal-wrap">
                        <div class="cert-emblem-badge" title="URVI Verified Official Document">
                            <img src="../assets/logo.png" class="cert-emblem-logo" alt="URVI Official Emblem">
                            <span class="cert-emblem-text">OFFICIAL SEAL</span>
                        </div>
                    </div>

                    <!-- 4. Co-Founder Signature (Nakka Sai Suchit) -->
                    <div class="cert-sig-block">
                        <div class="cert-sig-img-wrap">
                            <img src="../assets/signatures/cofounder-signature.png" class="cert-sig-img" alt="Co-Founder Signature" onerror="this.onerror=null; this.src='../assets/signatures/cofounder-signature.svg';">
                        </div>
                        <div class="cert-sig-line"></div>
                        <div class="cert-sig-name">${c.coFounderName || "Nakka Sai Suchit"}</div>
                        <div class="cert-sig-title">Co-Founder</div>
                    </div>
                </div>

                <!-- 7. Security ID & Verification Bar -->
                <div class="cert-verification-footer">
                    <div class="cert-id-tag">
                        <span>CERTIFICATE ID:</span> <strong>${c.certificateId}</strong>
                    </div>
                    <span style="color:#C6A15B;">•</span>
                    <div class="cert-verify-url">
                        VERIFIABLE DIGITAL CREDENTIAL • <span>urvi-earth.vercel.app/verify.html?id=${c.certificateId}</span>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// ── Global Interactive Handlers ──

/** Open Certificate Modal Preview */
window.viewCertModal = function (certId) {
    const cert = userCertificatesStore[certId];
    if (!cert) return;

    const modalEl = document.getElementById("certPreviewModal");
    const bodyEl = document.getElementById("certPreviewModalBody");
    if (!modalEl || !bodyEl) return;

    bodyEl.innerHTML = `
        <div style="overflow-x:auto; padding: 8px 0;">
            <div style="min-width:1000px; display:inline-block;">
                ${renderCertificateHTML(cert)}
            </div>
        </div>
        <div class="d-flex align-items-center justify-content-center gap-3 mt-3 flex-wrap">
            <button type="button" class="btn btn-success rounded-pill px-4 py-2 fw-semibold" onclick="window.downloadCertPNG('${cert.certificateId}')">
                <i class="bi bi-image me-1"></i> Download High-Res PNG
            </button>
            <button type="button" class="btn btn-outline-light rounded-pill px-4 py-2 fw-semibold" onclick="window.downloadCertPDF('${cert.certificateId}')">
                <i class="bi bi-file-earmark-pdf-fill me-1"></i> Download A4 Landscape PDF
            </button>
        </div>
    `;

    const bsModal = window.bootstrap ? (bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl)) : null;
    if (bsModal) bsModal.show();
};

/** Helper to capture certificate canvas with exact 1:1 preview fidelity */
async function captureCertificateCanvas(certId, cert) {
    // 1. Ensure all custom Google fonts are fully loaded
    if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
    }

    // 2. Use dedicated offscreen export wrapper for clean, scroll-free capture
    const scratch = document.getElementById("certExportNodeWrapper") || document.body;
    const tempDiv = document.createElement("div");
    tempDiv.style.position = "fixed";
    tempDiv.style.left = "-9999px";
    tempDiv.style.top = "0px";
    tempDiv.style.width = "1000px";
    tempDiv.style.height = "707px";
    tempDiv.style.zIndex = "-9999";
    tempDiv.style.overflow = "hidden";
    tempDiv.innerHTML = renderCertificateHTML(cert);
    scratch.appendChild(tempDiv);

    const canvasNode = tempDiv.querySelector(".urvi-certificate-canvas");

    try {
        // 3. Ensure all images (emblem, signatures) are fully decoded
        const images = Array.from(canvasNode.querySelectorAll("img"));
        await Promise.all(images.map(img => {
            if (img.complete && img.naturalWidth > 0) return Promise.resolve();
            return new Promise(res => {
                img.onload = res;
                img.onerror = res;
            });
        }));

        // 4. Capture at 3x scale (300 DPI ultra-high definition)
        const canvas = await html2canvas(canvasNode, {
            scale: 3,
            useCORS: true,
            allowTaint: true,
            backgroundColor: "#FAF8F2",
            width: 1000,
            height: 707,
            scrollX: 0,
            scrollY: 0,
            logging: false
        });

        return canvas;
    } finally {
        if (tempDiv.parentNode) {
            tempDiv.parentNode.removeChild(tempDiv);
        }
    }
}

/** Download Certificate as High-Res PNG (Fired strictly on click) */
window.downloadCertPNG = async function (certId) {
    const cert = userCertificatesStore[certId];
    if (!cert) return;

    try {
        const canvas = await captureCertificateCanvas(certId, cert);
        const link = document.createElement("a");
        link.download = `URVI-Certificate-${cert.certificateType}-${cert.certificateId}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
    } catch (err) {
        console.error("PNG Exporter error:", err);
        alert("Failed to export PNG certificate: " + err.message);
    }
};

/** Download Certificate as A4 Landscape PDF (Fired strictly on click) */
window.downloadCertPDF = async function (certId) {
    const cert = userCertificatesStore[certId];
    if (!cert) return;

    try {
        const canvas = await captureCertificateCanvas(certId, cert);
        const imgData = canvas.toDataURL("image/png");
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({
            orientation: "landscape",
            unit: "mm",
            format: "a4"
        });

        const pdfWidth = pdf.internal.pageSize.getWidth(); // 297mm
        const pdfHeight = pdf.internal.pageSize.getHeight(); // 210mm

        pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight, undefined, "FAST");
        pdf.save(`URVI-Certificate-${cert.certificateType}-${cert.certificateId}.pdf`);
    } catch (err) {
        console.error("PDF Exporter error:", err);
        alert("Failed to export PDF certificate: " + err.message);
    }
};
