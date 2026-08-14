/* =====================================================
   URVI – support-modal.js | Help & Support Ticket Dialog & Mobile UI
   ===================================================== */
import { db, ref, set, get, child, push } from "../config.js";
import { uploadToCloudinary } from "../cloudinary.js";

document.addEventListener("DOMContentLoaded", () => {
    initSupportModal();
});

function initSupportModal() {
    const activeUserId = localStorage.getItem("urvi_logged_user");

    // Inject self-contained modal styles if missing
    if (!document.getElementById("support-modal-styles")) {
        const style = document.createElement("style");
        style.id = "support-modal-styles";
        style.textContent = `
            .urvi-support-overlay {
                position: fixed; inset: 0; background: rgba(15, 23, 42, 0.65); backdrop-filter: blur(6px);
                z-index: 999999; display: flex; align-items: center; justify-content: center; padding: 16px;
                opacity: 0; visibility: hidden; transition: all 0.3s ease;
            }
            .urvi-support-overlay.active { opacity: 1; visibility: visible; }

            .urvi-support-card {
                background: #ffffff; border-radius: 24px; padding: 28px; width: 100%; max-width: 520px;
                max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 50px rgba(0,0,0,0.2);
                border: 1px solid #E2E8F0; position: relative; animation: modalPop 0.3s ease-out;
            }

            @keyframes modalPop {
                from { transform: scale(0.92); opacity: 0; }
                to { transform: scale(1); opacity: 1; }
            }

            .urvi-support-close {
                position: absolute; top: 18px; right: 20px; background: #F1F5F9; border: none;
                width: 32px; height: 32px; border-radius: 50%; font-size: 18px; color: #64748B;
                cursor: pointer; display: flex; align-items: center; justify-content: center;
                transition: all 0.2s ease;
            }
            .urvi-support-close:hover { background: #E2E8F0; color: #0F172A; }

            .urvi-support-card input, .urvi-support-card textarea, .urvi-support-card select {
                border-radius: 12px !important; border: 1.5px solid #E2E8F0 !important;
                padding: 10px 14px !important; font-size: 14px !important;
            }
            .urvi-support-card input:focus, .urvi-support-card textarea:focus, .urvi-support-card select:focus {
                border-color: #22C55E !important; box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.15) !important;
            }

            .feedback-msg { padding: 10px 14px; border-radius: 12px; font-size: 13px; font-weight: 500; }
            .feedback-msg.success { background: #DCFCE7; color: #15803D; border: 1px solid #BBF7D0; }
            .feedback-msg.error { background: #FEE2E2; color: #DC2626; border: 1px solid #FCA5A5; }
            .feedback-msg.hidden { display: none; }

            @media (max-width: 576px) {
                .urvi-support-card { padding: 20px 16px; border-radius: 20px; }
            }
        `;
        document.head.appendChild(style);
    }

    // Inject modal HTML if missing
    if (!document.getElementById("urvi-support-modal")) {
        const modalHtml = `
            <div class="urvi-support-overlay" id="urvi-support-modal">
                <div class="urvi-support-card">
                    <button type="button" class="urvi-support-close" id="close-support-modal">&times;</button>
                    <div class="d-flex align-items-center gap-2 mb-1">
                        <span style="font-size:24px;">🎧</span>
                        <h4 class="m-0 fw-bold text-dark">Help & Support Ticket</h4>
                    </div>
                    <p class="text-muted small mb-3">Submit an official ticket directly to the URVI support team.</p>

                    <div id="support-modal-feedback" class="feedback-msg hidden mb-3"></div>

                    <form id="urvi-support-form">
                        <div class="row g-2 mb-2">
                            <div class="col-12 col-sm-6">
                                <label class="form-label fw-semibold text-dark small mb-1">Full Name</label>
                                <input type="text" class="form-control" id="sup-name" required readonly>
                            </div>
                            <div class="col-12 col-sm-6">
                                <label class="form-label fw-semibold text-dark small mb-1">Email Address</label>
                                <input type="email" class="form-control" id="sup-email" required readonly>
                            </div>
                        </div>

                        <div class="mb-3">
                            <label class="form-label fw-semibold text-dark small mb-1">Mobile Number</label>
                            <input type="tel" class="form-control" id="sup-mobile" required readonly>
                        </div>

                        <div class="mb-3">
                            <label class="form-label fw-semibold text-dark small mb-1">Issue Category</label>
                            <select class="form-select" id="sup-category">
                                <option value="Account/Login">Account / Login</option>
                                <option value="Email Verification">Email Verification</option>
                                <option value="Profile">Profile Customization</option>
                                <option value="Events/Activities">Events / Activities</option>
                                <option value="Points/Leaderboard">Points / Leaderboard</option>
                                <option value="Certificates">My Certificates</option>
                                <option value="Community">Community Feed</option>
                                <option value="Technical Issue">Technical Issue</option>
                                <option value="Other">Other Query</option>
                            </select>
                        </div>

                        <div class="mb-3">
                            <label class="form-label fw-semibold text-dark small mb-1">Subject Summary</label>
                            <input type="text" class="form-control" id="sup-subject" required placeholder="Brief summary of your query">
                        </div>

                        <div class="mb-3">
                            <label class="form-label fw-semibold text-dark small mb-1">Detailed Description</label>
                            <textarea class="form-control" id="sup-message" required rows="3" placeholder="Describe your issue in detail..."></textarea>
                        </div>

                        <div class="mb-4">
                            <label class="form-label fw-semibold text-dark small mb-1">Attach Screenshot (Optional)</label>
                            <input type="file" class="form-control" id="sup-attachment" accept="image/*">
                        </div>

                        <button type="submit" class="btn btn-success w-100 rounded-pill py-2 fw-bold shadow-sm" id="btn-submit-support-ticket">
                            <i class="bi bi-send-fill me-1"></i> Submit Support Ticket
                        </button>
                    </form>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML("beforeend", modalHtml);
    }

    const modal = document.getElementById("urvi-support-modal");
    const closeBtn = document.getElementById("close-support-modal");
    const form = document.getElementById("urvi-support-form");
    const feedback = document.getElementById("support-modal-feedback");
    const submitBtn = document.getElementById("btn-submit-support-ticket");

    // Global trigger function to open Support Modal
    window.openUrviSupportModal = async function() {
        const curUser = localStorage.getItem("urvi_logged_user");
        if (!curUser) {
            alert("Please log in to submit a support ticket.");
            const currentPath = window.location.pathname;
            const isRoot = pathEndsWithIndex();
            window.location.href = isRoot ? "logins/login.html" : "../logins/login.html";
            return;
        }

        modal.classList.add("active");
        feedback.classList.add("hidden");

        // Prefill metadata from RTDB or localStorage
        const cachedUserData = localStorage.getItem("urvi_user_data");
        if (cachedUserData) {
            try {
                const u = JSON.parse(cachedUserData);
                document.getElementById("sup-name").value = `${u.firstName || ""} ${u.lastName || ""}`.trim() || curUser;
                document.getElementById("sup-email").value = u.email || "";
                document.getElementById("sup-mobile").value = u.mobile || "";
            } catch (e) { /* ignore */ }
        }

        try {
            const uSnap = await get(child(ref(db), `users/${curUser}`));
            if (uSnap.exists()) {
                const u = uSnap.val();
                document.getElementById("sup-name").value = `${u.firstName || ""} ${u.lastName || ""}`.trim() || curUser;
                document.getElementById("sup-email").value = u.email || "";
                document.getElementById("sup-mobile").value = u.mobile || "";
            }
        } catch (e) {
            console.error("Support prefill error:", e);
        }
    };

    closeBtn?.addEventListener("click", () => modal.classList.remove("active"));
    window.addEventListener("click", (e) => {
        if (e.target === modal) modal.classList.remove("active");
    });

    form?.addEventListener("submit", async (e) => {
        e.preventDefault();
        feedback.classList.add("hidden");

        const curUser = localStorage.getItem("urvi_logged_user");
        const name = document.getElementById("sup-name").value;
        const email = document.getElementById("sup-email").value;
        const mobile = document.getElementById("sup-mobile").value;
        const category = document.getElementById("sup-category").value;
        const subject = document.getElementById("sup-subject").value.trim();
        const message = document.getElementById("sup-message").value.trim();
        const attachFile = document.getElementById("sup-attachment").files[0];

        if (!subject || !message) {
            showFeedback(feedback, "Please enter both subject and description.", "error");
            return;
        }

        submitBtn.disabled = true;
        submitBtn.innerText = "Submitting Ticket...";

        try {
            let attachUrl = "";
            if (attachFile) {
                submitBtn.innerText = "Uploading Screenshot...";
                attachUrl = await uploadToCloudinary(attachFile);
            }

            submitBtn.innerText = "Saving Ticket...";
            const timestamp = Date.now();
            const ticketId = `URVI-TICK-${Date.now().toString().slice(-6)}`;

            const payload = {
                ticketId: ticketId,
                userId: curUser || "guest",
                full_name: name,
                email: email,
                mobile: mobile,
                category: category,
                subject: subject,
                message: message,
                attachment: attachUrl || "",
                timestamp: timestamp,
                status: "unresolved",
                messages: {
                    initial: {
                        sender: name,
                        senderId: curUser || "guest",
                        text: message,
                        timestamp: timestamp
                    }
                }
            };

            await set(ref(db, `support_requests/${ticketId}`), payload);

            showFeedback(feedback, `✅ Support Ticket ${ticketId} created! Our team will respond shortly.`, "success");
            document.getElementById("sup-subject").value = "";
            document.getElementById("sup-message").value = "";

            setTimeout(() => {
                modal.classList.remove("active");
                submitBtn.disabled = false;
                submitBtn.innerHTML = `<i class="bi bi-send-fill me-1"></i> Submit Support Ticket`;
            }, 2200);

        } catch (err) {
            console.error("Submit ticket error:", err);
            showFeedback(feedback, "Failed to submit ticket: " + err.message, "error");
            submitBtn.disabled = false;
            submitBtn.innerHTML = `<i class="bi bi-send-fill me-1"></i> Submit Support Ticket`;
        }
    });

    function showFeedback(element, msg, type) {
        element.innerText = msg;
        element.className = `feedback-msg ${type}`;
        element.classList.remove("hidden");
    }

    function pathEndsWithIndex() {
        const p = window.location.pathname;
        return p.endsWith("index.html") || p.endsWith("/");
    }
}
