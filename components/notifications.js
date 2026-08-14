/* =====================================================
   URVI – components/notifications.js | Global Notification System
   ===================================================== */
import { db, ref, get, child, update, onValue } from "../config.js";

function getUserId() {
    const raw = localStorage.getItem("urvi_logged_user");
    return raw && raw !== "undefined" && raw !== "null" ? raw.trim() : null;
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
        initNotifications();
    });
} else {
    initNotifications();
}

export function initNotifications() {
    const activeUserId = getUserId();
    const bellBtn = document.getElementById("notification-btn");
    const dropdown = document.getElementById("notification-dropdown");
    const notifDot = document.getElementById("notif-dot");
    const notifList = document.getElementById("notif-list");
    const markReadBtn = document.getElementById("notif-mark-read");

    if (!bellBtn) return;

    // Determine path to notifications page
    const currentPath = window.location.pathname;
    const isRoot = !currentPath.includes("/community/") && !currentPath.includes("/profile/") && !currentPath.includes("/activities/") && !currentPath.includes("/impact/") && !currentPath.includes("/notifications/");
    const notifPageUrl = isRoot ? "notifications/notifications.html" : "../notifications/notifications.html";

    // Bell Button Click: Mobile opens page directly, Desktop toggles dropdown
    bellBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (window.innerWidth <= 991) {
            window.location.href = notifPageUrl;
            return;
        }
        if (dropdown) {
            dropdown.classList.toggle("active");
        } else {
            window.location.href = notifPageUrl;
        }
    });

    // Close dropdown on outside click
    if (dropdown) {
        document.addEventListener("click", (e) => {
            if (!dropdown.contains(e.target) && !bellBtn.contains(e.target)) {
                dropdown.classList.remove("active");
            }
        });
    }

    if (!activeUserId) {
        if (notifList) notifList.innerHTML = '<div class="notif-empty">Log in to view notifications 🌿</div>';
        return;
    }

    // Real-Time Firebase Listener
    const notifRef = ref(db, `notifications/${activeUserId}`);
    let isInitialLoad = true;

    onValue(notifRef, (snapshot) => {
        if (!snapshot.exists()) {
            if (notifList) notifList.innerHTML = '<div class="notif-empty">No notifications yet 🌿</div>';
            if (notifDot) notifDot.style.display = "none";
            return;
        }

        const notifs = [];
        snapshot.forEach((childSnap) => {
            notifs.push({ id: childSnap.key, ...childSnap.val() });
        });

        // Sort newest first using either createdAt or timestamp
        notifs.sort((a, b) => {
            const timeA = a.createdAt || a.timestamp || 0;
            const timeB = b.createdAt || b.timestamp || 0;
            return timeB - timeA;
        });

        // Count unread
        const unreadList = notifs.filter((n) => !n.read);
        if (notifDot) {
            notifDot.style.display = unreadList.length > 0 ? "block" : "none";
        }

        // Real-time Toast Banner for fresh incoming notifications
        if (!isInitialLoad && unreadList.length > 0) {
            const newest = unreadList[0];
            const newestTime = newest.createdAt || newest.timestamp || Date.now();
            if (Date.now() - newestTime < 10000) {
                showNotificationToast(newest);
            }
        }
        isInitialLoad = false;

        // Render List in Dropdown
        if (!notifList) return;
        const display = notifs.slice(0, 15);

        const itemsHTML = display.map((n) => {
            const pic = n.fromUserPhoto && n.fromUserPhoto !== "default" && n.fromUserPhoto.length > 5;
            const initial = (n.fromUserName || n.title || "U").charAt(0).toUpperCase();
            const avatarHTML = pic
                ? `<img src="${n.fromUserPhoto}" class="notif-avatar" alt="">`
                : `<div class="notif-avatar-initial">${initial}</div>`;

            const icon = n.type === "like" ? "❤️" : (n.type === "event_join" || n.type === "event") ? "🌱" : n.type === "new_post" ? "📝" : n.type === "follow" ? "👤" : "🔔";
            const timeVal = n.createdAt || n.timestamp;

            return `
                <div class="notif-item ${n.read ? "" : "unread"}" onclick="window.handleNotificationClick('${n.id}', '${n.type}', '${n.postId || ""}', '${n.fromUserId || ""}')">
                    ${avatarHTML}
                    <div class="notif-content">
                        <p class="notif-message">${n.message || n.title || "New notification"}</p>
                        <div class="notif-time">${timeAgoShort(timeVal)}</div>
                    </div>
                    <span class="notif-icon">${icon}</span>
                </div>
            `;
        }).join("");

        // Append View All link at the bottom of dropdown
        const viewAllHTML = `
            <div class="text-center p-2 border-top" style="background:#F8FAFC;">
                <a href="${notifPageUrl}" style="color:#22C55E;font-size:12px;font-weight:700;text-decoration:none;">
                    View All Notifications <i class="bi bi-arrow-right"></i>
                </a>
            </div>
        `;

        notifList.innerHTML = itemsHTML + viewAllHTML;
    });

    // Mark All Read
    if (markReadBtn) {
        markReadBtn.addEventListener("click", async () => {
            try {
                const snap = await get(ref(db, `notifications/${activeUserId}`));
                if (!snap.exists()) return;
                const updates = {};
                snap.forEach((c) => {
                    if (!c.val().read) {
                        updates[`notifications/${activeUserId}/${c.key}/read`] = true;
                    }
                });
                if (Object.keys(updates).length > 0) {
                    await update(ref(db), updates);
                }
            } catch (e) {
                console.error("Mark read error:", e);
            }
        });
    }
}

/* =====================================================
   HANDLE NOTIFICATION CLICK & NAVIGATION
   ===================================================== */
window.handleNotificationClick = async function (notifId, type, postId, fromUserId) {
    const activeUserId = getUserId();
    if (!activeUserId) return;

    try {
        await update(ref(db, `notifications/${activeUserId}/${notifId}`), { read: true });
    } catch (e) { /* ignore */ }

    const currentPath = window.location.pathname;
    const isRoot = !currentPath.includes("/community/") && !currentPath.includes("/profile/") && !currentPath.includes("/activities/") && !currentPath.includes("/impact/") && !currentPath.includes("/notifications/");

    if (type === "follow" && fromUserId) {
        window.location.href = isRoot ? `profile/user-profile.html?uid=${fromUserId}` : `../profile/user-profile.html?uid=${fromUserId}`;
    } else if (type === "event_join" || type === "event") {
        window.location.href = isRoot ? `activities/activities.html` : `../activities/activities.html`;
    } else if (postId) {
        window.location.href = isRoot ? `community/community.html#postcard-${postId}` : `../community/community.html#postcard-${postId}`;
    }
};

function showNotificationToast(notif) {
    let toast = document.getElementById("notif-live-toast");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "notif-live-toast";
        toast.className = "notif-live-toast";
        document.body.appendChild(toast);
    }

    toast.innerHTML = `
        <div class="d-flex align-items-center gap-2">
            <span class="fs-5">${notif.type === 'like' ? '❤️' : '🔔'}</span>
            <div>
                <strong style="font-size:13px;display:block;">${notif.title || notif.fromUserName || 'Notification'}</strong>
                <small style="font-size:12px;opacity:0.9;">${notif.message || ''}</small>
            </div>
        </div>
    `;

    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 4000);
}

function timeAgoShort(timestamp) {
    if (!timestamp) return "Just now";
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return "Just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(timestamp).toLocaleDateString();
}
