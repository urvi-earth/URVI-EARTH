import { db, ref, get, child, set, update, remove, push } from "../config.js";
import { isVideoUrl } from "../cloudinary.js";
import { getLevelFromXP, extractTreeXP } from "./my-virtual-tree.js";

/* =====================================================
   URVI – user-profile.js | Dedicated Public User Profile
   ===================================================== */

const currentUserId = localStorage.getItem("urvi_logged_user");

// Parse user ID from URL parameters: ?uid=xxx or ?id=xxx
const urlParams = new URLSearchParams(window.location.search);
const targetUserId = urlParams.get("uid") || urlParams.get("id");

let isFollowingTarget = false;

document.addEventListener("DOMContentLoaded", () => {
    if (!targetUserId) {
        alert("No user specified.");
        window.location.href = "../community/community.html";
        return;
    }

    if (currentUserId && currentUserId === targetUserId) {
        window.location.href = "profile.html";
        return;
    }

    loadUserProfile();
    loadSidebarProfile();
});

/* =====================================================
   LOAD USER PROFILE
   ===================================================== */
function isAdminUser(user, uid = "", name = "") {
    const cleanUid = String(uid || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const cleanName = String(name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const userHandle = String(user ? (user.user_id || user.userId || "") : "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const userName = String(user ? (user.firstName || user.name || user.userName || "") : "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const role = String(user ? (user.role || user.userType || user.user_type || "") : "").toLowerCase();

    return cleanUid.includes("urviearth") ||
           userHandle.includes("urviearth") ||
           cleanName.includes("urviearth") ||
           userName.includes("urviearth") ||
           role === "admin";
}

async function loadUserProfile() {
    try {
        const userSnap = await get(child(ref(db), `users/${targetUserId}`));
        if (!userSnap.exists()) {
            alert("User profile not found.");
            window.location.href = "../community/community.html";
            return;
        }

        const user = userSnap.val();
        const fullName = `${user.firstName || ""} ${user.lastName || ""}`.trim() || targetUserId;
        const userHandle = user.user_id || targetUserId;

        const isGoldAdmin = isAdminUser(user, targetUserId, fullName);
        const isBlueVerified = (user.role === "verified") || (user.isVerified === true);

        const badgeHTML = isGoldAdmin
            ? `<span class="verified-badge gold" title="URVI Official Admin"><i class="bi bi-patch-check-fill"></i></span>`
            : (isBlueVerified ? `<span class="verified-badge blue" title="Verified Eco Leader"><i class="bi bi-patch-check-fill"></i></span>` : "");

        const typeBadgeHTML = isGoldAdmin
            ? `<span class="admin-gold-badge-tag"><i class="bi bi-shield-lock-fill"></i> 👑 URVI Official Admin</span>`
            : (isBlueVerified ? `<span class="user-blue-badge-tag"><i class="bi bi-patch-check-fill"></i> ⚡ Verified Eco Leader</span>` : `🌿 ${user.userType || "Eco Member"}`);
        
        document.title = `${fullName} (@${userHandle}) | URVI Profile`;
        document.getElementById("user-display-name").innerHTML = `${fullName} ${badgeHTML}`;
        document.getElementById("user-handle").textContent = `@${userHandle}`;
        document.getElementById("user-badge").innerHTML = typeBadgeHTML;
        document.getElementById("user-bio-text").textContent = user.bio || "No bio added yet.";

        const pic = user.profilePic && user.profilePic !== "default" && user.profilePic.length > 5
            ? user.profilePic
            : `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName)}&background=22C55E&color=fff&size=200`;

        const picElem = document.getElementById("user-profile-pic");
        if (picElem) {
            picElem.src = pic;
            if (isGoldAdmin) {
                picElem.classList.add("avatar-ring-gold");
            } else if (isBlueVerified) {
                picElem.classList.add("avatar-ring-blue");
            }
        }

        // Apply Gold Card styling to public profile card
        const cardElem = document.querySelector(".profile-header-card, .profile-card");
        if (cardElem && isGoldAdmin) {
            cardElem.classList.add("admin-gold-card");
        }

        document.getElementById("user-score-points").textContent = user.points || 0;
        document.getElementById("user-score-trees").textContent = user.trees_planted || 0;
        document.getElementById("user-score-contributions").textContent = user.contributions || 0;

        const treeXP = extractTreeXP(user);
        const treeLvl = getLevelFromXP(treeXP);
        const badgeContainer = document.getElementById("user-tree-badge-container");
        if (badgeContainer) {
            badgeContainer.innerHTML = `
                <a href="my-virtual-tree.html?uid=${encodeURIComponent(targetUserId)}" class="tree-level-badge" title="View ${fullName}'s Virtual Tree (${treeXP.toLocaleString()} XP)">
                    <span class="tree-level-icon">${treeLvl.icon || '🌳'}</span>
                    <span class="tree-level-tag">Lvl ${treeLvl.level}</span>
                    <span class="tree-level-name">${treeLvl.name}</span>
                    <span class="tree-level-xp ms-1 badge bg-success bg-opacity-10 text-success border border-success border-opacity-25 rounded-pill px-2 py-1" style="font-size:11px;">${treeXP.toLocaleString()} XP</span>
                    <i class="bi bi-chevron-right tree-level-arrow"></i>
                </a>
            `;
        }

        await checkFollowState();
        await loadFollowCounts();
        await loadUserPosts();

        document.getElementById("btnShareProfile")?.addEventListener("click", shareProfile);

    } catch (err) {
        console.error("User profile load error:", err);
    }
}

/* =====================================================
   FOLLOW / UNFOLLOW LOGIC
   ===================================================== */
async function checkFollowState() {
    const followBtn = document.getElementById("userFollowBtn");
    if (!followBtn) return;

    if (!currentUserId) {
        followBtn.innerHTML = '<i class="bi bi-person-plus-fill"></i> Log In to Follow';
        followBtn.onclick = () => window.location.href = "../logins/login.html";
        return;
    }

    try {
        const snap = await get(ref(db, `community/following/${currentUserId}/${targetUserId}`));
        isFollowingTarget = snap.exists();

        updateFollowBtnUI(followBtn);

        followBtn.onclick = async () => {
            followBtn.disabled = true;
            await toggleFollowTarget();
            followBtn.disabled = false;
        };
    } catch (e) {
        console.error("Follow check error:", e);
    }
}

function updateFollowBtnUI(btn) {
    if (isFollowingTarget) {
        btn.classList.add("following");
        btn.innerHTML = '<i class="bi bi-person-check-fill"></i> <span class="follow-label">Following</span>';
    } else {
        btn.classList.remove("following");
        btn.innerHTML = '<i class="bi bi-person-plus-fill"></i> <span class="follow-label">Follow</span>';
    }
}

async function toggleFollowTarget() {
    if (!currentUserId) return;

    const followingRef = ref(db, `community/following/${currentUserId}/${targetUserId}`);
    const followersRef = ref(db, `community/followers/${targetUserId}/${currentUserId}`);
    const followBtn = document.getElementById("userFollowBtn");

    try {
        if (isFollowingTarget) {
            await remove(followingRef);
            await remove(followersRef);
            isFollowingTarget = false;
        } else {
            await set(followingRef, true);
            await set(followersRef, true);
            isFollowingTarget = true;

            try {
                const meSnap = await get(child(ref(db), `users/${currentUserId}`));
                if (meSnap.exists()) {
                    const me = meSnap.val();
                    const myName = `${me.firstName || ""} ${me.lastName || ""}`.trim();
                    const notifRef = push(ref(db, `notifications/${targetUserId}`));
                    await set(notifRef, {
                        type: "follow",
                        fromUserId: currentUserId,
                        fromUserName: myName,
                        fromUserPhoto: me.profilePic || "default",
                        message: `${myName} started following you`,
                        read: false,
                        createdAt: Date.now()
                    });
                }
            } catch (ne) { /* ignore */ }
        }

        updateFollowBtnUI(followBtn);
        await loadFollowCounts();

    } catch (e) {
        console.error("Toggle follow error:", e);
        alert("Failed to update follow status.");
    }
}

/* =====================================================
   FOLLOW / FOLLOWING METRICS & MODALS
   ===================================================== */
async function loadFollowCounts() {
    try {
        const fwersSnap = await get(child(ref(db), `community/followers/${targetUserId}`));
        const followerCount = fwersSnap.exists() ? Object.keys(fwersSnap.val()).length : 0;

        const fwingSnap = await get(child(ref(db), `community/following/${targetUserId}`));
        const followingCount = fwingSnap.exists() ? Object.keys(fwingSnap.val()).length : 0;

        document.getElementById("user-followers-count").textContent = followerCount;
        document.getElementById("user-following-count").textContent = followingCount;

        document.getElementById("user-followers-item").onclick = () =>
            showFollowList("Followers", `community/followers/${targetUserId}`);
        document.getElementById("user-following-item").onclick = () =>
            showFollowList("Following", `community/following/${targetUserId}`);

    } catch (e) {
        console.error("Follow counts error:", e);
    }
}

async function showFollowList(title, dbPath) {
    const modal = new bootstrap.Modal(document.getElementById("followListModal"));
    document.getElementById("followListTitle").textContent = title;
    const body = document.getElementById("followListBody");
    body.innerHTML = '<div class="text-center p-3"><div class="spinner-border spinner-border-sm text-success"></div></div>';
    modal.show();

    try {
        const snap = await get(child(ref(db), dbPath));
        if (!snap.exists()) {
            body.innerHTML = '<p class="text-center text-muted p-3">No users yet</p>';
            return;
        }

        const userIds = Object.keys(snap.val());
        let html = "";

        for (const uid of userIds) {
            try {
                const uSnap = await get(child(ref(db), `users/${uid}`));
                if (uSnap.exists()) {
                    const u = uSnap.val();
                    const name = `${u.firstName || ""} ${u.lastName || ""}`.trim() || uid;
                    const pic = u.profilePic && u.profilePic !== "default" && u.profilePic.length > 5;
                    html += `
                        <div class="follow-list-item" style="cursor:pointer;" onclick="window.location.href='user-profile.html?uid=${uid}'">
                            ${pic
                                ? `<img src="${u.profilePic}" alt="${name}">`
                                : `<div class="follow-user-initial">${(u.firstName || "U").charAt(0).toUpperCase()}</div>`
                            }
                            <span class="follow-user-name">${name}</span>
                        </div>
                    `;
                }
            } catch (e) { /* skip */ }
        }

        body.innerHTML = html || '<p class="text-center text-muted p-3">No users found</p>';
    } catch (e) {
        body.innerHTML = '<p class="text-center text-muted p-3">Failed to load</p>';
    }
}

/* =====================================================
   USER POSTS GRID
   ===================================================== */
async function loadUserPosts() {
    const grid = document.getElementById("public-user-posts-grid");
    if (!grid) return;

    grid.innerHTML = '<div class="text-center p-3" style="grid-column:1/-1;"><div class="spinner-border spinner-border-sm text-success"></div></div>';

    try {
        const snap = await get(child(ref(db), "community/posts"));
        const userPosts = [];

        if (snap.exists()) {
            snap.forEach(c => {
                const p = c.val();
                if (p.userId === targetUserId && !p.hidden) {
                    userPosts.push(p);
                }
            });
        }

        userPosts.sort((a, b) => b.createdAt - a.createdAt);
        document.getElementById("user-posts-count").textContent = userPosts.length;

        if (userPosts.length === 0) {
            grid.innerHTML = `
                <div class="no-posts-message">
                    <i class="bi bi-camera"></i>
                    <p>No posts published yet 🌿</p>
                </div>
            `;
            return;
        }

        grid.innerHTML = userPosts.map(p => {
            const isVideo = p.isVideo || isVideoUrl(p.imageUrl);
            return `
                <div class="my-post-thumb" onclick="openPostDetail('${p.postId}')">
                    ${p.imageUrl
                        ? isVideo
                            ? `<video src="${p.imageUrl}#t=0.5" style="width:100%;height:100%;object-fit:cover;"></video><div class="post-thumb-overlay"><i class="bi bi-play-circle-fill text-white fs-2"></i></div>`
                            : `<img src="${p.imageUrl}" alt="" loading="lazy"><div class="post-thumb-overlay"><i class="bi bi-eye-fill"></i></div>`
                        : `<div class="post-thumb-text"><p>${(p.description || "").substring(0, 50)}...</p></div>`
                    }
                </div>
            `;
        }).join("");

    } catch (e) {
        console.error("User posts load error:", e);
        grid.innerHTML = '<div class="no-posts-message"><p>Failed to load posts</p></div>';
    }
}

/* =====================================================
   FULL INTERACTIVE POST DETAIL MODAL (LIKE, COMMENTS, SHARE)
   ===================================================== */
window.openPostDetail = async function (postId) {
    const modal = new bootstrap.Modal(document.getElementById("postDetailModal"));
    const body = document.getElementById("postDetailBody");
    body.innerHTML = '<div class="text-center p-4"><div class="spinner-border text-success"></div></div>';
    modal.show();

    try {
        const snap = await get(ref(db, `community/posts/${postId}`));
        if (!snap.exists()) {
            body.innerHTML = '<p class="text-center">Post not found</p>';
            return;
        }

        const post = snap.val();
        const isVideo = post.isVideo || isVideoUrl(post.imageUrl);
        const timeStr = new Date(post.createdAt).toLocaleString();

        let isLiked = false;
        if (currentUserId) {
            const likeSnap = await get(ref(db, `community/likes/${postId}/${currentUserId}`));
            isLiked = likeSnap.exists();
        }

        let mediaHTML = "";
        if (post.imageUrl) {
            if (isVideo) {
                mediaHTML = `<video src="${post.imageUrl}" controls class="post-detail-img" style="background:#000;max-height:450px;width:100%;"></video>`;
            } else {
                mediaHTML = `<img src="${post.imageUrl}" class="post-detail-img" alt="">`;
            }
        }

        body.innerHTML = `
            ${mediaHTML}

            <div class="post-detail-caption" style="font-weight:500; font-size:15px; margin: 12px 0;">${post.description || ""}</div>

            <div class="post-detail-meta" style="font-size:12px; color:var(--text-light); margin-bottom: 12px;">
                <i class="bi bi-clock me-1"></i>${timeStr}
                ${post.location ? `· <i class="bi bi-geo-alt-fill text-danger me-1"></i>${post.location}` : ""}
            </div>

            <!-- INTERACTIVE BUTTONS ROW -->
            <div class="d-flex align-items-center justify-content-between border-top border-bottom py-2 my-3">
                <button type="button" class="btn btn-sm ${isLiked ? 'btn-danger' : 'btn-outline-danger'} rounded-pill px-3" id="modal-like-btn-${postId}" onclick="window.likeModalPost('${postId}', this)">
                    <i class="bi ${isLiked ? 'bi-heart-fill' : 'bi-heart'} me-1"></i>
                    <span id="modal-like-count-${postId}">${post.likesCount || 0}</span> Likes
                </button>

                <button type="button" class="btn btn-sm btn-outline-success rounded-pill px-3" onclick="window.shareModalPost('${postId}')">
                    <i class="bi bi-share-fill me-1"></i> Share
                </button>
            </div>

            <!-- COMMENTS SECTION -->
            <div class="modal-comments-box mt-3">
                <h6><i class="bi bi-chat-dots-fill text-success me-1"></i> Comments (<span id="modal-comment-count-${postId}">${post.commentsCount || 0}</span>)</h6>
                <div class="comments-list mt-2" id="modal-comments-list-${postId}" style="max-height:180px; overflow-y:auto;">
                    <div class="text-center p-2"><div class="spinner-border spinner-border-sm text-success"></div></div>
                </div>

                ${currentUserId ? `
                <form class="d-flex gap-2 mt-3" onsubmit="window.addModalComment('${postId}', event)">
                    <input type="text" class="form-control form-control-sm rounded-pill px-3" placeholder="Write a comment..." id="modal-comment-input-${postId}" autocomplete="off">
                    <button type="submit" class="btn btn-sm btn-success rounded-pill px-3"><i class="bi bi-send-fill"></i></button>
                </form>` : ""}
            </div>
        `;

        loadModalComments(postId);

    } catch (e) {
        console.error("Open post detail error:", e);
        body.innerHTML = '<p class="text-center text-muted">Failed to load post details</p>';
    }
};

window.likeModalPost = async function (postId, btn) {
    if (!currentUserId) {
        alert("Please login first.");
        window.location.href = "../logins/login.html";
        return;
    }

    const likeRef = ref(db, `community/likes/${postId}/${currentUserId}`);
    const postRef = ref(db, `community/posts/${postId}`);
    const countSpan = document.getElementById(`modal-like-count-${postId}`);
    let currentCount = parseInt(countSpan.textContent) || 0;

    const isLiked = btn.classList.contains("btn-danger");

    if (isLiked) {
        btn.className = "btn btn-sm btn-outline-danger rounded-pill px-3";
        btn.querySelector("i").className = "bi bi-heart me-1";
        currentCount = Math.max(0, currentCount - 1);
    } else {
        btn.className = "btn btn-sm btn-danger rounded-pill px-3";
        btn.querySelector("i").className = "bi bi-heart-fill me-1";
        currentCount++;
    }

    countSpan.textContent = currentCount;

    try {
        if (isLiked) {
            await remove(likeRef);
        } else {
            await set(likeRef, true);
        }
        await update(postRef, { likesCount: currentCount });
    } catch (e) { console.error("Like modal sync error:", e); }
};

async function loadModalComments(postId) {
    const list = document.getElementById(`modal-comments-list-${postId}`);
    if (!list) return;

    try {
        const snap = await get(child(ref(db), `community/comments/${postId}`));
        if (!snap.exists()) {
            list.innerHTML = '<p class="text-muted text-center small p-2">No comments yet</p>';
            return;
        }

        const comments = [];
        snap.forEach(c => comments.push({ id: c.key, ...c.val() }));
        comments.sort((a, b) => a.createdAt - b.createdAt);

        const activeUser = localStorage.getItem("urvi_logged_user");
        const postSnap = await get(ref(db, `community/posts/${postId}`));
        const postOwnerId = postSnap.exists() ? postSnap.val().userId : null;

        list.innerHTML = comments.map(c => {
            const canDelete = activeUser && (activeUser === c.userId || activeUser === postOwnerId);
            return `
            <div class="comment-item position-relative" id="profile-comment-${c.id}">
                <div class="comment-header ${canDelete ? 'pe-4' : ''}">
                    <strong>${c.userName || "User"}</strong>
                    <small>${new Date(c.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>
                </div>
                <p class="comment-text">${c.text}</p>
                ${canDelete ? `
                <button type="button" class="btn btn-sm text-danger p-0 position-absolute" style="top:8px; right:10px; line-height:1; font-size:13px; background:none; border:none; cursor:pointer;" onclick="window.deleteModalComment('${postId}', '${c.id}')" title="Delete comment">
                    <i class="bi bi-trash3"></i>
                </button>` : ""}
            </div>
            `;
        }).join("");
    } catch (e) {
        list.innerHTML = '<p class="text-muted text-center small">Failed to load comments</p>';
    }
}

window.deleteModalComment = async function (postId, commentId) {
    if (!confirm("Are you sure you want to delete this comment?")) return;
    try {
        document.getElementById(`profile-comment-${commentId}`)?.remove();
        await remove(ref(db, `community/comments/${postId}/${commentId}`));

        const postSnap = await get(ref(db, `community/posts/${postId}`));
        if (postSnap.exists()) {
            const count = Math.max(0, (postSnap.val().commentsCount || 0) - 1);
            await update(ref(db, `community/posts/${postId}`), { commentsCount: count });
            const countSpan = document.getElementById(`modal-comment-count-${postId}`);
            if (countSpan) countSpan.textContent = count;
        }
    } catch (e) {
        console.error("Delete modal comment error:", e);
        alert("Failed to delete comment: " + e.message);
    }
};

window.addModalComment = async function (postId, event) {
    if (event) event.preventDefault();

    const input = document.getElementById(`modal-comment-input-${postId}`);
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;

    const activeUser = localStorage.getItem("urvi_logged_user");
    if (!activeUser) {
        alert("Please login first.");
        return;
    }

    try {
        const meSnap = await get(child(ref(db), `users/${activeUser}`));
        const me = meSnap.exists() ? meSnap.val() : {};
        const myName = `${me.firstName || ""} ${me.lastName || ""}`.trim() || "User";

        const commentRef = push(ref(db, `community/comments/${postId}`));
        await set(commentRef, {
            userId: activeUser,
            userName: myName,
            userPhoto: me.profilePic || "default",
            text: text,
            createdAt: Date.now()
        });

        input.value = "";
        await loadModalComments(postId);

        const postSnap = await get(ref(db, `community/posts/${postId}`));
        if (postSnap.exists()) {
            const count = (postSnap.val().commentsCount || 0) + 1;
            await update(ref(db, `community/posts/${postId}`), { commentsCount: count });
            const countSpan = document.getElementById(`modal-comment-count-${postId}`);
            if (countSpan) countSpan.textContent = count;
        }
    } catch (e) { console.error("Add modal comment error:", e); }
};

window.shareModalPost = async function (postId) {
    const shareUrl = window.location.origin + `/community/community.html#postcard-${postId}`;
    if (navigator.share) {
        try {
            await navigator.share({ title: "URVI Post", text: "Check out this post on URVI 🌿", url: shareUrl });
        } catch (e) { /* ignore */ }
    } else {
        await navigator.clipboard.writeText(shareUrl);
        alert("🔗 Link copied to clipboard!");
    }
};

async function shareProfile() {
    const shareUrl = window.location.href;
    const name = document.getElementById("user-display-name").textContent;

    if (navigator.share) {
        try {
            await navigator.share({
                title: `${name} on URVI`,
                text: `Check out ${name}'s environmental contributions on URVI! 🌿`,
                url: shareUrl
            });
        } catch (e) { /* ignore */ }
    } else {
        await navigator.clipboard.writeText(shareUrl);
        alert("🔗 Profile link copied to clipboard!");
    }
}

async function loadSidebarProfile() {
    const box = document.getElementById("sidebar-profile-box");
    if (!box) return;

    if (!currentUserId) {
        box.innerHTML = `
            <small class="d-block mb-2" style="color: var(--text-light); font-size: 10px;">Access Dashboard</small>
            <a href="../logins/login.html" class="eco-btn d-block text-center text-decoration-none" style="font-size: 0.82rem; padding: 10px;">
                Log In / Sign Up
            </a>
        `;
        return;
    }

    try {
        const uSnap = await get(child(ref(db), `users/${currentUserId}`));
        if (uSnap.exists()) {
            const me = uSnap.val();
            const myName = `${me.firstName || ""} ${me.lastName || ""}`.trim();
            const pic = me.profilePic && me.profilePic !== "default" && me.profilePic.length > 5 ? me.profilePic : null;
            const initial = (me.firstName || "U").charAt(0).toUpperCase();

            const avatarHTML = pic
                ? `<img src="${pic}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;" alt="${myName}">`
                : `<div style="width:36px;height:36px;border-radius:50%;background:#22C55E;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;">${initial}</div>`;

            box.innerHTML = `
                <small class="d-block mb-2" style="color: var(--text-light); font-size: 10px;">Logged in as</small>
                <div class="d-flex align-items-center gap-2">
                    ${avatarHTML}
                    <div style="min-width: 0;">
                        <div class="fw-bold text-truncate" style="font-size: 0.82rem; max-width: 130px;">${myName}</div>
                        <div style="font-size: 10px; color: var(--urvi-green);">🌿 ${me.userType || "Eco Member"}</div>
                    </div>
                </div>
            `;
        }
    } catch (e) { /* ignore */ }
}
