/* =====================================================
   URVI – impact.js | 4 Leaderboards & Interactive Pinned Posts
   ===================================================== */
import { db, ref, get, child, set, update, remove, push } from "../config.js";

const currentUserId = localStorage.getItem("urvi_logged_user");
let allUsersList = [];
let pinnedPostsList = [];
let activeTab = "total";
let maxLimit = 10;
let leaderboardSettings = { total: true, points: true, plants: true, contributions: true };

document.addEventListener("DOMContentLoaded", () => {
    initImpactPage();
    setupTabSwitching();
    setupExpandButton();
});

async function initImpactPage() {
    await fetchSettings();
    await fetchUsers();
    await fetchPinnedPosts();
    renderLeaderboard();
    renderPinnedPosts();
}

async function fetchSettings() {
    try {
        const sSnap = await get(child(ref(db), "settings/leaderboard_visibility"));
        if (sSnap.exists()) {
            leaderboardSettings = { ...leaderboardSettings, ...sSnap.val() };
        }
    } catch (e) {
        console.warn("Leaderboard settings fetch error:", e);
    }
}

async function fetchUsers() {
    try {
        const uSnap = await get(child(ref(db), "users"));
        if (uSnap.exists()) {
            const data = uSnap.val();
            allUsersList = Object.keys(data)
                .map(k => ({ id: k, ...data[k] }))
                .filter(u => u.status !== "deleted");
        }
    } catch (e) {
        console.error("Users fetch error:", e);
    }
}

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

function setupTabSwitching() {
    document.querySelectorAll(".leaderboard-tab").forEach(tab => {
        tab.addEventListener("click", () => {
            document.querySelectorAll(".leaderboard-tab").forEach(t => t.classList.remove("active"));
            tab.classList.add("active");
            activeTab = tab.dataset.tab || "total";
            maxLimit = 10;
            renderLeaderboard();
        });
    });
}

function setupExpandButton() {
    const expandBtn = document.getElementById("btn-expand-leaderboard");
    if (expandBtn) {
        expandBtn.addEventListener("click", () => {
            maxLimit = maxLimit === 10 ? 50 : 10;
            expandBtn.innerText = maxLimit === 50 ? "Show Top 10 Only" : "Show Top 50 Champions";
            renderLeaderboard();
        });
    }
}

/** Calculate Total Eco Score formula */
function calculateTotalEcoScore(user) {
    const pts = user.points || 0;
    const trees = user.trees_planted || 0;
    const contrib = user.contributions || 0;
    return Math.round((pts * 1.0) + (trees * 50) + (contrib * 20));
}

function renderLeaderboard() {
    const container = document.getElementById("leaderboard-rows");
    if (!container) return;

    // Check if the active tab is disabled by site administration
    if (leaderboardSettings[activeTab] === false) {
        container.innerHTML = `
            <div class="text-center py-5 bg-white rounded-4 border">
                <div class="mb-2" style="font-size:36px;">🔒</div>
                <h6 class="fw-bold text-muted m-0">This leaderboard is currently paused by site administration.</h6>
            </div>
        `;
        return;
    }

    // Sort users deterministically
    const sorted = [...allUsersList].sort((a, b) => {
        let valA = 0;
        let valB = 0;

        if (activeTab === "total") {
            valA = calculateTotalEcoScore(a);
            valB = calculateTotalEcoScore(b);
        } else if (activeTab === "plants") {
            valA = a.trees_planted || a.trees || 0;
            valB = b.trees_planted || b.trees || 0;
        } else if (activeTab === "contributions") {
            valA = a.contributions || a.eventsJoined || 0;
            valB = b.contributions || b.eventsJoined || 0;
        } else {
            valA = a.points || 0;
            valB = b.points || 0;
        }

        if (valB !== valA) return valB - valA;
        return (a.user_id || a.id || "").localeCompare(b.user_id || b.id || "");
    });

    const displayList = sorted.slice(0, maxLimit);

    if (displayList.length === 0) {
        container.innerHTML = `
            <div class="text-center py-4 bg-white rounded-4 border">
                <p class="text-muted m-0" style="font-size:13px;">No active members found for this metric.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = displayList.map((user, idx) => {
        const rank = idx + 1;
        let rankBadge = `<span class="fw-bold text-muted" style="width:24px; text-align:center;">#${rank}</span>`;
        if (rank === 1) rankBadge = `<span style="font-size:22px;">🥇</span>`;
        else if (rank === 2) rankBadge = `<span style="font-size:22px;">🥈</span>`;
        else if (rank === 3) rankBadge = `<span style="font-size:22px;">🥉</span>`;

        const fullName = `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.user_id || "Volunteer";
        const handle = user.user_id || user.id;

        let metricVal = 0;
        let metricLabel = "";

        if (activeTab === "total") {
            metricVal = calculateTotalEcoScore(user).toLocaleString();
            metricLabel = "Total Eco Score";
        } else if (activeTab === "plants") {
            metricVal = (user.trees_planted || user.trees || 0).toLocaleString();
            metricLabel = "Trees Planted";
        } else if (activeTab === "contributions") {
            metricVal = (user.contributions || user.eventsJoined || 0).toLocaleString();
            metricLabel = "Contributions";
        } else {
            metricVal = (user.points || 0).toLocaleString();
            metricLabel = "Eco Points";
        }

        const isPic = user.profilePic && user.profilePic !== "default" && user.profilePic.length > 5;
        const avatarHTML = isPic 
            ? `<img src="${user.profilePic}" style="width:42px; height:42px; border-radius:50%; object-fit:cover;" alt="${fullName}">`
            : `<div style="width:42px; height:42px; border-radius:50%; background:#15803D; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700;">${(user.firstName || 'U').charAt(0).toUpperCase()}</div>`;

        return `
            <div class="p-3 bg-white rounded-4 border shadow-sm mb-2 d-flex align-items-center justify-content-between gap-3">
                <div class="d-flex align-items-center gap-3" style="min-width:0;">
                    ${rankBadge}
                    ${avatarHTML}
                    <div style="min-width:0;">
                        <h6 class="fw-bold text-dark m-0 text-truncate">
                            <a href="../profile/user-profile.html?uid=${encodeURIComponent(handle)}" class="text-dark text-decoration-none">
                                ${fullName}
                            </a>
                        </h6>
                        <small class="text-muted">
                            <a href="../profile/user-profile.html?uid=${encodeURIComponent(handle)}" class="text-muted text-decoration-none">
                                @${handle}
                            </a>
                        </small>
                    </div>
                </div>
                <div class="text-end">
                    <span class="fw-bold text-success" style="font-size:16px;">${metricVal}</span>
                    <small class="d-block text-muted" style="font-size:10px;">${metricLabel}</small>
                </div>
            </div>
        `;
    }).join("");
}

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

async function renderPinnedPosts() {
    const container = document.getElementById("pinned-posts-container");
    if (!container) return;

    if (pinnedPostsList.length === 0) {
        container.innerHTML = `
            <div class="text-center py-4 bg-white rounded-4 border col-12 shadow-sm">
                <p class="text-muted m-0" style="font-size:13px;">No pinned posts from administrators currently.</p>
            </div>
        `;
        return;
    }

    const activeUserId = getActiveUserId();

    const cardsHTML = await Promise.all(pinnedPostsList.map(async post => {
        const authorHandle = post.userId || post.user_id || "admin";
        let isLiked = false;
        if (activeUserId) {
            try {
                const lSnap = await get(child(ref(db), `community/likes/${post.id}/${activeUserId}`));
                isLiked = lSnap.exists();
            } catch (e) { /* ignore */ }
        }

        const dateStr = post.createdAt ? new Date(post.createdAt).toLocaleDateString() : "Recent";
        const hasMedia = post.imageUrl && post.imageUrl.length > 5;
        const isVid = post.isVideo || (post.imageUrl && (post.imageUrl.includes(".mp4") || post.imageUrl.includes(".webm")));

        const mediaMarkup = hasMedia ? (isVid ? `
            <div class="rounded-3 overflow-hidden mb-3 bg-black" style="cursor:pointer;" onclick="window.openPostModal('${post.id}')">
                <video src="${post.imageUrl}" class="w-100" style="max-height:220px; object-fit:cover;"></video>
            </div>
        ` : `
            <div class="rounded-3 overflow-hidden mb-3" style="cursor:pointer;" onclick="window.openPostModal('${post.id}')">
                <img src="${post.imageUrl}" class="w-100" style="max-height:220px; object-fit:cover;" alt="Post media">
            </div>
        `) : "";

        return `
            <div class="col-12 col-md-6">
                <div class="p-3 p-md-4 bg-white rounded-4 border border-warning-subtle shadow-sm position-relative h-100 d-flex flex-column justify-content-between">
                    <div>
                        <div class="d-flex align-items-center justify-content-between mb-3 me-5">
                            <span class="badge bg-warning text-dark position-absolute top-0 end-0 m-3 fw-bold shadow-sm" style="font-size:10px;">
                                <i class="bi bi-pin-angle-fill me-1"></i> Pinned Announcement
                            </span>
                            
                            <div class="d-flex align-items-center gap-2">
                                <div class="rounded-circle bg-success text-white d-flex align-items-center justify-content-center fw-bold text-uppercase flex-shrink-0" style="width:36px; height:36px; font-size:14px;">
                                    ${(post.userName || "A").charAt(0)}
                                </div>
                                <div style="min-width:0;">
                                    <strong class="d-block text-dark text-truncate" style="font-size:14px;">
                                        <a href="../profile/user-profile.html?uid=${encodeURIComponent(authorHandle)}" class="text-dark text-decoration-none">
                                            ${post.userName || "Admin"}
                                        </a>
                                    </strong>
                                    <small class="text-muted" style="font-size:11px;">${dateStr}</small>
                                </div>
                            </div>
                        </div>

                        <p class="text-dark small mb-3" style="line-height:1.5; cursor:pointer;" onclick="window.openPostModal('${post.id}')">
                            ${post.description || ""}
                        </p>
                        
                        ${mediaMarkup}
                    </div>

                    <div class="pt-3 border-top mt-auto">
                        <div class="d-flex align-items-center justify-content-between gap-2 flex-wrap">
                            <div class="d-flex align-items-center gap-2">
                                <button type="button" class="btn btn-sm ${isLiked ? 'btn-danger liked' : 'btn-outline-danger'} rounded-pill px-3 py-1 fw-bold" id="card-like-btn-${post.id}" onclick="window.likeImpactPost('${post.id}', this)" style="font-size:12px;">
                                    <i class="bi ${isLiked ? 'bi-heart-fill' : 'bi-heart'} me-1"></i>
                                    <span class="like-count">${post.likesCount || 0}</span>
                                </button>
                                
                                <button type="button" class="btn btn-sm btn-outline-primary rounded-pill px-3 py-1 fw-bold" onclick="window.openPostModal('${post.id}')" style="font-size:12px;">
                                    <i class="bi bi-chat-dots-fill me-1"></i> <span id="card-comment-count-${post.id}">${post.commentsCount || 0}</span>
                                </button>

                                <button type="button" class="btn btn-sm btn-outline-secondary rounded-pill px-2 py-1 fw-bold" onclick="window.sharePost('${post.id}')" style="font-size:12px;" title="Share Post">
                                    <i class="bi bi-share-fill"></i>
                                </button>
                            </div>

                            <a href="../community/community.html#postcard-${post.id}" class="btn btn-sm btn-outline-success rounded-pill px-3 py-1 fw-bold text-nowrap" style="font-size:11px;">
                                View in Feed →
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }));

    container.innerHTML = cardsHTML.join("");
}

// ── Global Interactive Handlers for Pinned Posts Modal & Actions ──
window.openPostModal = async function(postId) {
    const modalEl = document.getElementById("postDetailModal");
    if (!modalEl) return;

    let modal = window.bootstrap ? (bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl)) : null;
    const body = document.getElementById("postDetailBody");
    if (body) {
        body.innerHTML = `
            <div class="text-center p-4">
                <div class="spinner-border spinner-border-sm text-success" role="status"></div>
                <small class="d-block text-muted mt-2">Loading post...</small>
            </div>
        `;
    }
    if (modal) modal.show();

    try {
        const snap = await get(child(ref(db), `community/posts/${postId}`));
        if (!snap.exists()) {
            if (body) body.innerHTML = '<p class="text-center text-muted p-4">Post not found.</p>';
            return;
        }

        const post = snap.val();
        const activeUserId = getActiveUserId();
        const dateStr = post.createdAt ? new Date(post.createdAt).toLocaleString() : "Recent";
        const isVid = post.isVideo || (post.imageUrl && (post.imageUrl.includes(".mp4") || post.imageUrl.includes(".webm")));

        let isLiked = false;
        if (activeUserId) {
            try {
                const lSnap = await get(child(ref(db), `community/likes/${postId}/${activeUserId}`));
                isLiked = lSnap.exists();
            } catch (e) { /* ignore */ }
        }

        const mediaHTML = post.imageUrl ? (isVid ? `
            <video src="${post.imageUrl}" controls class="w-100 rounded-3 mb-3 bg-black" style="max-height:400px; object-fit:contain;"></video>
        ` : `
            <img src="${post.imageUrl}" class="w-100 rounded-3 mb-3" style="max-height:400px; object-fit:cover;" alt="Post image">
        `) : "";

        if (body) {
            body.innerHTML = `
                <div class="d-flex align-items-center gap-2 mb-3">
                    <div class="rounded-circle bg-success text-white d-flex align-items-center justify-content-center fw-bold text-uppercase flex-shrink-0" style="width:40px; height:40px; font-size:16px;">
                        ${(post.userName || "A").charAt(0)}
                    </div>
                    <div>
                        <strong class="d-block text-dark" style="font-size:15px;">${post.userName || "Admin"}</strong>
                        <small class="text-muted" style="font-size:12px;"><i class="bi bi-clock me-1"></i>${dateStr}</small>
                    </div>
                </div>

                <p class="text-dark mb-3" style="font-size:14px; line-height:1.6;">${post.description || ""}</p>

                ${mediaHTML}

                <div class="d-flex align-items-center justify-content-between border-top border-bottom py-2 my-3">
                    <button type="button" class="btn btn-sm ${isLiked ? 'btn-danger liked' : 'btn-outline-danger'} rounded-pill px-3 py-1 fw-bold" id="modal-like-btn-${postId}" onclick="window.likeImpactPost('${postId}', this)">
                        <i class="bi ${isLiked ? 'bi-heart-fill' : 'bi-heart'} me-1"></i>
                        <span class="like-count">${post.likesCount || 0}</span> Likes
                    </button>

                    <button type="button" class="btn btn-sm btn-outline-secondary rounded-pill px-3 py-1 fw-bold" onclick="window.sharePost('${postId}')">
                        <i class="bi bi-share-fill me-1"></i> Share
                    </button>
                </div>

                <div class="modal-comments-box mt-3">
                    <h6 class="fw-bold text-dark mb-2"><i class="bi bi-chat-dots-fill text-success me-1"></i> Comments (<span id="modal-comment-count-${postId}">${post.commentsCount || 0}</span>)</h6>
                    <div class="comments-list mt-2 p-2 rounded-3 border bg-light" id="modal-comments-list-${postId}" style="max-height:220px; overflow-y:auto;">
                        <div class="text-center p-3"><div class="spinner-border spinner-border-sm text-success"></div></div>
                    </div>

                    <form class="d-flex gap-2 mt-3" onsubmit="window.addImpactComment('${postId}', event)">
                        <input type="text" class="form-control form-control-sm rounded-pill px-3" placeholder="${activeUserId ? 'Write a comment...' : 'Log in to write a comment...'}" id="modal-comment-input-${postId}" autocomplete="off" required>
                        <button type="submit" class="btn btn-sm btn-success rounded-pill px-3"><i class="bi bi-send-fill"></i></button>
                    </form>
                </div>
            `;
        }

        loadImpactComments(postId);
    } catch (e) {
        console.error("Open post modal error:", e);
        if (body) body.innerHTML = '<p class="text-center text-muted p-4">Failed to load post details.</p>';
    }
};

window.likeImpactPost = async function(postId, btn) {
    const activeUserId = getActiveUserId();
    const isSubfolder = window.location.pathname.includes("/impact/") || window.location.pathname.includes("/profile/") || window.location.pathname.includes("/community/") || window.location.pathname.includes("/activities/") || window.location.pathname.includes("/notifications/");
    const loginUrl = isSubfolder ? "../logins/login.html" : "logins/login.html";

    if (!activeUserId) {
        alert("Please log in to like posts.");
        window.location.href = loginUrl;
        return;
    }

    const cardLikeBtn = document.getElementById(`card-like-btn-${postId}`);
    const modalLikeBtn = document.getElementById(`modal-like-btn-${postId}`);
    const refBtn = btn || cardLikeBtn || modalLikeBtn;

    const isCurrentlyLiked = refBtn ? (refBtn.classList.contains("btn-danger") || refBtn.classList.contains("liked")) : false;
    const willBeLiked = !isCurrentlyLiked;

    const countSpan = refBtn ? refBtn.querySelector(".like-count") : null;
    let currentCount = parseInt(countSpan ? countSpan.textContent : "0") || 0;
    const newCount = willBeLiked ? currentCount + 1 : Math.max(0, currentCount - 1);

    // Apply UI update IMMEDIATELY to both card button and modal button
    [cardLikeBtn, modalLikeBtn].forEach(b => {
        if (b) {
            b.className = willBeLiked 
                ? "btn btn-sm btn-danger rounded-pill px-3 py-1 fw-bold liked" 
                : "btn btn-sm btn-outline-danger rounded-pill px-3 py-1 fw-bold";
            const icon = b.querySelector("i");
            if (icon) icon.className = willBeLiked ? "bi bi-heart-fill me-1" : "bi bi-heart me-1";
            const cntSpan = b.querySelector(".like-count");
            if (cntSpan) cntSpan.textContent = newCount;
        }
    });

    try {
        const likeRef = ref(db, `community/likes/${postId}/${activeUserId}`);
        const postRef = ref(db, `community/posts/${postId}`);
        if (willBeLiked) {
            await set(likeRef, true);
        } else {
            await remove(likeRef);
        }
        await update(postRef, { likesCount: newCount });
    } catch (e) {
        console.error("Like post error:", e);
    }
};

async function loadImpactComments(postId) {
    const container = document.getElementById(`modal-comments-list-${postId}`);
    if (!container) return;

    try {
        const cSnap = await get(child(ref(db), `community/comments/${postId}`));
        if (!cSnap.exists()) {
            container.innerHTML = '<p class="text-center text-muted small p-2 m-0">No comments yet. Be the first to comment!</p>';
            return;
        }

        const comments = [];
        cSnap.forEach(c => comments.push({ id: c.key, ...c.val() }));
        comments.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

        const activeUserId = getActiveUserId();
        const postSnap = await get(child(ref(db), `community/posts/${postId}`));
        const postOwnerId = postSnap.exists() ? postSnap.val().userId : null;

        container.innerHTML = comments.map(c => {
            const canDelete = activeUserId && (activeUserId === c.userId || activeUserId === postOwnerId);
            return `
            <div class="p-2 mb-2 bg-white rounded-3 border position-relative" id="impact-comment-${c.id}">
                <div class="d-flex align-items-center justify-content-between mb-1 ${canDelete ? 'pe-4' : ''}">
                    <strong class="text-dark small">${c.userName || "User"}</strong>
                    <small class="text-muted" style="font-size:10px;">${c.createdAt ? new Date(c.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ""}</small>
                </div>
                <p class="text-secondary small m-0" style="font-size:12px; line-height:1.4;">${c.text || ""}</p>
                ${canDelete ? `
                <button type="button" class="btn btn-sm text-danger p-0 position-absolute" style="top:6px; right:8px; line-height:1; font-size:13px; background:none; border:none; cursor:pointer;" onclick="window.deleteImpactComment('${postId}', '${c.id}')" title="Delete comment">
                    <i class="bi bi-trash3"></i>
                </button>` : ""}
            </div>
            `;
        }).join("");
    } catch (e) {
        container.innerHTML = '<p class="text-center text-muted small p-2 m-0">Failed to load comments.</p>';
    }
}

window.deleteImpactComment = async function(postId, commentId) {
    if (!confirm("Are you sure you want to delete this comment?")) return;

    try {
        document.getElementById(`impact-comment-${commentId}`)?.remove();
        await remove(ref(db, `community/comments/${postId}/${commentId}`));

        const pSnap = await get(child(ref(db), `community/posts/${postId}`));
        if (pSnap.exists()) {
            const newCount = Math.max(0, (pSnap.val().commentsCount || 0) - 1);
            await update(ref(db, `community/posts/${postId}`), { commentsCount: newCount });

            const modalCount = document.getElementById(`modal-comment-count-${postId}`);
            if (modalCount) modalCount.textContent = newCount;
            const cardCount = document.getElementById(`card-comment-count-${postId}`);
            if (cardCount) cardCount.textContent = newCount;
        }
    } catch (e) {
        console.error("Delete impact comment error:", e);
        alert("Failed to delete comment: " + e.message);
    }
};

window.addImpactComment = async function(postId, event) {
    if (event) event.preventDefault();
    const activeUserId = getActiveUserId();
    const isSubfolder = window.location.pathname.includes("/impact/") || window.location.pathname.includes("/profile/") || window.location.pathname.includes("/community/") || window.location.pathname.includes("/activities/") || window.location.pathname.includes("/notifications/");
    const loginUrl = isSubfolder ? "../logins/login.html" : "logins/login.html";

    if (!activeUserId) {
        alert("Please log in to submit comments.");
        window.location.href = loginUrl;
        return;
    }

    const input = document.getElementById(`modal-comment-input-${postId}`);
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;

    try {
        const uSnap = await get(child(ref(db), `users/${activeUserId}`));
        const user = uSnap.exists() ? uSnap.val() : {};
        const myName = `${user.firstName || ""} ${user.lastName || ""}`.trim() || "User";

        const newCommentRef = push(ref(db, `community/comments/${postId}`));
        const commentData = {
            userId: activeUserId,
            userName: myName,
            text: text,
            createdAt: Date.now()
        };

        input.value = "";
        const list = document.getElementById(`modal-comments-list-${postId}`);
        if (list) {
            const emptyMsg = list.querySelector("p");
            if (emptyMsg) emptyMsg.remove();

            list.insertAdjacentHTML("beforeend", `
                <div class="p-2 mb-2 bg-white rounded-3 border position-relative" id="impact-comment-${newCommentRef.key}">
                    <div class="d-flex align-items-center justify-content-between mb-1 pe-4">
                        <strong class="text-dark small">${myName}</strong>
                        <small class="text-muted" style="font-size:10px;">Just now</small>
                    </div>
                    <p class="text-secondary small m-0" style="font-size:12px; line-height:1.4;">${text}</p>
                    <button type="button" class="btn btn-sm text-danger p-0 position-absolute" style="top:6px; right:8px; line-height:1; font-size:13px; background:none; border:none; cursor:pointer;" onclick="window.deleteImpactComment('${postId}', '${newCommentRef.key}')" title="Delete comment">
                        <i class="bi bi-trash3"></i>
                    </button>
                </div>
            `);
            list.scrollTop = list.scrollHeight;
        }

        await set(newCommentRef, commentData);

        const pSnap = await get(child(ref(db), `community/posts/${postId}`));
        if (pSnap.exists()) {
            const newCount = (pSnap.val().commentsCount || 0) + 1;
            await update(ref(db, `community/posts/${postId}`), { commentsCount: newCount });

            const modalCount = document.getElementById(`modal-comment-count-${postId}`);
            if (modalCount) modalCount.textContent = newCount;
            const cardCount = document.getElementById(`card-comment-count-${postId}`);
            if (cardCount) cardCount.textContent = newCount;
        }
    } catch (e) {
        console.error("Add comment error:", e);
    }
};

window.sharePost = async function(postId) {
    const shareUrl = window.location.origin + `/community/community.html#postcard-${postId}`;
    if (navigator.share) {
        try {
            await navigator.share({
                title: "URVI Community Post",
                text: "Check out this pinned announcement on URVI 🌿",
                url: shareUrl
            });
            return;
        } catch (e) { /* fallback to copy */ }
    }
    try {
        await navigator.clipboard.writeText(shareUrl);
        alert("Post link copied to clipboard! 📋");
    } catch (e) {
        alert("Share link: " + shareUrl);
    }
};
