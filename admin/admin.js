/* =====================================================
   URVI – admin.js | Complete Master Admin Control Panel
   ===================================================== */
import { db, ref, get, child, set, update, remove, push } from "../config.js";
import { uploadToCloudinary, deleteFromCloudinary, extractPublicIdFromUrl, isVideoUrl } from "../cloudinary.js";
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
    loadMonthlyActivitiesTab();
    loadActivityVerificationTab();
    loadStoryModerationTab();
    loadGlobalStatsTab();
    loadSupportTab();
    loadDeletionsQueueTab();
    loadAuditLogTab();

    document.getElementById("btn-refresh-stats")?.addEventListener("click", () => {
        loadDashboardStats();
        loadEventsTab();
        loadCertificatesTab();
        loadUsersTab();
        loadMonthlyActivitiesTab();
        loadActivityVerificationTab();
        loadStoryModerationTab();
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
// 5. Monthly Eco Challenges Publishing (Max 5/month)
// -----------------------------------------------------------------
function getAdminSelectedMonthKey() {
    const picker = document.getElementById("admin-activity-month-picker");
    if (picker && picker.value) {
        return picker.value.replace("-", "_");
    }
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    return `${y}_${m}`;
}

let cachedMonthlyActivities = {};

async function loadMonthlyActivitiesTab() {
    const monthPicker = document.getElementById("admin-activity-month-picker");
    const now = new Date();
    const curVal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    if (monthPicker && !monthPicker.value) {
        monthPicker.value = curVal;
    }

    monthPicker?.addEventListener("change", () => {
        renderMonthlyActivitiesList();
    });

    setupMonthlyActivityForm();
    await renderMonthlyActivitiesList();
}

function setupMonthlyActivityForm() {
    const form = document.getElementById("monthly-activity-form");
    const editIdInput = document.getElementById("monthly-act-edit-id");
    const cancelBtn = document.getElementById("monthly-act-cancel-btn");
    const headerTitle = document.getElementById("monthly-act-form-header");
    const submitBtn = document.getElementById("monthly-act-submit-btn");

    if (!form || form._isInitialized) return;
    form._isInitialized = true;

    cancelBtn?.addEventListener("click", () => {
        resetMonthlyActivityForm();
    });

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const monthKey = getAdminSelectedMonthKey();
        const editId = editIdInput.value.trim();

        const title = document.getElementById("monthly-act-title").value.trim();
        const category = document.getElementById("monthly-act-category").value;
        const icon = document.getElementById("monthly-act-icon").value.trim() || "🌱";
        const targetDays = parseInt(document.getElementById("monthly-act-target-days").value, 10) || 30;
        const pointsPerDay = parseInt(document.getElementById("monthly-act-daily-points").value, 10) || 10;
        const bonusPoints = parseInt(document.getElementById("monthly-act-bonus-points").value, 10) || 100;
        const desc = document.getElementById("monthly-act-desc").value.trim();

        if (!title || !desc) {
            alert("Please fill in both Activity Title and Description.");
            return;
        }

        // Enforce max 5 activities per month if creating new
        if (!editId) {
            const currentCount = Object.keys(cachedMonthlyActivities).length;
            if (currentCount >= 5) {
                alert(`⚠️ Maximum limit reached: You already have 5 activities published for ${monthKey}. Please edit or delete an existing activity first.`);
                return;
            }
        }

        submitBtn.disabled = true;
        submitBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Saving...`;

        try {
            const actData = {
                title,
                category,
                icon,
                targetDays,
                pointsPerDay,
                bonusOnCompletion: bonusPoints,
                description: desc,
                status: "active",
                updatedAt: Date.now()
            };

            if (editId) {
                await update(ref(db, `monthly_activities/${monthKey}/activities/${editId}`), actData);
                await logAdminAction("MONTHLY_ACTIVITY_UPDATE", editId, `Updated monthly challenge '${title}' for ${monthKey}`);
            } else {
                actData.createdAt = Date.now();
                actData.createdBy = currentUserId || "admin";
                const newRef = push(ref(db, `monthly_activities/${monthKey}/activities`));
                await set(newRef, actData);
                await logAdminAction("MONTHLY_ACTIVITY_CREATE", newRef.key, `Published new monthly challenge '${title}' for ${monthKey}`);
            }

            resetMonthlyActivityForm();
            await renderMonthlyActivitiesList();
            alert("Challenge successfully saved and published! 🌿");
        } catch (err) {
            console.error("Save monthly activity error:", err);
            alert("Failed to save challenge: " + err.message);
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = `<i class="bi bi-cloud-arrow-up-fill me-1"></i> Publish Challenge`;
        }
    });

    function resetMonthlyActivityForm() {
        form.reset();
        editIdInput.value = "";
        document.getElementById("monthly-act-target-days").value = "30";
        document.getElementById("monthly-act-daily-points").value = "10";
        document.getElementById("monthly-act-bonus-points").value = "100";
        document.getElementById("monthly-act-icon").value = "🌱";
        if (headerTitle) headerTitle.innerText = "Publish New Monthly Challenge";
        if (cancelBtn) cancelBtn.classList.add("d-none");
    }
}

async function renderMonthlyActivitiesList() {
    const listEl = document.getElementById("monthly-activities-list");
    const countBadge = document.getElementById("monthly-act-count-badge");
    const navBadge = document.getElementById("nav-monthly-count");
    if (!listEl) return;

    const monthKey = getAdminSelectedMonthKey();
    listEl.innerHTML = `<div class="text-center py-4 text-muted"><span class="spinner-border spinner-border-sm me-2"></span>Loading activities for ${monthKey}...</div>`;

    try {
        const snap = await get(child(ref(db), `monthly_activities/${monthKey}/activities`));
        if (!snap.exists()) {
            cachedMonthlyActivities = {};
            if (countBadge) countBadge.innerText = "0 / 5 Activities";
            if (navBadge) navBadge.innerText = "0/5";
            listEl.innerHTML = `
                <div class="text-center py-4 text-muted">
                    <p class="m-0">No activities published yet for <strong>${monthKey}</strong>.</p>
                    <small>Publish up to 5 daily activities for users to choose and maintain streaks.</small>
                </div>
            `;
            return;
        }

        cachedMonthlyActivities = snap.val();
        const acts = Object.entries(cachedMonthlyActivities).map(([id, data]) => ({ id, ...data }));
        const count = acts.length;

        if (countBadge) countBadge.innerText = `${count} / 5 Activities`;
        if (navBadge) navBadge.innerText = `${count}/5`;

        listEl.innerHTML = `
            <div class="row g-3">
                ${acts.map(act => `
                    <div class="col-12 col-md-6">
                        <div class="monthly-activity-card d-flex flex-column justify-content-between h-100">
                            <div>
                                <div class="d-flex align-items-center justify-content-between mb-2">
                                    <div class="d-flex align-items-center gap-2">
                                        <span class="fs-4">${act.icon || "🌱"}</span>
                                        <h6 class="fw-bold m-0 text-dark">${act.title}</h6>
                                    </div>
                                    <span class="badge bg-success-subtle text-success rounded-pill px-2 py-1 small">${act.category || "General"}</span>
                                </div>
                                <p class="small text-muted mb-3" style="line-height:1.4;">${act.description}</p>
                                <div class="d-flex flex-wrap gap-2 mb-3">
                                    <span class="badge bg-light text-dark border">🎯 ${act.targetDays || 30} Days Target</span>
                                    <span class="badge bg-light text-success border">⭐ +${act.pointsPerDay || 10} pts / day</span>
                                    <span class="badge bg-light text-primary border">🏆 +${act.bonusOnCompletion || 100} pts bonus</span>
                                </div>
                            </div>
                            <div class="d-flex gap-2 pt-2 border-top">
                                <button type="button" class="btn btn-sm btn-outline-primary rounded-pill px-3 fw-semibold btn-edit-monthly-act" data-id="${act.id}">
                                    <i class="bi bi-pencil me-1"></i> Edit
                                </button>
                                <button type="button" class="btn btn-sm btn-outline-danger rounded-pill px-3 fw-semibold btn-delete-monthly-act" data-id="${act.id}">
                                    <i class="bi bi-trash3 me-1"></i> Delete
                                </button>
                            </div>
                        </div>
                    </div>
                `).join("")}
            </div>
        `;

        // Wire Edit and Delete buttons
        listEl.querySelectorAll(".btn-edit-monthly-act").forEach(btn => {
            btn.addEventListener("click", () => {
                const id = btn.dataset.id;
                const act = cachedMonthlyActivities[id];
                if (!act) return;

                document.getElementById("monthly-act-edit-id").value = id;
                document.getElementById("monthly-act-title").value = act.title || "";
                document.getElementById("monthly-act-category").value = act.category || "Tree Plantation";
                document.getElementById("monthly-act-icon").value = act.icon || "🌱";
                document.getElementById("monthly-act-target-days").value = act.targetDays || 30;
                document.getElementById("monthly-act-daily-points").value = act.pointsPerDay || 10;
                document.getElementById("monthly-act-bonus-points").value = act.bonusOnCompletion || 100;
                document.getElementById("monthly-act-desc").value = act.description || "";

                document.getElementById("monthly-act-form-header").innerText = "Edit Monthly Challenge";
                document.getElementById("monthly-act-cancel-btn")?.classList.remove("d-none");
                document.getElementById("monthly-activity-form")?.scrollIntoView({ behavior: "smooth" });
            });
        });

        listEl.querySelectorAll(".btn-delete-monthly-act").forEach(btn => {
            btn.addEventListener("click", async () => {
                const id = btn.dataset.id;
                const act = cachedMonthlyActivities[id];
                if (!confirm(`Are you sure you want to delete challenge '${act?.title || id}' from ${monthKey}?`)) return;

                try {
                    await remove(ref(db, `monthly_activities/${monthKey}/activities/${id}`));
                    await logAdminAction("MONTHLY_ACTIVITY_DELETE", id, `Deleted monthly challenge '${act?.title}' for ${monthKey}`);
                    await renderMonthlyActivitiesList();
                } catch (err) {
                    alert("Delete failed: " + err.message);
                }
            });
        });

    } catch (err) {
        console.error("Render monthly activities error:", err);
        listEl.innerHTML = `<div class="alert alert-danger">Error loading monthly activities: ${err.message}</div>`;
    }
}

// -----------------------------------------------------------------
// 6. User Activity Daily Task Verification (Streak Maintenance)
// -----------------------------------------------------------------
async function loadActivityVerificationTab() {
    const queueEl = document.getElementById("admin-verification-queue");
    const filterSelect = document.getElementById("verify-filter-status");
    const refreshBtn = document.getElementById("btn-refresh-verifications");
    if (!queueEl) return;

    refreshBtn?.addEventListener("click", () => renderVerificationQueue());
    filterSelect?.addEventListener("change", () => renderVerificationQueue());

    await renderVerificationQueue();
}

async function renderVerificationQueue() {
    const queueEl = document.getElementById("admin-verification-queue");
    const filterSelect = document.getElementById("verify-filter-status");
    const queueBadge = document.getElementById("verif-queue-badge");
    const navBadge = document.getElementById("nav-pending-verify-count");
    if (!queueEl) return;

    const filterVal = filterSelect ? filterSelect.value : "pending";
    if (window.getUrviSpinnerHTML) {
        queueEl.innerHTML = window.getUrviSpinnerHTML({ text: "Scanning task uploads across all users..." });
    } else {
        queueEl.innerHTML = `<div class="text-center py-4 text-muted"><span class="spinner-border spinner-border-sm me-2"></span>Scanning task uploads across all users...</div>`;
    }

    try {
        const uactSnap = await get(child(ref(db), "user_activities"));
        if (!uactSnap.exists()) {
            if (queueBadge) queueBadge.innerText = "0 Pending";
            if (navBadge) navBadge.innerText = "0";
            queueEl.innerHTML = `<div class="text-center py-4 text-muted">No activity task submissions found in database.</div>`;
            return;
        }

        const allUacts = uactSnap.val();
        let tasksList = [];

        // Traverse user_activities/{userId}/{monthKey}/{activityId}/uploads/{uploadId}
        Object.entries(allUacts).forEach(([userId, monthsObj]) => {
            if (!monthsObj || typeof monthsObj !== "object") return;
            Object.entries(monthsObj).forEach(([monthKey, actsObj]) => {
                if (!actsObj || typeof actsObj !== "object") return;
                Object.entries(actsObj).forEach(([actId, actData]) => {
                    if (!actData || typeof actData !== "object" || !actData.uploads) return;
                    Object.entries(actData.uploads).forEach(([uploadId, uploadData]) => {
                        tasksList.push({
                            userId,
                            user: cachedUsersData[userId] || null,
                            monthKey,
                            actId,
                            actData,
                            uploadId,
                            ...uploadData
                        });
                    });
                });
            });
        });

        // Count pending
        const pendingCount = tasksList.filter(t => !t.verified && !t.rejected).length;
        if (queueBadge) queueBadge.innerText = `${pendingCount} Pending`;
        if (navBadge) navBadge.innerText = `${pendingCount}`;

        // Apply filter
        let filteredTasks = tasksList;
        if (filterVal === "pending") {
            filteredTasks = tasksList.filter(t => !t.verified && !t.rejected);
        } else if (filterVal === "verified") {
            filteredTasks = tasksList.filter(t => t.verified === true);
        } else if (filterVal === "rejected") {
            filteredTasks = tasksList.filter(t => t.rejected === true);
        }

        // Sort newest uploaded first
        filteredTasks.sort((a, b) => (b.uploadedAt || b.timestamp || 0) - (a.uploadedAt || a.timestamp || 0));

        if (filteredTasks.length === 0) {
            queueEl.innerHTML = `
                <div class="text-center py-5 text-muted">
                    <i class="bi bi-patch-check fs-1 text-success d-block mb-2"></i>
                    <h6 class="fw-bold">No tasks matching "${filterVal}"</h6>
                    <p class="small m-0">All submitted daily streak proofs have been processed!</p>
                </div>
            `;
            return;
        }

        queueEl.innerHTML = `
            <div class="row g-3">
                ${filteredTasks.map(t => {
                    const userName = t.user ? (t.user.firstName || t.user.name || t.userId) : t.userId;
                    const userAvatar = t.user?.profilePic && t.user.profilePic.length > 5 ? t.user.profilePic : `https://ui-avatars.com/api/?name=${encodeURIComponent(userName)}&background=22C55E&color=fff`;
                    const isVid = isVideoUrl(t.mediaUrl) || t.mediaType === "video";
                    const isPending = !t.verified && !t.rejected;
                    const isVerified = t.verified === true;
                    const isRejected = t.rejected === true;

                    const mediaMarkup = isVid
                        ? `<video src="${t.mediaUrl}" controls class="task-media-preview mb-2" style="max-height:240px; border-radius:12px; background:#0F172A;"></video>`
                        : `<img src="${t.mediaUrl}" alt="Task Proof" class="task-media-preview mb-2" style="max-height:240px; width:100%; object-fit:cover; border-radius:12px;" onerror="this.src='../assets/logo.png'">`;

                    const mapsLink = t.location && t.location.lat
                        ? `<a href="https://www.google.com/maps?q=${t.location.lat},${t.location.lng}" target="_blank" class="badge bg-primary text-decoration-none py-1 px-2"><i class="bi bi-geo-alt-fill me-1"></i> View GPS Location</a>`
                        : `<span class="badge bg-secondary-subtle text-secondary py-1 px-2">No GPS Tag</span>`;

                    let statusBadge = `<span class="badge bg-warning text-dark px-3 py-2 rounded-pill"><i class="bi bi-hourglass-split me-1"></i> Pending Verification</span>`;
                    if (isVerified) statusBadge = `<span class="badge bg-success px-3 py-2 rounded-pill"><i class="bi bi-check-circle me-1"></i> Verified Streak ✓</span>`;
                    if (isRejected) statusBadge = `<span class="badge bg-danger px-3 py-2 rounded-pill"><i class="bi bi-x-circle me-1"></i> Rejected</span>`;

                    return `
                        <div class="col-12 col-lg-6">
                            <div class="verification-task-card p-3 ${isPending ? 'pending' : ''}">
                                <div class="d-flex align-items-center justify-content-between mb-3">
                                    <div class="d-flex align-items-center gap-2">
                                        <img src="${userAvatar}" class="rounded-circle" style="width:36px; height:36px; object-fit:cover;" alt="${userName}">
                                        <div>
                                            <div class="fw-bold small text-dark">${userName}</div>
                                            <small class="text-muted" style="font-size:11px;">@${t.userId} • ${t.monthKey}</small>
                                        </div>
                                    </div>
                                    ${statusBadge}
                                </div>

                                <div class="mb-2">
                                    <div class="d-flex align-items-center justify-content-between mb-1">
                                        <span class="badge bg-success-subtle text-success fw-bold" style="font-size:12px;">
                                            ${t.actData.icon || "🌿"} ${t.actData.title || t.actId}
                                        </span>
                                        <span class="small text-muted" style="font-size:11px;">Day of: ${t.date || "Today"}</span>
                                    </div>
                                </div>

                                ${mediaMarkup}

                                <p class="small text-dark mb-2 fst-italic">"${t.caption || "No caption provided."}"</p>

                                <div class="d-flex align-items-center justify-content-between mb-3">
                                    ${mapsLink}
                                    <small class="text-muted" style="font-size:11px;">Uploaded: ${t.uploadedAt ? new Date(t.uploadedAt).toLocaleString() : 'Recent'}</small>
                                </div>

                                ${isPending ? `
                                    <div class="d-flex gap-2 pt-2 border-top">
                                        <button type="button" class="btn btn-success btn-sm rounded-pill flex-fill fw-bold btn-verify-task" 
                                            data-user="${t.userId}" data-month="${t.monthKey}" data-act="${t.actId}" data-upload="${t.uploadId}" data-title="${t.actData.title || 'Challenge'}">
                                            <i class="bi bi-check-lg me-1"></i> Verify & Award Streak
                                        </button>
                                        <button type="button" class="btn btn-outline-danger btn-sm rounded-pill px-3 fw-bold btn-reject-task" 
                                            data-user="${t.userId}" data-month="${t.monthKey}" data-act="${t.actId}" data-upload="${t.uploadId}" data-title="${t.actData.title || 'Challenge'}">
                                            <i class="bi bi-x-lg me-1"></i> Reject
                                        </button>
                                    </div>
                                ` : (isRejected && t.rejectionNote ? `
                                    <div class="small alert alert-danger py-1 px-2 m-0 mt-2"><strong>Reason:</strong> ${t.rejectionNote}</div>
                                ` : '')}
                            </div>
                        </div>
                    `;
                }).join("")}
            </div>
        `;

        // Wire Verify and Reject buttons
        queueEl.querySelectorAll(".btn-verify-task").forEach(btn => {
            btn.addEventListener("click", async () => {
                const uid = btn.dataset.user;
                const mkey = btn.dataset.month;
                const actId = btn.dataset.act;
                const upId = btn.dataset.upload;
                const actTitle = btn.dataset.title;

                btn.disabled = true;
                btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Verifying...`;

                try {
                    // 1. Mark upload verified
                    await update(ref(db, `user_activities/${uid}/${mkey}/${actId}/uploads/${upId}`), {
                        verified: true,
                        verifiedAt: Date.now(),
                        verifiedBy: currentUserId || "admin",
                        rejected: false
                    });

                    // 2. Fetch current activity state & increment streak
                    const actSnap = await get(child(ref(db), `user_activities/${uid}/${mkey}/${actId}`));
                    const actObj = actSnap.exists() ? actSnap.val() : {};
                    const newStreak = (actObj.streak || 0) + 1;
                    const newTotal = (actObj.totalDaysCompleted || 0) + 1;
                    const highestStreak = Math.max(newStreak, actObj.highestStreak || 0);

                    await update(ref(db, `user_activities/${uid}/${mkey}/${actId}`), {
                        streak: newStreak,
                        totalDaysCompleted: newTotal,
                        highestStreak: highestStreak,
                        lastUploadDate: new Date().toISOString().split("T")[0]
                    });

                    // 3. Award points to user profile
                    const dailyPts = actObj.pointsPerDay || 10;
                    const uSnap = await get(child(ref(db), `users/${uid}`));
                    if (uSnap.exists()) {
                        const uData = uSnap.val();
                        await update(ref(db, `users/${uid}`), {
                            points: (uData.points || 0) + dailyPts,
                            contributions: (uData.contributions || 0) + 1,
                            currentStreak: Math.max(newStreak, uData.currentStreak || 0)
                        });
                    }

                    // 4. Send In-App Notification
                    const notifRef = push(ref(db, `notifications/${uid}`));
                    await set(notifRef, {
                        title: "Daily Task Verified! 🔥",
                        message: `Your task for '${actTitle}' was verified! Streak is now ${newStreak} days. +${dailyPts} Green Points awarded!`,
                        type: "activity_verified",
                        timestamp: Date.now(),
                        read: false
                    });

                    await logAdminAction("ACTIVITY_TASK_VERIFY", `${uid}:${actId}:${upId}`, `Verified day task for user '${uid}' in '${actTitle}'. Streak: ${newStreak}`);
                    await renderVerificationQueue();
                } catch (err) {
                    console.error("Verify task error:", err);
                    alert("Verification error: " + err.message);
                    btn.disabled = false;
                    btn.innerHTML = `<i class="bi bi-check-lg me-1"></i> Verify & Award Streak`;
                }
            });
        });

        queueEl.querySelectorAll(".btn-reject-task").forEach(btn => {
            btn.addEventListener("click", async () => {
                const uid = btn.dataset.user;
                const mkey = btn.dataset.month;
                const actId = btn.dataset.act;
                const upId = btn.dataset.upload;
                const actTitle = btn.dataset.title;

                const reason = prompt("Enter a brief reason for rejecting this proof (will be sent to user):", "Photo did not show verified task proof.");
                if (reason === null) return; // user cancelled

                btn.disabled = true;

                try {
                    await update(ref(db, `user_activities/${uid}/${mkey}/${actId}/uploads/${upId}`), {
                        verified: false,
                        rejected: true,
                        rejectedAt: Date.now(),
                        rejectedBy: currentUserId || "admin",
                        rejectionNote: reason.trim() || "Proof did not meet guidelines."
                    });

                    // Send notification to user
                    const notifRef = push(ref(db, `notifications/${uid}`));
                    await set(notifRef, {
                        title: "Daily Task Rejected ⚠️",
                        message: `Your upload for '${actTitle}' was rejected: "${reason.trim()}". Please submit a new valid upload to protect your streak.`,
                        type: "activity_rejected",
                        timestamp: Date.now(),
                        read: false
                    });

                    await logAdminAction("ACTIVITY_TASK_REJECT", `${uid}:${actId}:${upId}`, `Rejected upload for user '${uid}' in '${actTitle}'. Reason: ${reason}`);
                    await renderVerificationQueue();
                } catch (err) {
                    console.error("Reject task error:", err);
                    alert("Rejection error: " + err.message);
                    btn.disabled = false;
                }
            });
        });

    } catch (err) {
        console.error("Render verification queue error:", err);
        queueEl.innerHTML = `<div class="alert alert-danger">Error loading task verification queue: ${err.message}</div>`;
    }
}

// -----------------------------------------------------------------
// 7. 24-Hour Stories Moderation & Pruning
// -----------------------------------------------------------------
async function loadStoryModerationTab() {
    const pruneBtn = document.getElementById("btn-prune-expired-stories");
    pruneBtn?.addEventListener("click", () => pruneExpiredStories());
    await renderStoriesModerationList();
}

async function renderStoriesModerationList() {
    const gridEl = document.getElementById("admin-stories-grid");
    const countBadge = document.getElementById("stories-live-count-badge");
    const navBadge = document.getElementById("nav-active-stories-count");
    if (!gridEl) return;

    if (window.getUrviSpinnerHTML) {
        gridEl.innerHTML = window.getUrviSpinnerHTML({ text: "Loading active 24-hr stories..." });
    } else {
        gridEl.innerHTML = `<div class="text-center py-4 text-muted"><span class="spinner-border spinner-border-sm me-2"></span>Loading active 24-hr stories...</div>`;
    }

    try {
        const snap = await get(child(ref(db), "stories"));
        if (!snap.exists()) {
            if (countBadge) countBadge.innerText = "0 Active";
            if (navBadge) navBadge.innerText = "0";
            gridEl.innerHTML = `<div class="text-center py-4 text-muted">No active stories found.</div>`;
            return;
        }

        const storiesData = snap.val();
        const now = Date.now();
        const storiesList = Object.entries(storiesData).map(([id, s]) => ({ id, ...s }));

        const activeStories = storiesList.filter(s => s.expiresAt && s.expiresAt > now);
        if (countBadge) countBadge.innerText = `${activeStories.length} Active`;
        if (navBadge) navBadge.innerText = `${activeStories.length}`;

        // Sort newest first
        storiesList.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

        gridEl.innerHTML = `
            <div class="row g-3">
                ${storiesList.map(s => {
                    const isExpired = s.expiresAt ? now > s.expiresAt : false;
                    const timeLeftMs = (s.expiresAt || 0) - now;
                    const hoursLeft = Math.max(0, Math.floor(timeLeftMs / (1000 * 60 * 60)));
                    const minsLeft = Math.max(0, Math.floor((timeLeftMs % (1000 * 60 * 60)) / (1000 * 60)));

                    const isVid = isVideoUrl(s.mediaUrl) || s.mediaType === "video";
                    const mediaElement = isVid
                        ? `<video src="${s.mediaUrl}" controls class="admin-story-thumb"></video>`
                        : `<img src="${s.mediaUrl}" class="admin-story-thumb" alt="Story" onerror="this.src='../assets/logo.png'">`;

                    return `
                        <div class="col-12 col-sm-6 col-md-4 col-xl-3">
                            <div class="admin-story-card ${isExpired ? 'opacity-50' : ''}">
                                ${mediaElement}
                                <div class="p-3">
                                    <div class="d-flex align-items-center justify-content-between mb-2">
                                        <div class="fw-bold small text-truncate" style="max-width:120px;">@${s.username || s.userId || 'User'}</div>
                                        ${isExpired 
                                            ? `<span class="badge bg-secondary">Expired</span>` 
                                            : `<span class="badge bg-info text-dark">${hoursLeft}h ${minsLeft}m left</span>`}
                                    </div>
                                    <div class="d-flex align-items-center gap-2 mb-2" style="font-size:11px;">
                                        <span class="badge bg-light text-danger border"><i class="bi bi-heart-fill me-1"></i>${Object.keys(s.likes || {}).length}</span>
                                        <span class="badge bg-light text-primary border"><i class="bi bi-eye-fill me-1"></i>${Object.keys(s.views || {}).length} views</span>
                                    </div>
                                    <p class="small text-muted mb-2 text-truncate" style="font-size:11px;">"${s.caption || 'No caption'}"</p>
                                    <div class="d-flex align-items-center justify-content-between pt-2 border-top">
                                        <small class="text-muted" style="font-size:10px;">${new Date(s.createdAt || 0).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</small>
                                        <button type="button" class="btn btn-outline-danger btn-sm rounded-pill px-3 btn-delete-story" data-id="${s.id}">
                                            <i class="bi bi-trash3 me-1"></i> Delete
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    `;
                }).join("")}
            </div>
        `;

        // Wire delete buttons
        gridEl.querySelectorAll(".btn-delete-story").forEach(btn => {
            btn.addEventListener("click", async () => {
                const id = btn.dataset.id;
                const story = storiesData[id];
                if (!confirm(`Delete story by '@${story?.username || story?.userId || id}'?`)) return;

                btn.disabled = true;
                try {
                    await remove(ref(db, `stories/${id}`));
                    if (story?.mediaUrl) {
                        const { public_id, resource_type } = extractPublicIdFromUrl(story.mediaUrl);
                        if (public_id) deleteFromCloudinary(public_id, resource_type);
                    }
                    await logAdminAction("STORY_DELETE", id, `Deleted story posted by '${story?.userId}'`);
                    await renderStoriesModerationList();
                } catch (err) {
                    alert("Failed to delete story: " + err.message);
                    btn.disabled = false;
                }
            });
        });

    } catch (err) {
        console.error("Render stories error:", err);
        gridEl.innerHTML = `<div class="alert alert-danger">Error loading stories: ${err.message}</div>`;
    }
}

async function pruneExpiredStories() {
    const pruneBtn = document.getElementById("btn-prune-expired-stories");
    if (pruneBtn) pruneBtn.disabled = true;

    try {
        const snap = await get(child(ref(db), "stories"));
        if (!snap.exists()) {
            alert("No stories to prune.");
            if (pruneBtn) pruneBtn.disabled = false;
            return;
        }

        const stories = snap.val();
        const now = Date.now();
        let deletedCount = 0;

        for (const [id, s] of Object.entries(stories)) {
            if (s.expiresAt && now > s.expiresAt) {
                await remove(ref(db, `stories/${id}`));
                if (s.mediaUrl) {
                    const { public_id, resource_type } = extractPublicIdFromUrl(s.mediaUrl);
                    if (public_id) deleteFromCloudinary(public_id, resource_type);
                }
                deletedCount++;
            }
        }

        alert(`Pruned ${deletedCount} expired stories.`);
        await renderStoriesModerationList();
    } catch (err) {
        alert("Pruning error: " + err.message);
    } finally {
        if (pruneBtn) pruneBtn.disabled = false;
    }
}

// -----------------------------------------------------------------
// 8. Global Unified Impact Stats Editor
// -----------------------------------------------------------------
async function loadGlobalStatsTab() {
    const treesInput = document.getElementById("gstat-trees");
    const volunteersInput = document.getElementById("gstat-volunteers");
    const campaignsInput = document.getElementById("gstat-campaigns");
    const pointsInput = document.getElementById("gstat-points");
    const form = document.getElementById("global-stats-editor-form");
    const feedback = document.getElementById("gstat-feedback");
    const submitBtn = document.getElementById("btn-save-global-stats");

    if (!form) return;

    try {
        const snap = await get(child(ref(db), "global_impact"));
        if (snap.exists()) {
            const g = snap.val();
            if (treesInput) treesInput.value = g.trees || 0;
            if (volunteersInput) volunteersInput.value = g.volunteers || 0;
            if (campaignsInput) campaignsInput.value = g.campaigns || 0;
            if (pointsInput) pointsInput.value = g.points || 0;
        }
    } catch (err) {
        console.error("Fetch global impact error:", err);
    }

    if (!form._isInitialized) {
        form._isInitialized = true;
        form.addEventListener("submit", async (e) => {
            e.preventDefault();
            if (submitBtn) submitBtn.disabled = true;

            const trees = parseInt(treesInput.value, 10) || 0;
            const volunteers = parseInt(volunteersInput.value, 10) || 0;
            const campaigns = parseInt(campaignsInput.value, 10) || 0;
            const points = parseInt(pointsInput.value, 10) || 0;

            try {
                await update(ref(db, "global_impact"), {
                    trees,
                    volunteers,
                    campaigns,
                    points,
                    updatedAt: Date.now(),
                    updatedBy: currentUserId || "admin"
                });

                await logAdminAction("GLOBAL_STATS_UPDATE", "global_impact", `Updated global metrics: ${trees} trees, ${volunteers} vols, ${campaigns} cmps, ${points} pts`);

                if (feedback) {
                    feedback.classList.remove("d-none");
                    setTimeout(() => feedback.classList.add("d-none"), 3000);
                }
                alert("Global impact metrics successfully saved! 🌍");
            } catch (err) {
                alert("Failed to save global stats: " + err.message);
            } finally {
                if (submitBtn) submitBtn.disabled = false;
            }
        });
    }
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
