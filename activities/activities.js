/* =====================================================
   URVI – activities.js | Dynamic Events, Drives & Participation Lifecycle
   ===================================================== */
import { db, ref, get, child, set, update, push } from "../config.js";

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

document.addEventListener("DOMContentLoaded", () => {
    loadActivitiesPage();
    setupCategoryFilters();
});

async function loadActivitiesPage() {
    const eventsGrid = document.getElementById("events-grid");
    if (!eventsGrid) return;

    try {
        const eventsSnap = await get(child(ref(db), "events"));
        if (!eventsSnap.exists()) {
            renderEmptyEventsState();
            renderMyJoinedActivities([]);
            return;
        }

        const eventsData = eventsSnap.val();
        allEventsList = Object.keys(eventsData).map(key => ({ id: key, ...eventsData[key] }));
        
        // Sort newest first
        allEventsList.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

        renderUpcomingEvents();
        renderMyJoinedActivities(allEventsList);

    } catch (err) {
        console.error("Load activities error:", err);
        renderEmptyEventsState();
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
    if (!eventsGrid) return;

    const activeUserId = getActiveUserId();
    let filteredEvents = allEventsList.filter(e => e.status !== "cancelled");
    if (selectedCategory !== "All") {
        filteredEvents = filteredEvents.filter(e => e.category === selectedCategory);
    }

    if (filteredEvents.length === 0) {
        eventsGrid.innerHTML = `
            <div class="col-12 text-center py-5">
                <div class="mb-2" style="font-size:42px;">🌿</div>
                <h5 class="fw-bold text-dark">No drives listed under "${selectedCategory}" right now.</h5>
                <small class="text-muted">Check back soon for new community campaigns!</small>
            </div>
        `;
        return;
    }

    eventsGrid.innerHTML = filteredEvents.map(event => {
        const isJoined = activeUserId && event.participants && event.participants[activeUserId] !== undefined;
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
                <div class="btn btn-primary w-100 rounded-pill py-2 btn-sm fw-bold text-nowrap text-truncate disabled border-0" style="background:#2563EB; font-size:12px;">
                    <i class="bi bi-check-all me-1"></i> Campaign Completed
                </div>`;
        } else if (isExpired) {
            actionBtnHTML = `
                <div class="btn btn-secondary w-100 rounded-pill py-2 btn-sm fw-bold text-nowrap text-truncate disabled border-0" style="background:#64748B; font-size:12px;">
                    <i class="bi bi-clock-history me-1"></i> Registration Deadline Expired
                </div>`;
        } else if (isFull && !isJoined) {
            actionBtnHTML = `
                <div class="btn btn-warning w-100 rounded-pill py-2 btn-sm fw-bold text-nowrap text-truncate disabled border-0 text-dark" style="background:#F59E0B; font-size:12px;">
                    <i class="bi bi-exclamation-triangle me-1"></i> Capacity Full (${participantCount}/${maxCap})
                </div>`;
        } else if (!activeUserId) {
            actionBtnHTML = `
                <a href="../logins/login.html" class="btn btn-outline-success w-100 rounded-pill py-2 btn-sm fw-bold text-nowrap text-truncate" style="font-size:12px;">
                    Log In to Join Drive
                </a>`;
        } else if (isJoined) {
            actionBtnHTML = `
                <button type="button" class="btn btn-danger w-100 rounded-pill py-2 btn-sm fw-bold btn-cancel-event text-nowrap text-truncate" data-id="${event.id}" style="font-size:12px;">
                    <i class="bi bi-x-circle me-1"></i> Cancel Registration
                </button>`;
        } else {
            actionBtnHTML = `
                <button type="button" class="btn btn-success w-100 rounded-pill py-2 btn-sm fw-bold btn-join-event text-nowrap text-truncate" data-id="${event.id}" style="font-size:12px;">
                    <i class="bi bi-plus-circle me-1"></i> Join Event (${participantCount})
                </button>`;
        }

        const hasCustomBanner = event.bannerUrl || event.imageUrl;
        const bannerImg = hasCustomBanner || "../assets/logo.png";
        const pointsReward = event.points || 100;

        const bannerMarkup = hasCustomBanner ? `
            <div class="card-img-wrapper position-relative" style="height: 160px; overflow: hidden; background: #0F172A;">
                <img src="${bannerImg}" class="w-100 h-100" style="object-fit: cover;" alt="${event.title}" onerror="this.src='../assets/logo.png'">
                <span class="badge position-absolute top-0 end-0 m-3 fw-bold shadow-sm" style="background: rgba(245, 158, 11, 0.95); color: #0F172A; font-size: 11px; padding: 5px 11px; border-radius: 30px; z-index: 2;">
                    <i class="bi bi-star-fill me-1"></i> ${pointsReward} Eco Pts
                </span>
            </div>
        ` : `
            <div class="card-img-wrapper position-relative d-flex align-items-center justify-content-center" style="height: 150px; overflow: hidden; background: linear-gradient(135deg, #14532D 0%, #15803D 50%, #22C55E 100%);">
                <span class="badge position-absolute top-0 end-0 m-3 fw-bold shadow-sm" style="background: rgba(245, 158, 11, 0.95); color: #0F172A; font-size: 11px; padding: 5px 11px; border-radius: 30px; z-index: 2;">
                    <i class="bi bi-star-fill me-1"></i> ${pointsReward} Eco Pts
                </span>
                <img src="${bannerImg}" style="max-height: 85px; width: auto; object-fit: contain; filter: drop-shadow(0 4px 12px rgba(0,0,0,0.25));" alt="${event.title}">
            </div>
        `;

        return `
            <div class="col-12 col-md-6 col-lg-4">
                <div class="card h-100 border-0 shadow-sm rounded-4 overflow-hidden position-relative d-flex flex-column" style="background: #ffffff;">
                    ${bannerMarkup}
                    
                    <div class="card-body p-3 p-md-4 d-flex flex-column justify-content-between flex-grow-1">
                        <div>
                            <div class="d-flex align-items-center justify-content-between gap-2 mb-2 flex-wrap">
                                <span class="badge bg-success-subtle text-success rounded-pill px-3 py-1 fw-semibold text-truncate" style="max-width: 60%; font-size: 11px;">
                                    ${event.category || "Eco Drive"}
                                </span>
                                <small class="text-muted fw-semibold flex-shrink-0" style="font-size: 11px;">
                                    <i class="bi bi-people-fill text-success me-1"></i>${participantCount}${maxCap > 0 ? '/' + maxCap : ''} Joined
                                </small>
                            </div>

                            <h5 class="fw-bold text-dark mb-2 text-truncate-2" style="font-size: 1rem; line-height: 1.35; min-height: 2.7rem;">
                                ${event.title}
                            </h5>
                            
                            <p class="text-muted small mb-3" style="font-size: 12px; line-height: 1.5; height: 36px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">
                                ${event.description || "Join our community initiative for a greener future."}
                            </p>
                        </div>

                        <div class="border-top pt-3 mt-auto">
                            <div class="d-flex align-items-center gap-2 mb-1 text-muted small" style="font-size: 12px;">
                                <i class="bi bi-geo-alt-fill text-danger flex-shrink-0"></i>
                                <span class="text-truncate">${event.location || "Site Location"}</span>
                            </div>
                            <div class="d-flex align-items-center gap-2 mb-3 text-muted small" style="font-size: 12px;">
                                <i class="bi bi-calendar-check-fill text-primary flex-shrink-0"></i>
                                <span class="text-truncate">Date: ${event.eventDate || "Upcoming"}</span>
                            </div>

                            <div class="w-100">
                                ${actionBtnHTML}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join("");

    bindEventButtons();
}

function renderMyJoinedActivities(events) {
    const myGrid = document.getElementById("my-activities-grid");
    if (!myGrid) return;

    const activeUserId = getActiveUserId();
    if (!activeUserId) {
        myGrid.innerHTML = `
            <div class="col-12">
                <div class="p-3 bg-light rounded-4 text-muted small">
                    Please log in to view your registered activities.
                </div>
            </div>
        `;
        return;
    }

    const myJoined = events.filter(e => e.participants && e.participants[activeUserId] !== undefined);

    if (myJoined.length === 0) {
        myGrid.innerHTML = `
            <div class="col-12 text-center py-4 bg-light rounded-4">
                <p class="text-muted mb-2" style="font-size:14px;">You have not registered for any campaigns yet.</p>
                <small class="text-success fw-bold">Browse upcoming drives above and join an initiative!</small>
            </div>
        `;
        return;
    }

    myGrid.innerHTML = myJoined.map(e => {
        const particData = e.participants[activeUserId];
        const statusStr = typeof particData === "object" ? particData.attendance || "Registered" : "Registered";
        const badgeColor = statusStr === "Participated" ? "bg-success text-white" : statusStr === "Absent" ? "bg-secondary text-white" : "bg-info text-white";

        return `
            <div class="col-12 col-md-6 col-xl-4">
                <div class="card h-100 border-0 shadow-sm rounded-4 bg-white p-3" style="border: 1px solid rgba(21, 128, 61, 0.16) !important; transition: transform 0.2s ease, box-shadow 0.2s ease;">
                    <div class="d-flex align-items-start gap-3">
                        <div class="rounded-4 bg-success bg-opacity-10 text-success d-flex align-items-center justify-content-center flex-shrink-0" style="width:46px; height:46px; font-size:22px;">
                            🌱
                        </div>
                        <div class="flex-grow-1 min-w-0">
                            <div class="d-flex align-items-center justify-content-between gap-2 mb-1 flex-wrap">
                                <span class="badge ${badgeColor} rounded-pill px-2.5 py-1 fw-semibold" style="font-size:11px;">${statusStr}</span>
                                <span class="badge bg-success-subtle text-success rounded-pill px-2 py-0.5" style="font-size:11px;">${e.category || "Eco Drive"}</span>
                            </div>
                            <h6 class="fw-bold text-dark mb-1 text-break" style="font-size: 15px; line-height: 1.35;">${e.title}</h6>
                            <div class="text-muted small d-flex flex-column gap-1 mt-1" style="font-size: 12px;">
                                <div><i class="bi bi-calendar-check text-success me-1"></i>Date: <strong>${e.eventDate || "Upcoming"}</strong></div>
                                <div class="text-truncate"><i class="bi bi-geo-alt text-danger me-1"></i>Location: <strong>${e.location || "Site Location"}</strong></div>
                            </div>
                            ${statusStr === "Participated" ? `
                                <div class="mt-2 pt-2 border-top">
                                    <a href="../profile/mycertificates.html" class="btn btn-sm btn-outline-success rounded-pill w-100 fw-bold" style="font-size:12px;">
                                        <i class="bi bi-award-fill me-1"></i> View Official Certificate
                                    </a>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join("");
}

function bindEventButtons() {
    document.querySelectorAll(".btn-join-event").forEach(btn => {
        btn.addEventListener("click", async (e) => {
            const eventId = e.currentTarget.dataset.id;
            const activeUserId = getActiveUserId();

            if (!activeUserId || !eventId) {
                alert("Please log in to join drive.");
                window.location.href = "../logins/login.html";
                return;
            }

            e.currentTarget.disabled = true;
            e.currentTarget.innerText = "Registering...";

            try {
                const targetEvent = allEventsList.find(item => item.id === eventId);
                const eventTitle = targetEvent ? targetEvent.title : "Campaign Drive";

                const updates = {};
                updates[`events/${eventId}/participants/${activeUserId}`] = {
                    joinedAt: Date.now(),
                    attendance: "Registered"
                };
                await update(ref(db), updates);

                // Dispatch notification to user
                const notifRef = push(ref(db, `notifications/${activeUserId}`));
                await set(notifRef, {
                    title: "Registration Confirmed! 🌿",
                    message: `You successfully registered for campaign drive "${eventTitle}".`,
                    type: "event_join",
                    timestamp: Date.now(),
                    read: false
                });

                loadActivitiesPage();
            } catch (err) {
                console.error("Join event error:", err);
                alert("Failed to join drive: " + err.message);
                e.currentTarget.disabled = false;
            }
        });
    });

    document.querySelectorAll(".btn-cancel-event").forEach(btn => {
        btn.addEventListener("click", async (e) => {
            const eventId = e.currentTarget.dataset.id;
            const activeUserId = getActiveUserId();

            if (!activeUserId || !eventId) return;

            if (!confirm("Cancel your registration for this campaign drive?")) return;

            e.currentTarget.disabled = true;
            e.currentTarget.innerText = "Cancelling...";

            try {
                const updates = {};
                updates[`events/${eventId}/participants/${activeUserId}`] = null;
                await update(ref(db), updates);
                loadActivitiesPage();
            } catch (err) {
                console.error("Cancel event error:", err);
                alert("Failed to cancel registration: " + err.message);
                e.currentTarget.disabled = false;
            }
        });
    });
}

function renderEmptyEventsState() {
    const eventsGrid = document.getElementById("events-grid");
    if (!eventsGrid) return;
    eventsGrid.innerHTML = `
        <div class="col-12 text-center py-5">
            <div class="mb-3" style="font-size:48px;">🌿</div>
            <h5 class="fw-bold text-dark">No Active Campaigns Right Now</h5>
            <p class="text-muted small">Site administration will publish new environmental drives soon.</p>
        </div>
    `;
}

