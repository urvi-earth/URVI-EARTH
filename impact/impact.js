/* =====================================================
   URVI – impact.js | Unified Metrics, Campaigns & Pinned Announcements
   ===================================================== */
import { db, ref, get, child, set, update, push, remove } from "../config.js";

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

const currentUserId = getActiveUserId();
let allEventsList = [];
let selectedCategory = "All";
let pinnedPostsList = [];

document.addEventListener("DOMContentLoaded", () => {
    initImpactPage();
    setupCategoryFilters();
});

async function initImpactPage() {
    await fetchGlobalMetrics();
    await fetchCampaignsAndEvents();
    await fetchPinnedPosts();
    renderPinnedPosts();
}

/** 1. Unified Global Real-time Metrics */
async function fetchGlobalMetrics() {
    const treesEl = document.getElementById("impact-stat-trees");
    const volsEl = document.getElementById("impact-stat-volunteers");
    const campsEl = document.getElementById("impact-stat-campaigns");
    const ptsEl = document.getElementById("impact-stat-points");

    try {
        const snap = await get(child(ref(db), "global_impact"));
        if (snap.exists()) {
            const g = snap.val();
            if (treesEl) treesEl.innerText = (g.trees || 0).toLocaleString() + "+";
            if (volsEl) volsEl.innerText = (g.volunteers || 0).toLocaleString() + "+";
            if (campsEl) campsEl.innerText = (g.campaigns || 0).toLocaleString();
            if (ptsEl) ptsEl.innerText = (g.points || 0).toLocaleString() + "+";
        } else {
            if (treesEl) treesEl.innerText = "400+";
            if (volsEl) volsEl.innerText = "350+";
            if (campsEl) campsEl.innerText = "18";
            if (ptsEl) ptsEl.innerText = "5,000+";
        }
    } catch (e) {
        console.warn("Global impact fetch error:", e);
    }
}

/** 2. Campaigns and Drives */
async function fetchCampaignsAndEvents() {
    const eventsGrid = document.getElementById("events-grid");
    if (!eventsGrid) return;

    if (window.getUrviSpinnerHTML) {
        eventsGrid.innerHTML = `<div class="col-12">${window.getUrviSpinnerHTML({ text: "Loading upcoming campaigns..." })}</div>`;
    } else {
        eventsGrid.innerHTML = `<div class="col-12 text-center py-4 text-muted"><span class="spinner-border spinner-border-sm me-2"></span>Loading upcoming campaigns...</div>`;
    }

    try {
        const snap = await get(child(ref(db), "events"));
        if (!snap.exists()) {
            renderEmptyEventsState();
            renderMyJoinedActivities([]);
            return;
        }

        const eventsData = snap.val();
        allEventsList = Object.keys(eventsData).map(k => ({ id: k, ...eventsData[k] }));

        // Sort newest first
        allEventsList.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

        renderUpcomingEvents();
        renderMyJoinedActivities(allEventsList);

    } catch (err) {
        console.error("Load campaigns error:", err);
        renderEmptyEventsState();
    } finally {
        if (window.hideUrviLoader) window.hideUrviLoader();
    }
}

function setupCategoryFilters() {
    document.querySelectorAll(".category-filter-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".category-filter-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            selectedCategory = btn.dataset.category || "All";
            renderUpcomingEvents();
        });
    });
}

function renderUpcomingEvents() {
    const eventsGrid = document.getElementById("events-grid");
    const countBadge = document.getElementById("campaigns-count-badge");
    if (!eventsGrid) return;

    let filteredEvents = allEventsList.filter(e => e.status !== "cancelled");
    if (selectedCategory !== "All") {
        filteredEvents = filteredEvents.filter(e => e.category === selectedCategory);
    }

    if (countBadge) countBadge.innerText = `${filteredEvents.length} Campaigns`;

    if (filteredEvents.length === 0) {
        eventsGrid.innerHTML = `
            <div class="col-12 text-center py-5">
                <div class="mb-2" style="font-size:36px;">🌿</div>
                <h6 class="fw-bold text-dark">No campaigns listed under "${selectedCategory}" right now.</h6>
                <small class="text-muted">Stay tuned as new drives are announced soon!</small>
            </div>
        `;
        return;
    }

    eventsGrid.innerHTML = filteredEvents.map(event => {
        const isJoined = currentUserId && event.participants && event.participants[currentUserId] !== undefined;
        const now = Date.now();
        const deadlineMs = event.deadlineTimestamp || (event.deadline ? new Date(event.deadline).getTime() : 0);
        const isExpired = deadlineMs > 0 && now > deadlineMs;
        const isCompleted = event.status === "completed";
        const participantCount = event.participants ? Object.keys(event.participants).length : (event.participantsCount || 0);
        const maxCap = event.maxCapacity || 0;
        const isFull = maxCap > 0 && participantCount >= maxCap;

        let actionBtnHTML = "";
        if (isCompleted) {
            actionBtnHTML = `
                <div class="btn btn-primary w-100 rounded-pill py-2 btn-sm fw-bold disabled border-0" style="background:#2563EB; font-size:12px;">
                    <i class="bi bi-check-all me-1"></i> Campaign Completed
                </div>`;
        } else if (isJoined) {
            actionBtnHTML = `
                <button type="button" class="btn btn-outline-danger w-100 rounded-pill py-2 btn-sm fw-bold btn-cancel-rsvp" data-event-id="${event.id}" style="font-size:12px;">
                    <i class="bi bi-x-circle me-1"></i> Cancel RSVP
                </button>`;
        } else if (isExpired) {
            actionBtnHTML = `
                <button type="button" class="btn btn-secondary w-100 rounded-pill py-2 btn-sm fw-bold disabled" style="font-size:12px;">
                    <i class="bi bi-clock-history me-1"></i> Registration Closed
                </button>`;
        } else if (isFull) {
            actionBtnHTML = `
                <button type="button" class="btn btn-secondary w-100 rounded-pill py-2 btn-sm fw-bold disabled" style="font-size:12px;">
                    <i class="bi bi-people-fill me-1"></i> Capacity Full
                </button>`;
        } else {
            actionBtnHTML = `
                <button type="button" class="btn btn-success w-100 rounded-pill py-2 btn-sm fw-bold shadow-sm btn-join-event" data-event-id="${event.id}" style="font-size:12px;">
                    <i class="bi bi-box-arrow-in-right me-1"></i> Join This Drive
                </button>`;
        }

        const bannerImg = event.bannerUrl || event.imageUrl || "../assets/logo.png";
        const hasCustomBanner = event.bannerUrl || event.imageUrl;

        const bannerMarkup = hasCustomBanner ? `
            <div class="campaign-banner-wrapper">
                <img src="${bannerImg}" class="w-100 h-100" style="object-fit:cover;" alt="${event.title}" onerror="this.src='../assets/logo.png'">
                <span class="badge position-absolute top-0 end-0 m-3 fw-bold shadow-sm" style="background: rgba(245, 158, 11, 0.95); color: #0F172A; font-size: 10.5px; padding: 4px 10px; border-radius: 30px; z-index: 2;">
                    <i class="bi bi-star-fill me-1"></i> ${event.points || 100} Eco Pts
                </span>
            </div>
        ` : `
            <div class="campaign-banner-wrapper d-flex align-items-center justify-content-center" style="background: linear-gradient(135deg, #14532D 0%, #15803D 50%, #22C55E 100%);">
                <span class="badge position-absolute top-0 end-0 m-3 fw-bold shadow-sm" style="background: rgba(245, 158, 11, 0.95); color: #0F172A; font-size: 10.5px; padding: 4px 10px; border-radius: 30px; z-index: 2;">
                    <i class="bi bi-star-fill me-1"></i> ${event.points || 100} Eco Pts
                </span>
                <img src="${bannerImg}" style="max-height: 70px; width: auto; object-fit: contain; filter: drop-shadow(0 4px 8px rgba(0,0,0,0.25));" alt="${event.title}">
            </div>
        `;

        return `
            <div class="col-12 col-md-6 col-xl-4">
                <div class="campaign-card">
                    ${bannerMarkup}
                    <div class="p-3 d-flex flex-column justify-content-between flex-grow-1">
                        <div>
                            <div class="d-flex align-items-center justify-content-between mb-2">
                                <span class="badge bg-success-subtle text-success rounded-pill px-2 py-1 small fw-semibold">
                                    ${event.category || 'Campaign'}
                                </span>
                                <small class="text-muted fw-semibold" style="font-size:11px;">
                                    <i class="bi bi-people-fill text-success me-1"></i>${participantCount}${maxCap > 0 ? ` / ${maxCap}` : ''} Joined
                                </small>
                            </div>
                            <h5 class="fw-bold text-dark mb-1 text-truncate" style="font-size:1.02rem;">${event.title}</h5>
                            <p class="small text-muted mb-3" style="font-size:12px; line-height:1.4; height:34px; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;">
                                ${event.desc || event.description || 'Join our environmental restoration initiative.'}
                            </p>
                            <div class="small text-muted mb-1" style="font-size:11.5px;">
                                <i class="bi bi-geo-alt-fill text-danger me-1"></i>${event.location || 'Site Location'}
                            </div>
                            <div class="small text-muted mb-3" style="font-size:11.5px;">
                                <i class="bi bi-calendar-event text-primary me-1"></i>${event.date || 'Upcoming'}
                            </div>
                        </div>

                        <div class="pt-2 border-top">
                            ${actionBtnHTML}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join("");

    wireCampaignButtons();
}

function wireCampaignButtons() {
    document.querySelectorAll(".btn-join-event").forEach(btn => {
        btn.addEventListener("click", async () => {
            if (!currentUserId) {
                alert("Please log in to join campaigns!");
                window.location.href = "../logins/login.html";
                return;
            }

            const eventId = btn.dataset.eventId;
            btn.disabled = true;

            try {
                const uSnap = await get(child(ref(db), `users/${currentUserId}`));
                const user = uSnap.exists() ? uSnap.val() : {};
                const fullName = `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.name || "Volunteer";

                await set(ref(db, `events/${eventId}/participants/${currentUserId}`), {
                    userId: currentUserId,
                    name: fullName,
                    email: user.email || "",
                    registeredAt: Date.now()
                });

                alert("🎉 Successfully registered for this environmental drive!");
                await fetchCampaignsAndEvents();
            } catch (err) {
                alert("Registration failed: " + err.message);
                btn.disabled = false;
            }
        });
    });

    document.querySelectorAll(".btn-cancel-rsvp").forEach(btn => {
        btn.addEventListener("click", async () => {
            if (!confirm("Are you sure you want to cancel your registration?")) return;
            const eventId = btn.dataset.eventId;
            btn.disabled = true;

            try {
                await remove(ref(db, `events/${eventId}/participants/${currentUserId}`));
                alert("Registration cancelled.");
                await fetchCampaignsAndEvents();
            } catch (err) {
                alert("Cancellation failed: " + err.message);
                btn.disabled = false;
            }
        });
    });
}

function renderMyJoinedActivities(events) {
    const regSection = document.getElementById("my-registered-section");
    const regGrid = document.getElementById("my-activities-grid");
    if (!regSection || !regGrid || !currentUserId) return;

    const myEvents = events.filter(e => e.participants && e.participants[currentUserId] !== undefined);
    if (myEvents.length === 0) {
        regSection.style.display = "none";
        return;
    }

    regSection.style.display = "block";
    regGrid.innerHTML = myEvents.map(e => {
        const isCompleted = e.status === "completed";
        return `
            <div class="col-12 col-md-6 col-xl-4">
                <div class="p-3 border rounded-4 bg-white d-flex align-items-center justify-content-between h-100">
                    <div>
                        <span class="badge ${isCompleted ? 'bg-primary' : 'bg-success'} rounded-pill mb-1" style="font-size:10px;">
                            ${isCompleted ? 'Completed ✓' : 'Registered'}
                        </span>
                        <h6 class="fw-bold m-0 text-dark">${e.title}</h6>
                        <small class="text-muted" style="font-size:11px;"><i class="bi bi-calendar3 me-1"></i>${e.date || 'Scheduled'}</small>
                    </div>
                    <div class="text-end">
                        <span class="badge bg-warning text-dark">+${e.points || 100} pts</span>
                    </div>
                </div>
            </div>
        `;
    }).join("");
}

function renderEmptyEventsState() {
    const eventsGrid = document.getElementById("events-grid");
    if (eventsGrid) {
        eventsGrid.innerHTML = `
            <div class="col-12 text-center py-5">
                <div class="mb-2" style="font-size:36px;">🍃</div>
                <h5 class="fw-bold text-dark">No upcoming campaigns available right now.</h5>
                <small class="text-muted">Please check back soon!</small>
            </div>
        `;
    }
}

/** 3. Pinned Announcements (Community Highlights) */
async function fetchPinnedPosts() {
    try {
        const pSnap = await get(child(ref(db), "community/posts"));
        if (pSnap.exists()) {
            const posts = pSnap.val();
            pinnedPostsList = Object.keys(posts)
                .map(k => ({ id: k, ...posts[k] }))
                .filter(p => p.isPinned === true && !p.hidden);

            pinnedPostsList.sort((a, b) => (b.pinnedAt || b.createdAt || 0) - (a.pinnedAt || a.createdAt || 0));
        }
    } catch (e) {
        console.warn("Pinned posts fetch error:", e);
    }
}

function renderPinnedPosts() {
    const container = document.getElementById("pinned-posts-container");
    if (!container) return;

    if (!pinnedPostsList || pinnedPostsList.length === 0) {
        container.innerHTML = `
            <div class="col-12 text-center py-4">
                <p class="text-muted small m-0">No pinned announcements right now.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = pinnedPostsList.map(post => {
        const author = post.authorName || post.authorId || "URVI Team";
        const avatar = post.authorPic || `https://ui-avatars.com/api/?name=${encodeURIComponent(author)}&background=22C55E&color=fff`;
        const timeAgo = post.createdAt ? new Date(post.createdAt).toLocaleDateString() : "Pinned";

        return `
            <div class="col-12 col-md-6 col-xl-4">
                <div class="p-3 border rounded-4 bg-white h-100 d-flex flex-column justify-content-between shadow-sm">
                    <div>
                        <div class="d-flex align-items-center gap-2 mb-2">
                            <img src="${avatar}" class="rounded-circle" style="width:32px; height:32px; object-fit:cover;" alt="${author}">
                            <div>
                                <div class="fw-bold small text-dark">${author}</div>
                                <small class="text-muted" style="font-size:10px;">${timeAgo}</small>
                            </div>
                        </div>
                        <p class="small text-dark mb-3" style="line-height:1.4; font-size:12px;">${post.text || post.caption || ""}</p>
                    </div>
                    <div class="d-flex align-items-center justify-content-between pt-2 border-top">
                        <span class="badge bg-success-subtle text-success small"><i class="bi bi-pin-angle-fill me-1"></i>Official</span>
                        <a href="../community/community.html" class="btn btn-sm btn-link text-success fw-bold text-decoration-none p-0" style="font-size:12px;">
                            View in Community →
                        </a>
                    </div>
                </div>
            </div>
        `;
    }).join("");
}
