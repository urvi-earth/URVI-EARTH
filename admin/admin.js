/* =====================================================
   URVI – admin.js | Complete Master Admin Control Panel
   ===================================================== */
import { db, ref, get, child, set, update, remove, push } from "../config.js";
import { uploadToCloudinary, deleteFromCloudinary, extractPublicIdFromUrl } from "../cloudinary.js";
import { validateUsername } from "../components/profanity-filter.js";

let currentUserId = null;
let cachedUsersData = {};
let cachedEventsData = {};
let cachedSupportData = {};
let cachedPostsData = {};

document.addEventListener("DOMContentLoaded", () => {
    setupAdminLoginForm();
    setupAdminLogout();
    checkAdminAccess();
});

// ── Hardened Admin Authentication via Dedicated RTDB "admins" Root ──
function setupAdminLoginForm() {
    const form = document.getElementById("admin-login-form");
    const feedback = document.getElementById("admin-login-feedback");
    const loginBtn = document.getElementById("btn-admin-login");
    if (!form) return;

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (feedback) feedback.classList.add("d-none");
        const userIdInput = document.getElementById("admin-input-userid")?.value.trim();
        const passInput = document.getElementById("admin-input-pass")?.value.trim();

        if (!userIdInput || !passInput) {
            showAdminFeedback("Please enter both Admin ID and Master Passcode.", "danger");
            return;
        }

        loginBtn.disabled = true;
        loginBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Verifying Admin Access...`;

        try {
            // Query exclusively from the secure "admins" node in Firebase RTDB
            let adminRecord = null;
            let adminKey = userIdInput;

            const adminSnap = await get(child(ref(db), `admins/${userIdInput}`));
            if (adminSnap.exists()) {
                adminRecord = adminSnap.val();
                adminKey = userIdInput;
            } else {
                // Search admins node for matching username or email
                const allAdminsSnap = await get(child(ref(db), "admins"));
                if (allAdminsSnap.exists()) {
                    const adminsList = allAdminsSnap.val();
                    for (const [k, a] of Object.entries(adminsList)) {
                        if (
                            k.toLowerCase() === userIdInput.toLowerCase() ||
                            (a.username && a.username.toLowerCase() === userIdInput.toLowerCase()) ||
                            (a.email && a.email.toLowerCase() === userIdInput.toLowerCase())
                        ) {
                            adminRecord = a;
                            adminKey = k;
                            break;
                        }
                    }
                }
            }

            // Strict Verification against Database Record
            if (!adminRecord) {
                showAdminFeedback("❌ Access Denied: Unauthorized Account.", "danger");
                return;
            }

            const expectedPass = adminRecord.password || adminRecord.passcode || adminRecord.pin;
            if (!expectedPass || String(expectedPass) !== passInput) {
                showAdminFeedback("❌ Access Denied: Incorrect Master Passcode.", "danger");
                return;
            }

            // Issue 2-Hour Scoped Session in sessionStorage
            const sessionData = {
                adminKey: adminKey,
                username: adminRecord.username || adminKey,
                role: adminRecord.role || "super_admin",
                token: btoa(`${adminKey}:${Date.now()}`),
                loginTime: Date.now(),
                expiresAt: Date.now() + (2 * 60 * 60 * 1000)
            };

            sessionStorage.setItem("urvi_admin_session", JSON.stringify(sessionData));
            currentUserId = adminKey;

            // Log Successful Admin Login in Audit Trail
            await logAdminAction("ADMIN_SESSION_AUTH", adminKey, `Master Admin '${sessionData.username}' authenticated successfully.`);

            // Reveal Dashboard
            document.getElementById("admin-auth-overlay").style.display = "none";
            document.getElementById("admin-main-wrapper").style.display = "flex";
            initAdminDashboard();

        } catch (err) {
            console.error("Admin login error:", err);
            showAdminFeedback("Authentication error: " + err.message, "danger");
        } finally {
            loginBtn.disabled = false;
            loginBtn.innerHTML = `<i class="bi bi-box-arrow-in-right me-1"></i> Authorize Admin Session`;
        }
    });

    function showAdminFeedback(msg, type = "danger") {
        if (!feedback) return;
        feedback.className = `alert alert-${type} text-center py-2 mb-3 small`;
        feedback.innerText = msg;
        feedback.classList.remove("d-none");
    }
}

// ── Check Admin Session Validity against Dedicated "admins" Root ──
async function checkAdminAccess() {
    const authOverlay = document.getElementById("admin-auth-overlay");
    const mainWrapper = document.getElementById("admin-main-wrapper");

    const rawSession = sessionStorage.getItem("urvi_admin_session");
    if (!rawSession) {
        lockAdminDashboard();
        return;
    }

    try {
        const session = JSON.parse(rawSession);

        // Check if session has expired
        if (!session.adminKey || !session.expiresAt || Date.now() > session.expiresAt) {
            sessionStorage.removeItem("urvi_admin_session");
            lockAdminDashboard();
            return;
        }

        // Live Re-Verification strictly against RTDB "admins" node
        const adminSnap = await get(child(ref(db), `admins/${session.adminKey}`));
        if (!adminSnap.exists()) {
            sessionStorage.removeItem("urvi_admin_session");
            lockAdminDashboard();
            return;
        }

        // Valid Active Admin Session
        currentUserId = session.adminKey;
        if (authOverlay) authOverlay.style.display = "none";
        if (mainWrapper) mainWrapper.style.display = "flex";
        initAdminDashboard();

    } catch (e) {
        console.error("Admin check error:", e);
        lockAdminDashboard();
    }
}

function lockAdminDashboard() {
    const authOverlay = document.getElementById("admin-auth-overlay");
    const mainWrapper = document.getElementById("admin-main-wrapper");
    if (authOverlay) authOverlay.style.display = "flex";
    if (mainWrapper) mainWrapper.style.display = "none";
}

function setupAdminLogout() {
    const logoutBtn = document.getElementById("btn-admin-logout");
    logoutBtn?.addEventListener("click", () => {
        if (!confirm("Are you sure you want to lock and exit this Admin session?")) return;
        sessionStorage.removeItem("urvi_admin_session");
        currentUserId = null;
        lockAdminDashboard();
    });
}

function initAdminDashboard() {
    setupTabNavigation();
    loadDashboardStats();
    loadEventsTab();
    loadCertificatesTab();
    loadUsersTab();
    loadPostsTab();
    loadSettingsTab();
    loadSupportTab();
    loadDeletionsQueueTab();
    loadAuditLogTab();

    document.getElementById("btn-refresh-stats")?.addEventListener("click", () => {
        loadDashboardStats();
        loadEventsTab();
        loadCertificatesTab();
        loadUsersTab();
    });
}

function setupTabNavigation() {
    document.querySelectorAll(".admin-nav-item").forEach(item => {
        item.addEventListener("click", () => {
            const target = item.dataset.tab;
            if (!target) return;

            document.querySelectorAll(".admin-nav-item").forEach(i => i.classList.remove("active"));
            document.querySelectorAll(".admin-tab-section").forEach(s => s.classList.add("d-none"));

            item.classList.add("active");
            document.getElementById(`tab-${target}`)?.classList.remove("d-none");
        });
    });
}

/** Log admin action into RTDB audit trail */
async function logAdminAction(actionType, targetId, summary) {
    try {
        const auditRef = push(ref(db, "adminActions"));
        await set(auditRef, {
            adminId: currentUserId || "urvi.earth",
            action: actionType,
            targetId: targetId || "",
            summary: summary || "",
            timestamp: Date.now()
        });
    } catch (e) {
        console.warn("Log admin action error:", e);
    }
}

// -----------------------------------------------------------------
// 1. Dashboard Overview Stats
// -----------------------------------------------------------------
async function loadDashboardStats() {
    try {
        const [uSnap, eSnap, pSnap, sSnap] = await Promise.all([
            get(child(ref(db), "users")),
            get(child(ref(db), "events")),
            get(child(ref(db), "community/posts")),
            get(child(ref(db), "support_requests"))
        ]);

        let userCount = 0;
        let pendingDelCount = 0;
        let totalTrees = 0;
        let totalContrib = 0;
        let totalPoints = 0;

        if (uSnap.exists()) {
            cachedUsersData = uSnap.val();
            const users = Object.values(cachedUsersData);
            userCount = users.length;
            users.forEach(u => {
                if (u.status === "pending_deletion") pendingDelCount++;
                totalTrees += (u.trees_planted || 0);
                totalContrib += (u.contributions || 0);
                totalPoints += (u.points || 0);
            });
        }

        document.getElementById("stat-users").innerText = userCount;
        document.getElementById("stat-deletions").innerText = pendingDelCount;
        document.getElementById("nav-del-count").innerText = pendingDelCount;
        document.getElementById("stat-trees").innerText = totalTrees;
        document.getElementById("stat-contrib").innerText = totalContrib;
        document.getElementById("stat-points").innerText = totalPoints;

        let activeEventsCount = 0;
        if (eSnap.exists()) {
            cachedEventsData = eSnap.val();
            activeEventsCount = Object.values(cachedEventsData).filter(e => e.status !== "cancelled").length;
        }
        document.getElementById("stat-events").innerText = activeEventsCount;

        let postsCount = 0;
        if (pSnap.exists()) {
            cachedPostsData = pSnap.val();
            postsCount = Object.keys(cachedPostsData).length;
        }
        document.getElementById("stat-posts").innerText = postsCount;

        let unresolvedSupport = 0;
        if (sSnap.exists()) {
            cachedSupportData = sSnap.val();
            unresolvedSupport = Object.values(cachedSupportData).filter(s => s.status === "unresolved" || s.status === "open").length;
        }
        document.getElementById("stat-support").innerText = unresolvedSupport;

    } catch (e) {
        console.error("Dashboard stats load error:", e);
    }
}

// -----------------------------------------------------------------
// 2. Events & Campaigns CRUD & Participant Attendance
// -----------------------------------------------------------------
async function loadEventsTab() {
    const eventsListEl = document.getElementById("admin-events-list");
    const form = document.getElementById("event-crud-form");
    if (!eventsListEl) return;

    form?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const editId = document.getElementById("evt-edit-id").value;
        const title = document.getElementById("evt-title").value.trim();
        const category = document.getElementById("evt-category").value;
        const location = document.getElementById("evt-location").value.trim();
        const eventDate = document.getElementById("evt-date").value;
        const deadline = document.getElementById("evt-deadline").value;
        const points = parseInt(document.getElementById("evt-points").value, 10) || 100;
        const maxCapacity = parseInt(document.getElementById("evt-max-capacity").value, 10) || 0;
        const status = document.getElementById("evt-status").value;
        const description = document.getElementById("evt-desc").value.trim();
        const bannerFile = document.getElementById("evt-banner").files[0];
        const submitBtn = document.getElementById("evt-submit-btn");

        submitBtn.disabled = true;
        submitBtn.innerText = editId ? "Updating..." : "Publishing...";

        try {
            let bannerUrl = "";
            if (bannerFile) {
                bannerUrl = await uploadToCloudinary(bannerFile);
            }

            const eventId = editId || `event_${Date.now()}`;
            const deadlineTimestamp = deadline ? new Date(deadline).getTime() : 0;

            const certificateBody = document.getElementById("evt-cert-body")?.value.trim() || "";
            const eventPayload = {
                title, category, description, certificateBody, location, eventDate,
                deadline, deadlineTimestamp, points, maxCapacity, status,
                updatedAt: Date.now()
            };

            if (!editId) {
                eventPayload.createdAt = Date.now();
                eventPayload.createdBy = currentUserId;
                eventPayload.participantsCount = 0;
            }

            if (bannerUrl) {
                eventPayload.bannerUrl = bannerUrl;
            }

            await update(ref(db, `events/${eventId}`), eventPayload);
            await logAdminAction(editId ? "EVENT_UPDATE" : "EVENT_CREATE", eventId, `Campaign event ${editId ? 'updated' : 'created'}: ${title}`);

            alert(`Campaign Event ${editId ? 'Updated' : 'Published'} Successfully!`);
            form.reset();
            document.getElementById("evt-edit-id").value = "";
            document.getElementById("evt-submit-btn").innerText = "Publish Campaign Event";
            document.getElementById("evt-cancel-edit-btn").classList.add("d-none");
            loadEventsTab();
            loadCertificatesTab();
            loadDashboardStats();
        } catch (err) {
            console.error("Event publish error:", err);
            alert("Failed to save event: " + err.message);
        }
        submitBtn.disabled = false;
    });

    document.getElementById("evt-cancel-edit-btn")?.addEventListener("click", () => {
        form.reset();
        document.getElementById("evt-edit-id").value = "";
        document.getElementById("evt-submit-btn").innerText = "Publish Campaign Event";
        document.getElementById("evt-cancel-edit-btn").classList.add("d-none");
    });

    try {
        const eSnap = await get(child(ref(db), "events"));
        if (!eSnap.exists()) {
            eventsListEl.innerHTML = `<p class="text-muted p-3">No active events found.</p>`;
            return;
        }

        const data = eSnap.val();
        eventsListEl.innerHTML = Object.keys(data).map(key => {
            const evt = data[key];
            const pCount = evt.participants ? Object.keys(evt.participants).length : 0;
            const statusBadgeClass = evt.status === "completed" ? "bg-primary" : evt.status === "cancelled" ? "bg-danger" : "bg-success";

            return `
                <div class="d-flex flex-column flex-md-row align-items-md-center justify-content-between p-3 border-bottom gap-2">
                    <div>
                        <span class="badge ${statusBadgeClass} me-2">${evt.status ? evt.status.toUpperCase() : "PUBLISHED"}</span>
                        <span class="badge bg-success-subtle text-success me-2">${evt.category || "Drive"}</span>
                        <strong class="text-dark fs-6">${evt.title}</strong>
                        <small class="d-block text-muted">Date: ${evt.eventDate} • Location: ${evt.location} • Points: ${evt.points || 100} • Participants: <strong>${pCount}</strong></small>
                        ${evt.certificateBody ? `<small class="d-block text-success fw-semibold mt-1"><i class="bi bi-award-fill me-1"></i>Custom Certificate Body Enabled</small>` : ''}
                    </div>
                    <div class="d-flex align-items-center gap-2 flex-wrap">
                        <button type="button" class="btn btn-outline-info btn-sm rounded-pill btn-partic-event" data-id="${key}">
                            <i class="bi bi-people-fill me-1"></i> Attendance (${pCount})
                        </button>
                        <button type="button" class="btn btn-outline-primary btn-sm rounded-pill btn-edit-event" data-id="${key}">
                            <i class="bi bi-pencil-square"></i> Edit
                        </button>
                        <button type="button" class="btn btn-outline-danger btn-sm rounded-pill btn-del-event" data-id="${key}">
                            <i class="bi bi-trash"></i> Delete
                        </button>
                    </div>
                </div>
            `;
        }).join("");

        // Bind Event Buttons
        document.querySelectorAll(".btn-edit-event").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const id = e.currentTarget.dataset.id;
                const evt = data[id];
                if (!evt) return;

                document.getElementById("evt-edit-id").value = id;
                document.getElementById("evt-title").value = evt.title || "";
                document.getElementById("evt-category").value = evt.category || "Tree Plantation";
                document.getElementById("evt-location").value = evt.location || "";
                document.getElementById("evt-date").value = evt.eventDate || "";
                document.getElementById("evt-deadline").value = evt.deadline || "";
                document.getElementById("evt-points").value = evt.points || 100;
                document.getElementById("evt-max-capacity").value = evt.maxCapacity || 0;
                document.getElementById("evt-status").value = evt.status || "published";
                document.getElementById("evt-desc").value = evt.description || "";
                document.getElementById("evt-cert-body").value = evt.certificateBody || evt.certBody || "";

                document.getElementById("evt-submit-btn").innerText = "Update Campaign Event";
                document.getElementById("evt-cancel-edit-btn").classList.remove("d-none");
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });
        });

        document.querySelectorAll(".btn-del-event").forEach(btn => {
            btn.addEventListener("click", async (e) => {
                const id = e.currentTarget.dataset.id;
                if (!confirm("Permanently delete this campaign event?")) return;
                await remove(ref(db, `events/${id}`));
                await logAdminAction("EVENT_DELETE", id, "Deleted campaign event.");
                loadEventsTab();
                loadDashboardStats();
            });
        });

        // Open Event Participants Modal
        document.querySelectorAll(".btn-partic-event").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const id = e.currentTarget.dataset.id;
                openEventParticipantsModal(id, data[id]);
            });
        });

    } catch (e) {
        console.error("Load events error:", e);
    }
}

async function openEventParticipantsModal(eventId, eventData) {
    const modalEl = document.getElementById("adminEventParticipantsModal");
    const container = document.getElementById("partic-list-container");
    document.getElementById("partic-evt-id").value = eventId;
    document.getElementById("eventParticTitle").innerText = `Participants: ${eventData.title}`;

    const participants = eventData.participants || {};
    const uids = Object.keys(participants);

    if (uids.length === 0) {
        container.innerHTML = `<p class="text-muted p-4 text-center">No volunteers have joined this campaign yet.</p>`;
    } else {
        container.innerHTML = `
            <div class="table-responsive">
                <table class="table align-middle">
                    <thead>
                        <tr>
                            <th>Volunteer</th>
                            <th>Status</th>
                            <th>Mark Attendance</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${uids.map(uid => {
                            const pState = typeof participants[uid] === "object" ? participants[uid].attendance || "Joined" : (participants[uid] === true ? "Joined" : "Joined");
                            return `
                                <tr>
                                    <td><strong>@${uid}</strong></td>
                                    <td><span class="badge ${pState === 'Participated' ? 'bg-success' : pState === 'Absent' ? 'bg-secondary' : 'bg-info'}">${pState}</span></td>
                                    <td>
                                        <select class="form-select form-select-sm partic-status-select" data-uid="${uid}">
                                            <option value="Joined" ${pState === 'Joined' ? 'selected' : ''}>Registered</option>
                                            <option value="Participated" ${pState === 'Participated' ? 'selected' : ''}>Participated (Award Points)</option>
                                            <option value="Absent" ${pState === 'Absent' ? 'selected' : ''}>Absent</option>
                                        </select>
                                    </td>
                                </tr>
                            `;
                        }).join("")}
                    </tbody>
                </table>
            </div>
        `;
    }

    const bsModal = new bootstrap.Modal(modalEl);
    bsModal.show();

    document.getElementById("btn-finalize-event-partic").onclick = async () => {
        const btn = document.getElementById("btn-finalize-event-partic");
        btn.disabled = true;
        btn.innerText = "Finalizing & Awarding Points...";

        try {
            const selects = container.querySelectorAll(".partic-status-select");
            const eventPoints = eventData.points || 100;

            for (const select of selects) {
                const targetUid = select.dataset.uid;
                const newStatus = select.value;
                const prevStatus = typeof participants[targetUid] === "object" ? participants[targetUid].attendance : "Joined";

                // Update participant record under event
                await update(ref(db, `events/${eventId}/participants/${targetUid}`), {
                    attendance: newStatus,
                    updatedAt: Date.now()
                });

                // If marked Participated for the first time, award points to user
                if (newStatus === "Participated" && prevStatus !== "Participated") {
                    const uSnap = await get(child(ref(db), `users/${targetUid}`));
                    if (uSnap.exists()) {
                        const u = uSnap.val();
                        const currPts = u.points || 0;
                        const currTrees = u.trees_planted || 0;
                        const addTrees = eventData.category === "Tree Plantation" ? 1 : 0;

                        await update(ref(db, `users/${targetUid}`), {
                            points: currPts + eventPoints,
                            trees_planted: currTrees + addTrees,
                            contributions: (u.contributions || 0) + 1
                        });

                        // Dispatch Notification to User
                        const notifRef = push(ref(db, `notifications/${targetUid}`));
                        await set(notifRef, {
                            title: "Points Awarded! 🌿",
                            message: `You earned ${eventPoints} Eco Points for participating in "${eventData.title}".`,
                            type: "points_awarded",
                            timestamp: Date.now(),
                            read: false
                        });

                        // Issue formal digital certificate record
                        const recipientName = `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.user_id || targetUid;
                        const eventTitle = eventData.title || "URVI Clean & Green Initiative";
                        const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
                        
                        let certBody = eventData.certificateBody || eventData.certBody || "";
                        if (!certBody || !certBody.trim()) {
                            certBody = `In recognition of distinguished dedication and active participation in the "${eventTitle}" environmental initiative. Awarded for exemplary stewardship toward carbon reduction, biodiversity preservation, and advancing a greener planet.`;
                        } else {
                            certBody = certBody
                                .replace(/{recipientName}/g, recipientName)
                                .replace(/{recipient}/g, recipientName)
                                .replace(/{eventName}/g, eventTitle)
                                .replace(/{eventTitle}/g, eventTitle)
                                .replace(/{eventDate}/g, eventData.eventDate || today)
                                .replace(/{issueDate}/g, today)
                                .replace(/{username}/g, u.user_id || targetUid);
                        }

                        const certId = `URVI-2026-PART-${Math.floor(100000 + Math.random() * 900000)}`;
                        await set(ref(db, `certificates/${targetUid}/${certId}`), {
                            certificateId: certId,
                            certId: certId,
                            userId: targetUid,
                            recipientName: recipientName,
                            username: u.user_id || targetUid,
                            certificateType: "PARTICIPATION",
                            eventName: eventTitle,
                            eventDate: eventData.eventDate || today,
                            issueDate: today,
                            description: certBody,
                            founderName: "Dasari Sai Balaji",
                            coFounder2Name: "J.V.N.H Amarnath",
                            coFounderName: "Nakka Sai Suchit",
                            status: "issued",
                            createdAt: Date.now()
                        });

                        // Award Tree XP — 1) Event completion (+50)
                        await awardTreeXP(targetUid, 50, "event_completion", eventId, `Completed "${eventData.title}"`);

                        // Award Tree XP — 2) Tree verified (+100) if category is Tree Plantation
                        if (eventData.category === "Tree Plantation") {
                            await awardTreeXP(targetUid, 100, "tree_verified", eventId, `Verified tree planted at "${eventData.title}"`);
                        }

                        // Award Tree XP — 3) Certificate awarded (+20)
                        await awardTreeXP(targetUid, 20, "certificate_awarded", certId, `Certificate awarded for "${eventData.title}"`);
                    }
                }
            }

            await update(ref(db, `events/${eventId}`), { status: "completed" });
            await logAdminAction("EVENT_FINALIZE", eventId, `Finalized participation & awarded points for "${eventData.title}".`);

            alert("Attendance finalized, points awarded, and certificates issued!");
            bsModal.hide();
            loadEventsTab();
            loadCertificatesTab();
            loadDashboardStats();

        } catch (err) {
            console.error("Finalize attendance error:", err);
            alert("Error: " + err.message);
        }
        btn.disabled = false;
        btn.innerText = "Finalize Participation & Award Points";
    };
}

// -----------------------------------------------------------------
// 2B. Official Certificate Studio & Dynamic Body Citation Manager
// -----------------------------------------------------------------
let cachedAdminCerts = [];

async function loadCertificatesTab() {
    const templatesContainer = document.getElementById("admin-event-cert-templates-list");
    const certsTableBody = document.getElementById("admin-certs-table-body");
    const searchInput = document.getElementById("cert-search-input");
    if (!templatesContainer && !certsTableBody) return;

    try {
        // 1. Fetch Events for Certificate Templates
        const eventsSnap = await get(child(ref(db), "events"));
        if (templatesContainer) {
            if (!eventsSnap.exists()) {
                templatesContainer.innerHTML = `<p class="text-muted small m-0 p-3">No events created yet.</p>`;
            } else {
                const events = eventsSnap.val();
                templatesContainer.innerHTML = Object.keys(events).map(eventId => {
                    const evt = events[eventId];
                    const defaultCitation = `In recognition of distinguished dedication and active participation in the "${evt.title || 'Event'}" environmental initiative. Awarded for exemplary stewardship toward carbon reduction, biodiversity preservation, and advancing a greener planet.`;
                    const hasCustom = Boolean(evt.certificateBody && evt.certificateBody.trim());
                    const currentBody = hasCustom ? evt.certificateBody : defaultCitation;

                    return `
                        <div class="p-3 border rounded-3 mb-3 bg-light bg-opacity-50">
                            <div class="d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-2 mb-2">
                                <div>
                                    <strong class="text-dark fs-6">${evt.title || "Untitled Event"}</strong>
                                    <span class="badge bg-success-subtle text-success ms-2">${evt.category || "Drive"}</span>
                                    ${hasCustom ? `<span class="badge bg-success ms-1">Custom Template</span>` : `<span class="badge bg-secondary ms-1">Default Template</span>`}
                                </div>
                                <button type="button" class="btn btn-sm btn-outline-success rounded-pill px-3 btn-edit-event-cert-body" data-id="${eventId}">
                                    <i class="bi bi-pencil-square me-1"></i> Edit Event Certificate Body
                                </button>
                            </div>
                            <div class="p-2 bg-white rounded border small text-secondary font-monospace" style="font-size:12px; line-height:1.5;">
                                ${currentBody}
                            </div>
                        </div>
                    `;
                }).join("");

                // Bind Event Template Edit Buttons
                document.querySelectorAll(".btn-edit-event-cert-body").forEach(btn => {
                    btn.addEventListener("click", async (e) => {
                        const eventId = e.currentTarget.dataset.id;
                        const evt = events[eventId];
                        if (!evt) return;

                        const defaultCitation = `In recognition of distinguished dedication and active participation in the "${evt.title || 'Event'}" environmental initiative. Awarded for exemplary stewardship toward carbon reduction, biodiversity preservation, and advancing a greener planet.`;
                        const currentBody = evt.certificateBody || defaultCitation;

                        const newBody = prompt(`Edit Certificate Body Citation for event:\n"${evt.title}"\n\n(Placeholders supported: {recipientName}, {eventName}, {eventDate}, {issueDate})`, currentBody);
                        if (newBody !== null) {
                            await update(ref(db, `events/${eventId}`), { certificateBody: newBody.trim() });
                            await logAdminAction("EVENT_CERT_BODY_UPDATE", eventId, `Updated certificate template body for "${evt.title}"`);
                            alert("Event Certificate Body updated successfully!");
                            loadCertificatesTab();
                            loadEventsTab();
                        }
                    });
                });
            }
        }

        // 2. Fetch All Issued Certificates Across All Users
        const certsSnap = await get(child(ref(db), "certificates"));
        cachedAdminCerts = [];

        if (certsSnap.exists()) {
            const rawCerts = certsSnap.val();
            Object.keys(rawCerts).forEach(userKey => {
                const userNode = rawCerts[userKey];
                if (userNode && typeof userNode === "object") {
                    if (userNode.certificateId || userNode.certId) {
                        cachedAdminCerts.push(formatAdminCertItem(userKey, userKey, userNode));
                    } else {
                        Object.keys(userNode).forEach(certId => {
                            const c = userNode[certId];
                            if (c && typeof c === "object") {
                                cachedAdminCerts.push(formatAdminCertItem(userKey, certId, c));
                            }
                        });
                    }
                }
            });
        }

        renderAdminCertsTable(cachedAdminCerts);

        // Search Input Filter
        if (searchInput) {
            searchInput.oninput = () => {
                const q = searchInput.value.trim().toLowerCase();
                const filtered = cachedAdminCerts.filter(c => 
                    c.certificateId.toLowerCase().includes(q) ||
                    c.recipientName.toLowerCase().includes(q) ||
                    c.username.toLowerCase().includes(q) ||
                    c.eventName.toLowerCase().includes(q) ||
                    c.description.toLowerCase().includes(q)
                );
                renderAdminCertsTable(filtered);
            };
        }

    } catch (err) {
        console.error("loadCertificatesTab error:", err);
    }
}

function formatAdminCertItem(userKey, certId, c) {
    let certType = (c.certificateType || c.type || "PARTICIPATION").toUpperCase();
    let eventName = c.eventName || c.eventTitle || c.title || "URVI Initiative";
    const recipientName = c.recipientName || c.recipient || userKey;
    const username = c.username || c.handle || c.userId || userKey;

    let description = c.description || c.reason || "";
    if (eventName.includes("Green Champion") || (description && description.includes("Green Champion"))) {
        eventName = "URVI Induction & Membership";
        certType = "MEMBERSHIP";
        description = `In formal recognition of joining URVI (A Greenery Organization) and dedicating your pledge toward environmental conservation, tree plantation, carbon reduction, and ecological stewardship for our Mother Earth.`;
    } else if (!description) {
        description = `In recognition of distinguished dedication and active participation in the "${eventName}" environmental initiative. Awarded for exemplary stewardship toward carbon reduction, biodiversity preservation, and advancing a greener planet.`;
    }

    const realCertId = c.certificateId || c.certId || certId;
    const realUid = c.userId || userKey;

    return {
        key: certId,
        certificateId: realCertId,
        userId: realUid,
        targetUid: userKey,
        recipientName: recipientName,
        username: username,
        certificateType: certType,
        eventName: eventName,
        eventDate: c.eventDate || c.issueDate || "—",
        issueDate: c.issueDate || "—",
        description: description,
        founderName: (!c.founderName || c.founderName === "Sharoon Kasipeta") ? "Dasari Sai Balaji" : c.founderName,
        coFounder2Name: c.coFounder2Name || c.coFounderAmarnath || "J.V.N.H Amarnath",
        coFounderName: (!c.coFounderName || c.coFounderName === "URVI Directorate") ? "Nakka Sai Suchit" : c.coFounderName,
        status: c.status || "issued"
    };
}

function renderAdminCertsTable(certs) {
    const tbody = document.getElementById("admin-certs-table-body");
    if (!tbody) return;

    if (certs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4">No certificates found.</td></tr>`;
        return;
    }

    tbody.innerHTML = certs.map(c => `
        <tr>
            <td>
                <span class="badge bg-success font-monospace mb-1">${c.certificateId}</span>
                <span class="d-block small text-muted font-monospace">${c.certificateType}</span>
            </td>
            <td>
                <strong class="text-dark">${c.recipientName}</strong>
                <small class="d-block text-muted">@${c.username}</small>
            </td>
            <td>
                <span class="fw-semibold text-dark">${c.eventName}</span>
            </td>
            <td>
                <small class="text-secondary">${c.issueDate}</small>
            </td>
            <td style="max-width:320px;">
                <div class="text-truncate small text-secondary" title="${c.description}">
                    ${c.description}
                </div>
            </td>
            <td>
                <div class="d-flex align-items-center gap-1">
                    <button type="button" class="btn btn-sm btn-outline-warning rounded-pill px-2 py-1 btn-edit-cert-body" data-uid="${c.targetUid}" data-cid="${c.certificateId}" title="Edit Certificate Body Citation">
                        <i class="bi bi-pencil-square"></i> Edit Body
                    </button>
                    <button type="button" class="btn btn-sm btn-outline-info rounded-pill px-2 py-1 btn-preview-cert" data-uid="${c.targetUid}" data-cid="${c.certificateId}" title="Preview Official Certificate">
                        <i class="bi bi-eye-fill"></i> Preview
                    </button>
                </div>
            </td>
        </tr>
    `).join("");

    // Bind Edit & Preview Buttons
    tbody.querySelectorAll(".btn-edit-cert-body").forEach(btn => {
        btn.addEventListener("click", () => {
            const uid = btn.dataset.uid;
            const cid = btn.dataset.cid;
            window.openEditCertBodyModal(uid, cid);
        });
    });

    tbody.querySelectorAll(".btn-preview-cert").forEach(btn => {
        btn.addEventListener("click", () => {
            const uid = btn.dataset.uid;
            const cid = btn.dataset.cid;
            window.adminPreviewCert(uid, cid);
        });
    });
}

// Global Handlers for Edit & Preview Modals
window.openEditCertBodyModal = function(uid, certId) {
    const cert = cachedAdminCerts.find(item => item.certificateId === certId || item.key === certId || (item.targetUid === uid && item.certificateId === certId));
    if (!cert) return;

    document.getElementById("edit-cert-target-uid").value = cert.targetUid || uid;
    document.getElementById("edit-cert-id").value = cert.certificateId || certId;
    document.getElementById("edit-cert-recipient-name").value = `${cert.recipientName} (@${cert.username})`;
    document.getElementById("edit-cert-event-name").value = cert.eventName;
    document.getElementById("edit-cert-founder-name").value = cert.founderName || "Dasari Sai Balaji";
    document.getElementById("edit-cert-cofounder2-name").value = cert.coFounder2Name || "J.V.N.H Amarnath";
    document.getElementById("edit-cert-cofounder-name").value = cert.coFounderName || "Nakka Sai Suchit";
    document.getElementById("edit-cert-description").value = cert.description;

    const modalEl = document.getElementById("editCertBodyModal");
    const bsModal = bootstrap.Modal.getOrCreateInstance(modalEl);
    if (bsModal) bsModal.show();

    // Reset button
    document.getElementById("btn-reset-cert-default-body").onclick = () => {
        document.getElementById("edit-cert-description").value = `In recognition of distinguished dedication and active participation in the "${cert.eventName}" environmental initiative. Awarded for exemplary stewardship toward carbon reduction, biodiversity preservation, and advancing a greener planet.`;
    };
};

// Form submit for Edit Certificate Body Modal
document.getElementById("form-edit-cert-body")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const uid = document.getElementById("edit-cert-target-uid").value;
    const certId = document.getElementById("edit-cert-id").value;
    const description = document.getElementById("edit-cert-description").value.trim();
    const founderName = document.getElementById("edit-cert-founder-name").value.trim() || "Dasari Sai Balaji";
    const coFounder2Name = document.getElementById("edit-cert-cofounder2-name")?.value.trim() || "J.V.N.H Amarnath";
    const coFounderName = document.getElementById("edit-cert-cofounder-name").value.trim() || "Nakka Sai Suchit";
    const saveBtn = document.getElementById("btn-save-cert-body");

    if (!description) {
        alert("Please enter a valid certificate body citation.");
        return;
    }

    saveBtn.disabled = true;
    saveBtn.innerText = "Saving...";

    try {
        await update(ref(db, `certificates/${uid}/${certId}`), {
            description,
            founderName,
            coFounder2Name,
            coFounderName,
            updatedAt: Date.now()
        });

        await logAdminAction("CERT_BODY_UPDATE", certId, `Updated certificate body for ${certId} (${uid})`);
        alert("Certificate Body Citation updated successfully!");

        const modalEl = document.getElementById("editCertBodyModal");
        const bsModal = bootstrap.Modal.getOrCreateInstance(modalEl);
        if (bsModal) bsModal.hide();

        loadCertificatesTab();
    } catch (err) {
        console.error("Save cert body error:", err);
        alert("Failed to save certificate body: " + err.message);
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = `<i class="bi bi-check-circle-fill me-1"></i> Save Certificate Body`;
    }
});

// Admin Live Preview Modal
window.adminPreviewCert = function(uid, certId) {
    const cert = cachedAdminCerts.find(item => item.certificateId === certId || item.key === certId || (item.targetUid === uid && item.certificateId === certId));
    if (!cert) return;

    const modalEl = document.getElementById("adminCertPreviewModal");
    const bodyEl = document.getElementById("adminCertPreviewModalBody");
    if (!modalEl || !bodyEl) return;

    bodyEl.innerHTML = `
        <div style="overflow-x:auto; padding: 8px 0;">
            <div style="min-width:1000px; display:inline-block;">
                ${renderAdminLandscapeCertHTML(cert)}
            </div>
        </div>
    `;

    const bsModal = bootstrap.Modal.getOrCreateInstance(modalEl);
    if (bsModal) bsModal.show();
};

function renderAdminLandscapeCertHTML(c) {
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
                <div class="cert-brand-header">
                    <img src="../assets/logo.png" class="cert-brand-logo" alt="URVI Logo">
                    <h2 class="cert-brand-title">URVI</h2>
                    <span class="cert-brand-sub">A GREENERY ORGANIZATION</span>
                    <span class="cert-brand-tagline">CONNECT • CARE • CONSERVE</span>
                </div>

                <div class="cert-title-section">
                    <h1 class="cert-type-headline">${certTitle}</h1>
                    <div class="cert-presentation-text">THIS CERTIFICATE IS PROUDLY PRESENTED TO</div>
                </div>

                <div class="cert-recipient-section">
                    <h2 class="cert-recipient-name">${c.recipientName}</h2>
                    <span class="cert-username-handle">@${c.username}</span>
                    <div class="cert-recipient-divider"></div>
                </div>

                <div class="cert-description-box">
                    ${c.description}
                </div>

                <div class="cert-event-meta-row">
                    <span class="cert-meta-item">EVENT / INITIATIVE: <strong>${c.eventName}</strong></span>
                    <span style="color:#C6A15B;">•</span>
                    <span class="cert-meta-item">DATE OF ISSUANCE: <strong>${c.issueDate}</strong></span>
                </div>

                <div class="cert-bottom-row">
                    <div class="cert-sig-block">
                        <div class="cert-sig-img-wrap">
                            <img src="../assets/signatures/founder-signature.png" class="cert-sig-img" alt="Founder Signature" onerror="this.onerror=null; this.src='../assets/signatures/founder-signature.svg';">
                        </div>
                        <div class="cert-sig-line"></div>
                        <div class="cert-sig-name">${c.founderName || "Dasari Sai Balaji"}</div>
                        <div class="cert-sig-title">Founder & President</div>
                    </div>

                    <div class="cert-sig-block">
                        <div class="cert-sig-img-wrap">
                            <img src="../assets/signatures/cofounder2-signature.png" class="cert-sig-img" alt="Co-Founder Signature" onerror="this.onerror=null; this.src='../assets/signatures/cofounder2-signature.svg';">
                        </div>
                        <div class="cert-sig-line"></div>
                        <div class="cert-sig-name">${c.coFounder2Name || "J.V.N.H Amarnath"}</div>
                        <div class="cert-sig-title">Co-Founder & Social Media Head</div>
                    </div>

                    <div class="cert-seal-wrap">
                        <div class="cert-emblem-badge" title="URVI Verified Official Document">
                            <img src="../assets/logo.png" class="cert-emblem-logo" alt="Official Seal">
                            <span class="cert-emblem-text">OFFICIAL SEAL</span>
                        </div>
                    </div>

                    <div class="cert-sig-block">
                        <div class="cert-sig-img-wrap">
                            <img src="../assets/signatures/cofounder-signature.png" class="cert-sig-img" alt="Co-Founder Signature" onerror="this.onerror=null; this.src='../assets/signatures/cofounder-signature.svg';">
                        </div>
                        <div class="cert-sig-line"></div>
                        <div class="cert-sig-name">${c.coFounderName || "Nakka Sai Suchit"}</div>
                        <div class="cert-sig-title">Co-Founder</div>
                    </div>
                </div>

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

// -----------------------------------------------------------------
// 3. User Management & Detailed User Modal
// -----------------------------------------------------------------
async function loadUsersTab() {
    const tableBody = document.getElementById("admin-users-table-body");
    const searchInput = document.getElementById("user-search-input");
    const filterSelect = document.getElementById("user-filter-status");
    if (!tableBody) return;

    try {
        const uSnap = await get(child(ref(db), "users"));
        if (!uSnap.exists()) {
            tableBody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4">No registered users found.</td></tr>`;
            return;
        }

        cachedUsersData = uSnap.val();
        let usersArr = Object.keys(cachedUsersData).map(k => ({ id: k, ...cachedUsersData[k] }));

        function renderUserRows(list) {
            if (list.length === 0) {
                tableBody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4">No matching users.</td></tr>`;
                return;
            }

            tableBody.innerHTML = list.map(u => {
                const statusBadge = u.status === "pending_deletion" 
                    ? `<span class="status-badge status-deletion">Pending Deletion</span>` 
                    : u.status === "pending_verification" 
                    ? `<span class="status-badge status-pending">Unverified Email</span>`
                    : `<span class="status-badge status-active">Active</span>`;

                return `
                    <tr>
                        <td>
                            <strong class="text-dark">${u.firstName || ""} ${u.lastName || ""}</strong><br>
                            <small class="text-muted">@${u.user_id || u.id}</small>
                        </td>
                        <td>${u.email || "-"}<br><small class="text-muted">${u.mobile || "-"}</small></td>
                        <td>
                            <span class="badge bg-info-subtle text-info">${u.userType || u.role || "Member"}</span>
                            <div class="mt-1">${statusBadge}</div>
                        </td>
                        <td>
                            Pts: <strong>${u.points || 0}</strong> | 
                            Trees: <strong>${u.trees_planted || 0}</strong> | 
                            Contrib: <strong>${u.contributions || 0}</strong>
                        </td>
                        <td>
                            <button type="button" class="btn btn-sm btn-outline-primary rounded-pill me-1 btn-edit-user-modal" data-id="${u.id}">Edit Details</button>
                            <button type="button" class="btn btn-sm btn-outline-danger rounded-pill btn-del-user-admin" data-id="${u.id}">Delete</button>
                        </td>
                    </tr>
                `;
            }).join("");

            // Edit User Modal Bindings
            document.querySelectorAll(".btn-edit-user-modal").forEach(btn => {
                btn.addEventListener("click", (e) => {
                    const id = e.currentTarget.dataset.id;
                    openUserEditModal(id, cachedUsersData[id]);
                });
            });

            // Delete User Account
            document.querySelectorAll(".btn-del-user-admin").forEach(btn => {
                btn.addEventListener("click", async (e) => {
                    const id = e.currentTarget.dataset.id;
                    if (!confirm(`Are you sure you want to delete user @${id}? This will remove their profile and data.`)) return;

                    await remove(ref(db, `users/${id}`));
                    await logAdminAction("USER_DELETE", id, `Deleted user account @${id}.`);
                    alert("User account deleted.");
                    loadUsersTab();
                    loadDashboardStats();
                });
            });
        }

        renderUserRows(usersArr);

        function filterAndRender() {
            const q = (searchInput?.value || "").toLowerCase().trim();
            const filterVal = filterSelect?.value || "all";

            let filtered = usersArr.filter(u => {
                const matchQ = (u.firstName && u.firstName.toLowerCase().includes(q)) ||
                               (u.lastName && u.lastName.toLowerCase().includes(q)) ||
                               (u.email && u.email.toLowerCase().includes(q)) ||
                               (u.mobile && String(u.mobile).includes(q)) ||
                               (u.user_id && u.user_id.toLowerCase().includes(q)) ||
                               (u.id && u.id.toLowerCase().includes(q));

                if (!matchQ) return false;

                if (filterVal === "active") return u.status === "active" || !u.status;
                if (filterVal === "admin") return u.userType === "admin" || u.role === "admin";
                if (filterVal === "pending_deletion") return u.status === "pending_deletion";

                return true;
            });

            renderUserRows(filtered);
        }

        searchInput?.addEventListener("input", filterAndRender);
        filterSelect?.addEventListener("change", filterAndRender);

    } catch (e) {
        console.error("Load users error:", e);
    }
}

// ── Tree XP Helper (Idempotent XP Awarding) ──
async function awardTreeXP(uid, xp, type, referenceId, description) {
    if (!uid || !xp) return;
    try {
        const histRef = ref(db, `treeXPHistory/${uid}`);
        const histSnap = await get(histRef);
        if (histSnap.exists()) {
            const entries = histSnap.val();
            const isDuplicate = Object.values(entries).some(
                e => e.referenceId === referenceId && e.type === type
            );
            if (isDuplicate) return;
        }

        const userSnap = await get(child(ref(db), `users/${uid}`));
        if (!userSnap.exists()) return;
        const u = userSnap.val();
        const currentXP = u.treeXP || 0;
        const newXP = currentXP + xp;

        await update(ref(db, `users/${uid}`), { treeXP: newXP });

        const txnRef = push(ref(db, `treeXPHistory/${uid}`));
        await set(txnRef, {
            type: type,
            referenceId: referenceId,
            xp: xp,
            description: description,
            createdAt: Date.now()
        });
    } catch (e) {
        console.error("awardTreeXP error:", e);
    }
}

function openUserEditModal(userId, userData) {
    if (!userData) return;
    const modalEl = document.getElementById("adminUserModal");
    
    document.getElementById("edit-user-original-id").value = userId;
    document.getElementById("edit-user-id").value = userData.user_id || userId;
    document.getElementById("edit-user-role").value = userData.userType || userData.role || "Member";
    document.getElementById("edit-user-fname").value = userData.firstName || "";
    document.getElementById("edit-user-lname").value = userData.lastName || "";
    document.getElementById("edit-user-email").value = userData.email || "";
    document.getElementById("edit-user-mobile").value = userData.mobile || "";
    document.getElementById("edit-user-points").value = userData.points || 0;
    document.getElementById("edit-user-trees").value = userData.trees_planted || 0;
    document.getElementById("edit-user-contrib").value = userData.contributions || 0;
    if (document.getElementById("edit-user-treexp")) document.getElementById("edit-user-treexp").value = userData.treeXP || 0;
    document.getElementById("edit-user-verif").value = userData.isVerified === true ? "true" : "false";
    document.getElementById("edit-user-status").value = userData.status || "active";
    document.getElementById("edit-user-bio").value = userData.bio || "";

    const bsModal = new bootstrap.Modal(modalEl);
    bsModal.show();

    const form = document.getElementById("admin-edit-user-form");
    form.onsubmit = async (e) => {
        e.preventDefault();
        const origId = document.getElementById("edit-user-original-id").value;
        const newUserId = document.getElementById("edit-user-id").value.trim().toLowerCase();
        const newRole = document.getElementById("edit-user-role").value;

        // Check profanity / validity on User ID
        const usernameVal = validateUsername(newUserId);
        if (!usernameVal.valid && newUserId !== origId) {
            alert(usernameVal.reason);
            return;
        }

        const updatedPayload = {
            user_id: newUserId,
            userType: newRole,
            role: newRole === "admin" ? "admin" : "member",
            firstName: document.getElementById("edit-user-fname").value.trim(),
            lastName: document.getElementById("edit-user-lname").value.trim(),
            email: document.getElementById("edit-user-email").value.trim(),
            mobile: document.getElementById("edit-user-mobile").value.trim(),
            points: parseInt(document.getElementById("edit-user-points").value, 10) || 0,
            trees_planted: parseInt(document.getElementById("edit-user-trees").value, 10) || 0,
            contributions: parseInt(document.getElementById("edit-user-contrib").value, 10) || 0,
            treeXP: parseInt(document.getElementById("edit-user-treexp")?.value || 0, 10) || 0,
            isVerified: document.getElementById("edit-user-verif").value === "true",
            status: document.getElementById("edit-user-status").value,
            bio: document.getElementById("edit-user-bio").value.trim(),
            updatedAt: Date.now()
        };

        try {
            await update(ref(db, `users/${origId}`), updatedPayload);
            await logAdminAction("USER_EDIT", origId, `Edited user profile & metrics for @${origId}.`);
            alert("User profile updated successfully!");
            bsModal.hide();
            loadUsersTab();
            loadDashboardStats();
        } catch (err) {
            console.error("Save user error:", err);
            alert("Failed to update user: " + err.message);
        }
    };
}

// -----------------------------------------------------------------
// 4. Post Moderation & Complete Cloudinary Storage Pruning
// -----------------------------------------------------------------
async function loadPostsTab() {
    const container = document.getElementById("admin-posts-list");
    const searchInput = document.getElementById("post-search-input");
    if (!container) return;

    try {
        const pSnap = await get(child(ref(db), "community/posts"));
        if (!pSnap.exists()) {
            container.innerHTML = `<p class="text-muted p-4 text-center">No community posts found.</p>`;
            return;
        }

        cachedPostsData = pSnap.val();
        let postsArr = Object.keys(cachedPostsData).map(id => ({ id, ...cachedPostsData[id] }));
        postsArr.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

        function renderPosts(list) {
            if (list.length === 0) {
                container.innerHTML = `<p class="text-muted p-4 text-center">No matching posts.</p>`;
                return;
            }

            container.innerHTML = list.map(p => {
                const isPinned = p.isPinned === true;
                return `
                    <div class="d-flex flex-column flex-md-row align-items-md-center justify-content-between p-3 border-bottom gap-2">
                        <div>
                            <strong class="text-dark">${p.userName || "User"} (@${p.userId})</strong>
                            <small class="text-muted ms-2">• ${new Date(p.createdAt || Date.now()).toLocaleString()}</small>
                            <p class="m-0 text-secondary small mt-1" style="line-height:1.4;">${p.description || "No text description."}</p>
                            ${p.imageUrl ? `<small class="text-success fw-semibold"><i class="bi bi-image me-1"></i>Media Attached</small>` : ""}
                        </div>
                        <div class="d-flex gap-2 align-items-center">
                            <button type="button" class="btn btn-sm ${isPinned ? 'btn-warning' : 'btn-outline-warning'} rounded-pill btn-pin-post" data-id="${p.id}" data-pinned="${isPinned}">
                                <i class="bi bi-pin-angle-fill me-1"></i> ${isPinned ? 'Unpin' : 'Pin to Impact'}
                            </button>
                            <button type="button" class="btn btn-sm btn-outline-danger rounded-pill btn-del-post" data-id="${p.id}" data-img="${p.imageUrl || ''}">
                                <i class="bi bi-trash me-1"></i> Delete & Prune
                            </button>
                        </div>
                    </div>
                `;
            }).join("");

            // Pin / Unpin Post
            document.querySelectorAll(".btn-pin-post").forEach(btn => {
                btn.addEventListener("click", async (e) => {
                    const id = e.currentTarget.dataset.id;
                    const isPinned = e.currentTarget.dataset.pinned === "true";
                    await update(ref(db, `community/posts/${id}`), { isPinned: !isPinned, pinnedAt: Date.now() });
                    await logAdminAction("POST_PIN", id, `${isPinned ? 'Unpinned' : 'Pinned'} post on Impact.`);
                    loadPostsTab();
                });
            });

            // Delete Post & Prune Cloudinary Media Assets
            document.querySelectorAll(".btn-del-post").forEach(btn => {
                btn.addEventListener("click", async (e) => {
                    const id = e.currentTarget.dataset.id;
                    const imgUrl = e.currentTarget.dataset.img;

                    if (!confirm("Permanently delete this post and prune associated Cloudinary media assets?")) return;

                    try {
                        // 1. Delete associated Cloudinary asset via serverless endpoint if present
                        if (imgUrl && imgUrl.includes("cloudinary.com")) {
                            const { public_id, resource_type } = extractPublicIdFromUrl(imgUrl);
                            if (public_id) {
                                await deleteFromCloudinary(public_id, resource_type);
                            }
                        }

                        // 2. Remove RTDB post records, likes, comments
                        await remove(ref(db, `community/posts/${id}`));
                        await remove(ref(db, `community/likes/${id}`));
                        await remove(ref(db, `community/comments/${id}`));

                        await logAdminAction("POST_DELETE", id, "Deleted post & pruned Cloudinary media.");

                        alert("Post and Cloudinary assets successfully pruned!");
                        loadPostsTab();
                        loadDashboardStats();
                    } catch (err) {
                        console.error("Delete post error:", err);
                        alert("Failed to delete post: " + err.message);
                    }
                });
            });
        }

        renderPosts(postsArr);

        searchInput?.addEventListener("input", (e) => {
            const q = e.target.value.toLowerCase().trim();
            const filtered = postsArr.filter(p => 
                (p.userName && p.userName.toLowerCase().includes(q)) ||
                (p.userId && p.userId.toLowerCase().includes(q)) ||
                (p.description && p.description.toLowerCase().includes(q))
            );
            renderPosts(filtered);
        });

    } catch (e) {
        console.error("Load posts error:", e);
    }
}

// -----------------------------------------------------------------
// 5. Leaderboard Visibility Settings
// -----------------------------------------------------------------
async function loadSettingsTab() {
    const totalToggle = document.getElementById("toggle-total-lb");
    const pointsToggle = document.getElementById("toggle-points-lb");
    const plantsToggle = document.getElementById("toggle-plants-lb");
    const contribToggle = document.getElementById("toggle-contrib-lb");
    const saveBtn = document.getElementById("save-settings-btn");

    try {
        const sSnap = await get(child(ref(db), "settings/leaderboard_visibility"));
        if (sSnap.exists()) {
            const s = sSnap.val();
            if (totalToggle) totalToggle.checked = s.total !== false;
            if (pointsToggle) pointsToggle.checked = s.points !== false;
            if (plantsToggle) plantsToggle.checked = s.plants !== false;
            if (contribToggle) contribToggle.checked = s.contributions !== false;
        }
    } catch (e) { console.error(e); }

    saveBtn?.addEventListener("click", async () => {
        saveBtn.disabled = true;
        await set(ref(db, "settings/leaderboard_visibility"), {
            total: totalToggle.checked,
            points: pointsToggle.checked,
            plants: plantsToggle.checked,
            contributions: contribToggle.checked,
            updatedAt: Date.now()
        });
        await logAdminAction("SETTINGS_UPDATE", "leaderboard_visibility", "Updated leaderboard visibility controls.");
        alert("Leaderboard visibility settings saved!");
        saveBtn.disabled = false;
    });
}

// -----------------------------------------------------------------
// 6. Support Requests Inbox & Reply Modal
// -----------------------------------------------------------------
async function loadSupportTab() {
    const listEl = document.getElementById("admin-support-list");
    const filterSelect = document.getElementById("support-status-filter");
    if (!listEl) return;

    try {
        const sSnap = await get(child(ref(db), "support_requests"));
        if (!sSnap.exists()) {
            listEl.innerHTML = `<p class="text-muted p-4 text-center">No support tickets submitted.</p>`;
            return;
        }

        cachedSupportData = sSnap.val();
        let ticketsArr = Object.keys(cachedSupportData).map(id => ({ id, ...cachedSupportData[id] }));
        ticketsArr.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

        function renderTickets(list) {
            if (list.length === 0) {
                listEl.innerHTML = `<p class="text-muted p-4 text-center">No matching tickets.</p>`;
                return;
            }

            listEl.innerHTML = list.map(req => {
                const isResolved = req.status === "resolved" || req.status === "closed";
                const messages = req.messages ? Object.values(req.messages) : [];

                return `
                    <div class="p-3 border-bottom ${isResolved ? 'bg-light opacity-85' : 'bg-white'}">
                        <div class="d-flex align-items-center justify-content-between mb-2">
                            <div>
                                <strong class="text-dark fs-6">${req.full_name || "Volunteer"}</strong> 
                                <span class="text-muted">(${req.email || "No email"} | ${req.mobile || "No mobile"})</span>
                                <small class="text-muted ms-2">• ${new Date(req.timestamp || Date.now()).toLocaleString()}</small>
                            </div>
                            <span class="badge ${isResolved ? 'bg-success' : 'bg-warning text-dark'}">${req.status || "unresolved"}</span>
                        </div>
                        <p class="mb-2 text-secondary small" style="line-height:1.5;">${req.message || req.description || "No description provided."}</p>
                        
                        ${messages.length > 0 ? `
                            <div class="bg-light p-2 rounded-3 mb-2 small border">
                                <strong>Conversation (${messages.length}):</strong>
                                ${messages.slice(-2).map(m => `
                                    <div class="text-muted mt-1"><strong>${m.sender || 'Admin'}:</strong> ${m.text}</div>
                                `).join("")}
                            </div>
                        ` : ''}

                        <div class="d-flex gap-2 align-items-center">
                            <button type="button" class="btn btn-sm btn-primary rounded-pill btn-reply-ticket" data-id="${req.id}">
                                <i class="bi bi-reply-fill me-1"></i> Reply to Ticket
                            </button>
                            <button type="button" class="btn btn-sm ${isResolved ? 'btn-outline-secondary' : 'btn-success'} rounded-pill btn-toggle-support" data-id="${req.id}" data-status="${req.status}">
                                Mark as ${isResolved ? 'Unresolved' : 'Resolved'}
                            </button>
                        </div>
                    </div>
                `;
            }).join("");

            // Reply Modal Trigger
            document.querySelectorAll(".btn-reply-ticket").forEach(btn => {
                btn.addEventListener("click", (e) => {
                    const id = e.currentTarget.dataset.id;
                    openSupportReplyModal(id, cachedSupportData[id]);
                });
            });

            // Toggle Ticket Status
            document.querySelectorAll(".btn-toggle-support").forEach(btn => {
                btn.addEventListener("click", async (e) => {
                    const id = e.currentTarget.dataset.id;
                    const currStatus = e.currentTarget.dataset.status;
                    const nextStatus = currStatus === "resolved" ? "unresolved" : "resolved";

                    await update(ref(db, `support_requests/${id}`), { status: nextStatus, updatedAt: Date.now() });
                    loadSupportTab();
                    loadDashboardStats();
                });
            });
        }

        renderTickets(ticketsArr);

        filterSelect?.addEventListener("change", () => {
            const filterVal = filterSelect.value;
            let filtered = ticketsArr;
            if (filterVal === "unresolved") filtered = ticketsArr.filter(t => t.status === "unresolved" || t.status === "open");
            if (filterVal === "resolved") filtered = ticketsArr.filter(t => t.status === "resolved" || t.status === "closed");
            renderTickets(filtered);
        });

    } catch (e) {
        console.error("Load support error:", e);
    }
}

function openSupportReplyModal(ticketId, ticketData) {
    if (!ticketData) return;
    const modalEl = document.getElementById("adminSupportReplyModal");

    document.getElementById("reply-ticket-id").value = ticketId;
    document.getElementById("reply-ticket-summary").innerHTML = `
        <strong class="text-dark">${ticketData.full_name}</strong> (${ticketData.email})<br>
        <small class="text-muted">Issue: "${ticketData.message || ticketData.description || ""}"</small>
    `;
    document.getElementById("reply-message-input").value = "";

    const bsModal = new bootstrap.Modal(modalEl);
    bsModal.show();

    document.getElementById("btn-send-support-reply").onclick = async () => {
        const replyText = document.getElementById("reply-message-input").value.trim();
        const markResolved = document.getElementById("reply-mark-resolved").checked;

        if (!replyText) {
            alert("Please enter a response message.");
            return;
        }

        try {
            const msgRef = push(ref(db, `support_requests/${ticketId}/messages`));
            await set(msgRef, {
                sender: "URVI Support Admin",
                senderId: currentUserId,
                text: replyText,
                timestamp: Date.now()
            });

            const nextStatus = markResolved ? "resolved" : "in_progress";
            await update(ref(db, `support_requests/${ticketId}`), {
                status: nextStatus,
                updatedAt: Date.now()
            });

            // Dispatch notification to user
            if (ticketData.userId) {
                const notifRef = push(ref(db, `notifications/${ticketData.userId}`));
                await set(notifRef, {
                    title: "Support Reply Received 🎧",
                    message: `URVI Support replied: "${replyText.slice(0, 80)}..."`,
                    type: "support_reply",
                    timestamp: Date.now(),
                    read: false
                });
            }

            await logAdminAction("SUPPORT_REPLY", ticketId, `Replied to ticket #${ticketId}.`);

            alert("Reply sent successfully to user!");
            bsModal.hide();
            loadSupportTab();
            loadDashboardStats();

        } catch (err) {
            console.error("Send support reply error:", err);
            alert("Failed to send reply: " + err.message);
        }
    };
}

// -----------------------------------------------------------------
// 7. Pending Account Deletions Queue (30-Day Grace Period)
// -----------------------------------------------------------------
async function loadDeletionsQueueTab() {
    const listEl = document.getElementById("admin-deletions-list");
    if (!listEl) return;

    try {
        const uSnap = await get(child(ref(db), "users"));
        if (!uSnap.exists()) {
            listEl.innerHTML = `<p class="text-muted p-4 text-center">No pending deletion requests.</p>`;
            return;
        }

        const usersData = uSnap.val();
        const pendingUsers = Object.keys(usersData)
            .map(k => ({ id: k, ...usersData[k] }))
            .filter(u => u.status === "pending_deletion");

        if (pendingUsers.length === 0) {
            listEl.innerHTML = `<p class="text-muted p-4 text-center">No accounts currently in 30-day deletion grace period.</p>`;
            return;
        }

        const now = Date.now();

        listEl.innerHTML = pendingUsers.map(u => {
            const requestedAt = u.deletionRequestedAt || u.updatedAt || now;
            const scheduledAt = u.scheduledDeletionAt || (requestedAt + (30 * 24 * 60 * 60 * 1000));
            const msRemaining = Math.max(0, scheduledAt - now);
            const daysRemaining = Math.ceil(msRemaining / (1000 * 60 * 60 * 24));
            const isReadyForFinal = daysRemaining <= 0;

            return `
                <div class="p-3 border-bottom bg-white d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-3">
                    <div>
                        <strong class="text-dark fs-6">${u.firstName || ""} ${u.lastName || ""}</strong> (@${u.user_id || u.id})
                        <small class="text-muted d-block">${u.email} • Mobile: ${u.mobile || "N/A"}</small>
                        <small class="text-danger d-block mt-1">
                            Requested: ${new Date(requestedAt).toLocaleDateString()} • 
                            Scheduled Final: ${new Date(scheduledAt).toLocaleDateString()}
                        </small>
                    </div>
                    <div class="text-md-end">
                        <span class="badge ${isReadyForFinal ? 'bg-danger' : 'bg-warning text-dark'} mb-2 d-inline-block">
                            ${isReadyForFinal ? 'Ready for Final Deletion Approval' : `${daysRemaining} Days Remaining`}
                        </span>
                        <div class="d-flex gap-2">
                            <button type="button" class="btn btn-sm btn-outline-success rounded-pill btn-restore-user" data-id="${u.id}">
                                Restore Account
                            </button>
                            <button type="button" class="btn btn-sm btn-danger rounded-pill btn-approve-final-delete" data-id="${u.id}" data-pic="${u.profilePic || ''}">
                                Approve Final Permanent Deletion
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join("");

        // Restore Account Button
        document.querySelectorAll(".btn-restore-user").forEach(btn => {
            btn.addEventListener("click", async (e) => {
                const id = e.currentTarget.dataset.id;
                await update(ref(db, `users/${id}`), {
                    status: "active",
                    deletionRequestedAt: null,
                    scheduledDeletionAt: null
                });
                await logAdminAction("ACCOUNT_RESTORE", id, `Restored account @${id} from pending deletion.`);
                alert(`Account @${id} restored to active status.`);
                loadDeletionsQueueTab();
                loadDashboardStats();
            });
        });

        // Approve Final Permanent Deletion Button
        document.querySelectorAll(".btn-approve-final-delete").forEach(btn => {
            btn.addEventListener("click", async (e) => {
                const id = e.currentTarget.dataset.id;
                const picUrl = e.currentTarget.dataset.pic;

                if (!confirm(`PERMANENT DELETION CONFIRMATION:\nAre you sure you want to permanently erase ALL data, posts, comments, media, and records for user @${id}? This action CANNOT be undone.`)) return;

                try {
                    // 1. Destroy Cloudinary profile picture if present
                    if (picUrl && picUrl.includes("cloudinary.com")) {
                        const { public_id, resource_type } = extractPublicIdFromUrl(picUrl);
                        if (public_id) {
                            await deleteFromCloudinary(public_id, resource_type);
                        }
                    }

                    // 2. Erase user record and related subnodes from RTDB
                    await remove(ref(db, `users/${id}`));
                    await remove(ref(db, `notifications/${id}`));
                    await remove(ref(db, `certificates/${id}`));

                    await logAdminAction("ACCOUNT_PERMANENT_DELETE", id, `Permanently deleted all records for user @${id}.`);

                    alert(`User @${id} permanently deleted.`);
                    loadDeletionsQueueTab();
                    loadDashboardStats();

                } catch (err) {
                    console.error("Permanent deletion error:", err);
                    alert("Failed to complete permanent deletion: " + err.message);
                }
            });
        });

    } catch (e) {
        console.error("Load deletions queue error:", e);
    }
}

// -----------------------------------------------------------------
// 8. Admin Audit Trail
// -----------------------------------------------------------------
async function loadAuditLogTab() {
    const listEl = document.getElementById("admin-audit-list");
    if (!listEl) return;

    try {
        const aSnap = await get(child(ref(db), "adminActions"));
        if (!aSnap.exists()) {
            listEl.innerHTML = `<p class="text-muted p-4 text-center">No administrative audit logs recorded yet.</p>`;
            return;
        }

        const logs = Object.values(aSnap.val());
        logs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

        listEl.innerHTML = logs.map(l => `
            <div class="p-3 border-bottom d-flex align-items-center justify-content-between">
                <div>
                    <span class="badge bg-secondary me-2">${l.action || "ACTION"}</span>
                    <strong class="text-dark">${l.summary || ""}</strong>
                    ${l.targetId ? `<small class="text-muted ms-2">(Target: ${l.targetId})</small>` : ""}
                </div>
                <small class="text-muted">${new Date(l.timestamp || Date.now()).toLocaleString()}</small>
            </div>
        `).join("");

    } catch (e) {
        console.error("Load audit log error:", e);
    }
}
