import { db, ref, get, child, update, onValue } from "../config.js";

/* =====================================================
   URVI – notifications.js | Notifications Center Logic
   ===================================================== */

const currentUserId = localStorage.getItem("urvi_logged_user");
let allNotifications = [];
let activeFilter = "all";

document.addEventListener("DOMContentLoaded", () => {
    if (!currentUserId) {
        alert("Please log in to view your notifications.");
        window.location.href = "../logins/login.html";
        return;
    }

    initNotificationsPage();
    setupTabFilters();
    setupMarkAllRead();
});

function initNotificationsPage() {
    const listContainer = document.getElementById("notif-full-list");
    if (!listContainer) return;

    let targetIds = [currentUserId];
    const cachedUserData = localStorage.getItem("urvi_user_data");
    if (cachedUserData) {
        try {
            const u = JSON.parse(cachedUserData);
            if (u.user_id && !targetIds.includes(u.user_id)) targetIds.push(u.user_id);
            if (u.auth_uid && !targetIds.includes(u.auth_uid)) targetIds.push(u.auth_uid);
        } catch (e) { /* ignore */ }
    }

    // Function to process snapshot data
    const handleNotifData = (snapshots) => {
        const notifsMap = new Map();
        snapshots.forEach(snap => {
            if (snap && snap.exists()) {
                snap.forEach(c => {
                    notifsMap.set(c.key, { id: c.key, ...c.val() });
                });
            }
        });

        if (notifsMap.size === 0) {
            renderEmptyState();
            return;
        }

        const notifs = Array.from(notifsMap.values());
        notifs.sort((a, b) => {
            const timeA = a.createdAt || a.timestamp || 0;
            const timeB = b.createdAt || b.timestamp || 0;
            return timeB - timeA;
        });
        allNotifications = notifs;
        renderNotificationsList();
    };

    // Attach listeners across all potential user ID nodes
    let collectedSnaps = [];
    targetIds.forEach((id, index) => {
        onValue(ref(db, `notifications/${id}`), (snap) => {
            collectedSnaps[index] = snap;
            handleNotifData(collectedSnaps);
        });
    });
}

function setupTabFilters() {
    document.querySelectorAll(".notif-tab").forEach((tab) => {
        tab.addEventListener("click", () => {
            document.querySelectorAll(".notif-tab").forEach((t) => t.classList.remove("active"));
            tab.classList.add("active");
            activeFilter = tab.dataset.filter || "all";
            renderNotificationsList();
        });
    });
}

function renderNotificationsList() {
    const listContainer = document.getElementById("notif-full-list");
    if (!listContainer) return;

    let filtered = allNotifications;

    if (activeFilter !== "all") {
        filtered = allNotifications.filter((n) => {
            if (activeFilter === "event_join" || activeFilter === "event") {
                return n.type === "event_join" || n.type === "event";
            }
            return n.type === activeFilter;
        });
    }

    if (filtered.length === 0) {
        renderEmptyState();
        return;
    }

    listContainer.innerHTML = filtered.map((n) => {
        const pic = n.fromUserPhoto && n.fromUserPhoto !== "default" && n.fromUserPhoto.length > 5;
        const initial = (n.fromUserName || n.title || "U").charAt(0).toUpperCase();
        const avatarHTML = pic
            ? `<img src="${n.fromUserPhoto}" class="notif-card-avatar" alt="">`
            : `<div class="notif-card-initial">${initial}</div>`;

        const icon = n.type === "like" ? "❤️" : (n.type === "event_join" || n.type === "event") ? "🌱" : n.type === "new_post" ? "📝" : n.type === "follow" ? "👤" : "🔔";
        const timeVal = n.createdAt || n.timestamp;

        return `
            <div class="notif-card-item ${n.read ? "" : "unread"}" onclick="window.handleNotificationCardClick('${n.id}', '${n.type}', '${n.postId || ""}', '${n.fromUserId || ""}')">
                ${avatarHTML}
                <div class="notif-card-body">
                    <h6 class="fw-bold text-dark m-0 mb-1" style="font-size:14px;">${n.title || 'Notification'}</h6>
                    <p class="notif-card-message m-0">${n.message || "New notification"}</p>
                    <div class="notif-card-time mt-1">${timeAgo(timeVal)}</div>
                </div>
                <span class="notif-card-badge">${icon}</span>
                ${n.read ? "" : '<span class="unread-dot-indicator"></span>'}
            </div>
        `;
    }).join("");
}

function renderEmptyState() {
    const listContainer = document.getElementById("notif-full-list");
    if (!listContainer) return;

    listContainer.innerHTML = `
        <div class="notif-empty-state text-center py-5">
            <div class="notif-empty-icon" style="font-size:42px;">🌱</div>
            <h5 class="notif-empty-title fw-bold text-dark mt-2">All caught up!</h5>
            <p class="notif-empty-desc text-muted small">No ${activeFilter !== 'all' ? activeFilter : ''} notifications found right now.</p>
        </div>
    `;
}

function setupMarkAllRead() {
    const btn = document.getElementById("btn-mark-all-read");
    if (!btn) return;

    btn.addEventListener("click", async () => {
        try {
            const snap = await get(ref(db, `notifications/${currentUserId}`));
            if (!snap.exists()) return;
            const updates = {};
            snap.forEach((c) => {
                if (!c.val().read) {
                    updates[`notifications/${currentUserId}/${c.key}/read`] = true;
                }
            });
            if (Object.keys(updates).length > 0) {
                await update(ref(db), updates);
            }
        } catch (e) {
            console.error("Mark all read error:", e);
        }
    });
}

window.handleNotificationCardClick = async function (notifId, type, postId, fromUserId) {
    if (!currentUserId) return;

    try {
        await update(ref(db, `notifications/${currentUserId}/${notifId}`), { read: true });
    } catch (e) { /* ignore */ }

    if (type === "follow" && fromUserId) {
        window.location.href = `../profile/user-profile.html?uid=${fromUserId}`;
    } else if (type === "event_join" || type === "event") {
        window.location.href = `../activities/activities.html`;
    } else if (postId) {
        window.location.href = `../community/community.html#postcard-${postId}`;
    }
};

function timeAgo(timestamp) {
    if (!timestamp) return "Just now";
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return "Just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} minutes ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hours ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days} days ago`;
    return new Date(timestamp).toLocaleDateString();
}
