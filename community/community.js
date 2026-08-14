import { db } from "../config.js";
import { uploadToCloudinary, deleteFromCloudinary, extractPublicIdFromUrl, isVideoUrl } from "../cloudinary.js";

import {
    ref,
    push,
    set,
    onValue,
    update,
    remove,
    get,
    child,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

/* =====================================================
   URVI – community.js | Video Posts, Caching & Widgets
   ===================================================== */

const currentUserId = localStorage.getItem("urvi_logged_user");

// DOM References
const postText = document.getElementById("postText");
const postImage = document.getElementById("postImage");
const previewImage = document.getElementById("previewImage");
const previewVideo = document.getElementById("previewVideo");
const choosePhotoBtn = document.getElementById("choosePhotoBtn");
const postBtn = document.getElementById("postBtn");
const uploadLoader = document.getElementById("uploadLoader");
const uploadProgressContainer = document.getElementById("uploadProgressContainer");
const uploadProgress = document.getElementById("uploadProgress");
const charCount = document.getElementById("charCount");
const postsContainer = document.getElementById("postsContainer");
const searchInput = document.getElementById("userSearchInput");
const searchResults = document.getElementById("searchResults");
const suggestedUsersList = document.getElementById("suggested-users-list");

let userLocation = "";
let allUsers = {};
let renderedPostIds = new Set();
let isInitialPostsLoaded = false;

/* =====================================================
   SCROLL POSITION RETENTION & LOCALSTORAGE CACHE
   ===================================================== */
document.addEventListener("DOMContentLoaded", () => {
    // 1. Instant Cache Load from LocalStorage for 0ms delay!
    loadCachedPosts();

    // 2. Restore Scroll Position if returning from user profile page
    const savedScrollPos = sessionStorage.getItem("urvi_community_scroll");
    if (savedScrollPos) {
        setTimeout(() => {
            window.scrollTo({ top: parseInt(savedScrollPos, 10), behavior: "instant" });
            sessionStorage.removeItem("urvi_community_scroll");
        }, 150);
    }
});

function loadCachedPosts() {
    try {
        const cached = localStorage.getItem("urvi_cached_community_posts");
        if (cached && postsContainer && postsContainer.children.length === 0) {
            const postsList = JSON.parse(cached);
            if (Array.isArray(postsList) && postsList.length > 0) {
                postsContainer.innerHTML = "";
                renderedPostIds.clear();
                postsList.forEach(post => {
                    const cardHtml = createPostCardHTML(post);
                    postsContainer.insertAdjacentHTML("beforeend", cardHtml);
                    renderedPostIds.add(post.postId);
                    bindPostCardEvents(post.postId, post);
                });
            }
        }
    } catch (e) {
        console.error("Cache load error:", e);
    }
}

/* =====================================================
   NAVIGATION WITH SCROLL MEMORY
   ===================================================== */
window.navigateToUserProfile = function (userId) {
    // Save current scroll position before navigating away!
    sessionStorage.setItem("urvi_community_scroll", window.scrollY.toString());

    if (userId === currentUserId) {
        window.location.href = "../profile/profile.html";
    } else {
        window.location.href = `../profile/user-profile.html?uid=${encodeURIComponent(userId)}`;
    }
};

/* =====================================================
   SIDEBAR PROFILE & SUGGESTED CHAMPIONS WIDGET
   ===================================================== */
async function loadSidebarProfile() {
    const sidebarBox = document.getElementById("sidebar-profile-box");
    if (!sidebarBox) return;

    if (!currentUserId) {
        sidebarBox.innerHTML = `
            <small class="d-block mb-2" style="color: var(--text-light); font-size: 10px;">Access Dashboard</small>
            <a href="../logins/login.html" class="eco-btn d-block text-center text-decoration-none" style="font-size: 0.82rem; padding: 10px;">
                Log In / Sign Up
            </a>
        `;
        return;
    }

    // 0ms Instant Cache Load from LocalStorage
    const cachedUserData = localStorage.getItem("urvi_user_data");
    if (cachedUserData) {
        try {
            const cachedUser = JSON.parse(cachedUserData);
            renderSidebarBox(cachedUser);
        } catch (e) { /* ignore */ }
    }

    // Silent background sync with Firebase
    try {
        const snap = await get(child(ref(db), `users/${currentUserId}`));
        if (!snap.exists()) return;
        const user = snap.val();
        localStorage.setItem("urvi_user_data", JSON.stringify(user));
        renderSidebarBox(user);
    } catch (e) {
        console.error("Sidebar sync error:", e);
    }
}

function renderSidebarBox(user) {
    const sidebarBox = document.getElementById("sidebar-profile-box");
    if (!sidebarBox) return;

    const fullName = `${user.firstName || ""} ${user.lastName || ""}`.trim() || currentUserId;
    const avatarHTML = renderAvatar(user, "profile-img-small");

    sidebarBox.innerHTML = `
        <small class="d-block mb-2" style="color: var(--text-light); font-size: 10px;">Logged in as</small>
        <div class="d-flex align-items-center gap-2" style="cursor:pointer;" onclick="navigateToUserProfile('${currentUserId}')">
            ${avatarHTML}
            <div style="min-width: 0;">
                <div class="fw-bold text-truncate" style="font-size: 0.82rem; max-width: 130px; color: var(--text-dark);">${fullName}</div>
                <div style="font-size: 10px; color: var(--bright-green);">🌿 ${user.userType || "Eco Member"}</div>
            </div>
        </div>
        <button type="button" class="eco-btn w-100 mt-3" id="sidebar-logout-btn"
            style="background: #FEE2E2; color: #EF4444; font-size: 11px; padding: 7px 12px; border-radius: 10px; font-weight: 600; border: none; cursor: pointer;">
            Logout
        </button>
    `;

    document.getElementById("sidebar-logout-btn")?.addEventListener("click", () => {
        if (confirm("Logout of URVI?")) {
            localStorage.removeItem("urvi_logged_user");
            localStorage.removeItem("urvi_user_data");
            window.location.href = "../logins/login.html";
        }
    });

    const modalImg = document.getElementById("currentUserImage");
    if (modalImg && user.profilePic && user.profilePic !== "default" && user.profilePic.length > 5) {
        modalImg.src = user.profilePic;
    }
}

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

function renderAvatar(user, cls = "profile-img-small") {
    const pic = user.profilePic || user.profile_pic || user.photoURL;
    const name = user.firstName || user.name || "U";
    const initial = name.charAt(0).toUpperCase();

    const isGold = isAdminUser(user, user.user_id, name);
    const isBlue = (user.role === "verified") || (user.isVerified === true);
    const ringCls = isGold ? "avatar-ring-gold" : (isBlue ? "avatar-ring-blue" : "");

    if (pic && pic !== "default" && pic.length > 5) {
        return `<img src="${pic}" class="${cls} ${ringCls}" alt="${name}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;">`;
    }
    return `<div class="${cls} ${ringCls}" style="width:36px;height:36px;border-radius:50%;background:var(--forest-green);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;">${initial}</div>`;
}

function getVerifiedBadge(user, uid = "", name = "") {
    const isGold = isAdminUser(user, uid, name);
    const isBlue = user && (user.role === "verified" || user.isVerified === true);

    if (isGold) {
        return `<span class="verified-badge gold" title="URVI Official Admin"><i class="bi bi-patch-check-fill"></i></span>`;
    }
    if (isBlue) {
        return `<span class="verified-badge blue" title="Verified Eco Leader"><i class="bi bi-patch-check-fill"></i></span>`;
    }
    return "";
}

/* =====================================================
   SEARCH & SUGGESTED CHAMPIONS
   ===================================================== */
async function loadAllUsers() {
    try {
        const snap = await get(child(ref(db), "users"));
        if (snap.exists()) {
            allUsers = snap.val();
            renderSuggestedUsers();
        }
    } catch (e) {
        console.error("Load users error:", e);
    }
}

function renderSuggestedUsers() {
    if (!suggestedUsersList) return;

    const suggestions = [];
    for (const uid in allUsers) {
        if (uid !== currentUserId) {
            suggestions.push({ uid, ...allUsers[uid] });
        }
        if (suggestions.length >= 4) break;
    }

    if (suggestions.length === 0) {
        suggestedUsersList.innerHTML = '<p class="text-muted small m-0">No suggestions yet</p>';
        return;
    }

    suggestedUsersList.innerHTML = suggestions.map(u => {
        const fullName = `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.uid;
        const pic = u.profilePic && u.profilePic !== "default" && u.profilePic.length > 5;
        return `
            <div class="widget-user-item">
                <div class="widget-user-info" onclick="navigateToUserProfile('${u.uid}')">
                    ${pic
                        ? `<img src="${u.profilePic}" alt="">`
                        : `<div class="widget-user-initial">${(u.firstName || "U").charAt(0).toUpperCase()}</div>`
                    }
                    <div style="min-width:0;">
                        <div class="fw-bold text-truncate" style="font-size:13px;">${fullName}</div>
                        <div style="font-size:11px;color:var(--text-light);">@${u.user_id || u.uid}</div>
                    </div>
                </div>
                <button type="button" class="follow-btn-sm" id="widget-follow-${u.uid}" data-author-id="${u.uid}"></button>
            </div>
        `;
    }).join("");

    // Setup follow state on widget buttons
    suggestions.forEach(u => {
        const btn = document.getElementById(`widget-follow-${u.uid}`);
        if (btn && currentUserId) setupFollowBtnSm(btn, u.uid);
    });
}

if (searchInput) {
    let searchTimeout;
    searchInput.addEventListener("input", () => {
        clearTimeout(searchTimeout);
        const query = searchInput.value.trim().toLowerCase();
        if (query.length < 2) {
            searchResults.classList.remove("active");
            searchResults.innerHTML = "";
            return;
        }
        searchTimeout = setTimeout(() => performSearch(query), 300);
    });

    document.addEventListener("click", (e) => {
        if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
            searchResults.classList.remove("active");
        }
    });
}

function performSearch(query) {
    const results = [];
    for (const uid in allUsers) {
        const u = allUsers[uid];
        const fullName = `${u.firstName || ""} ${u.lastName || ""}`.toLowerCase();
        const userId = (u.user_id || uid).toLowerCase();
        if (fullName.includes(query) || userId.includes(query)) {
            results.push({ uid, ...u });
        }
        if (results.length >= 8) break;
    }

    if (results.length === 0) {
        searchResults.innerHTML = `<div class="search-empty"><i class="bi bi-search"></i> No users found</div>`;
    } else {
        searchResults.innerHTML = results.map(u => {
            const pic = u.profilePic && u.profilePic !== "default" && u.profilePic.length > 5
                ? `<img src="${u.profilePic}" alt="" class="search-user-pic">`
                : `<div class="search-user-pic search-user-initial">${(u.firstName || "U").charAt(0).toUpperCase()}</div>`;
            return `
                <div class="search-result-item" onclick="navigateToUserProfile('${u.uid}')">
                    ${pic}
                    <div class="search-user-info">
                        <span class="search-user-name">${u.firstName || ""} ${u.lastName || ""}</span>
                        <span class="search-user-id">@${u.user_id || u.uid}</span>
                    </div>
                </div>
            `;
        }).join("");
    }
    searchResults.classList.add("active");
}

/* =====================================================
   CREATE POST (IMAGE & VIDEO PREVIEW & UPLOAD)
   ===================================================== */
postText?.addEventListener("input", () => {
    charCount.innerText = `${postText.value.length} / 500`;
});

choosePhotoBtn?.addEventListener("click", () => postImage.click());

postImage?.addEventListener("change", () => {
    const file = postImage.files[0];
    if (!file) {
        if (previewImage) previewImage.style.display = "none";
        if (previewVideo) previewVideo.style.display = "none";
        return;
    }

    if (file.type.startsWith("video/")) {
        if (previewImage) previewImage.style.display = "none";
        if (previewVideo) {
            previewVideo.src = URL.createObjectURL(file);
            previewVideo.style.display = "block";
        }
    } else {
        if (previewVideo) previewVideo.style.display = "none";
        if (previewImage) {
            previewImage.src = URL.createObjectURL(file);
            previewImage.style.display = "block";
        }
    }
});

window.addLocation = async function () {
    if (!navigator.geolocation) {
        alert("Geolocation is not supported.");
        return;
    }
    const locationBtn = document.getElementById("locationBtn");
    if (locationBtn) locationBtn.innerHTML = '<i class="bi bi-geo-alt-fill text-danger"></i> Detecting...';

    navigator.geolocation.getCurrentPosition(
        async (position) => {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;
            try {
                const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
                const data = await response.json();
                userLocation = data.address.city || data.address.town || data.address.village || data.address.state || "Unknown";
                if (locationBtn) locationBtn.innerHTML = `<i class="bi bi-geo-alt-fill text-danger"></i> ${userLocation}`;
            } catch (error) {
                if (locationBtn) locationBtn.innerHTML = '<i class="bi bi-geo-alt-fill text-danger"></i> Location';
                alert("Unable to fetch location.");
            }
        },
        () => {
            if (locationBtn) locationBtn.innerHTML = '<i class="bi bi-geo-alt-fill text-danger"></i> Location';
            alert("Location permission denied.");
        }
    );
};

postBtn?.addEventListener("click", createPost);

async function createPost(e) {
    if (e) e.preventDefault();
    try {
        if (!currentUserId) {
            alert("Please login first.");
            window.location.href = "../logins/login.html";
            return;
        }
        const userSnapshot = await get(ref(db, `users/${currentUserId}`));
        if (!userSnapshot.exists()) {
            alert("User record not found.");
            return;
        }

        const user = userSnapshot.val();
        const description = postText.value.trim();
        const file = postImage.files[0];
        if (!description && !file) {
            alert("Please write a caption or select a photo/video.");
            return;
        }

        showLoader();
        let imageUrl = "";

        if (file) {
            try {
                imageUrl = await uploadToCloudinary(file, (progress) => {
                    uploadProgress.style.width = `${progress}%`;
                    uploadProgress.innerText = `${progress}%`;
                });
            } catch (uploadErr) {
                hideLoader();
                alert("Media upload failed: " + uploadErr.message);
                return;
            }
        }

        const postRef = push(ref(db, "community/posts"));
        const postData = {
            postId: postRef.key,
            userId: currentUserId,
            userName: `${user.firstName || ""} ${user.lastName || ""}`.trim(),
            userEmail: user.email || "",
            userPhoto: user.profilePic || "default",
            description: description,
            imageUrl: imageUrl,
            isVideo: file && file.type.startsWith("video/"),
            location: userLocation,
            likesCount: 0,
            commentsCount: 0,
            sharesCount: 0,
            createdAt: Date.now()
        };

        await set(postRef, postData);

        notifyFollowers(currentUserId, user, postRef.key);

        hideLoader();
        resetForm();

        const modal = bootstrap.Modal.getInstance(document.getElementById("createPostModal"));
        if (modal) modal.hide();

        showToast("🎉 Post published successfully!");

    } catch (error) {
        console.error(error);
        hideLoader();
        alert(error.message);
    }
}

function showLoader() {
    uploadLoader.style.display = "block";
    uploadProgressContainer.style.display = "block";
    uploadProgress.style.width = "20%";
    uploadProgress.innerText = "Uploading...";
}

function hideLoader() {
    uploadLoader.style.display = "none";
    uploadProgressContainer.style.display = "none";
    uploadProgress.style.width = "0%";
    uploadProgress.innerText = "0%";
}

function resetForm() {
    postText.value = "";
    postImage.value = "";
    if (previewImage) { previewImage.src = ""; previewImage.style.display = "none"; }
    if (previewVideo) { previewVideo.src = ""; previewVideo.style.display = "none"; }
    charCount.innerText = "0 / 500";
    userLocation = "";
    const locationBtn = document.getElementById("locationBtn");
    if (locationBtn) locationBtn.innerHTML = '<i class="bi bi-geo-alt-fill text-danger"></i> Location';
}

async function notifyFollowers(authorId, authorUser, postId) {
    try {
        const followersSnap = await get(child(ref(db), `community/followers/${authorId}`));
        if (!followersSnap.exists()) return;
        const followers = followersSnap.val();
        const authorName = `${authorUser.firstName || ""} ${authorUser.lastName || ""}`.trim();

        for (const followerId in followers) {
            const notifRef = push(ref(db, `notifications/${followerId}`));
            await set(notifRef, {
                type: "new_post",
                fromUserId: authorId,
                fromUserName: authorName,
                fromUserPhoto: authorUser.profilePic || "default",
                postId: postId,
                message: `${authorName} shared a new post`,
                read: false,
                createdAt: Date.now()
            });
        }
    } catch (e) {
        console.error("Notify followers error:", e);
    }
}

/* =====================================================
   REAL-TIME POSTS FEED WITH LOCALSTORAGE CACHING
   ===================================================== */
loadPostsRealtime();

function loadPostsRealtime() {
    const postsRef = ref(db, "community/posts");

    onValue(postsRef, (snapshot) => {
        if (!snapshot.exists()) {
            postsContainer.innerHTML = `
                <div class="col-12 text-center p-5 empty-state">
                    <i class="bi bi-images fs-1 text-secondary"></i>
                    <h4 class="mt-3">No Posts Yet</h4>
                    <p class="text-muted">Be the first person to share something 🌿</p>
                </div>
            `;
            renderedPostIds.clear();
            localStorage.removeItem("urvi_cached_community_posts");
            return;
        }

        const postsList = [];
        snapshot.forEach(c => {
            const p = c.val();
            if (!p.hidden) {
                postsList.push(p);
            }
        });
        postsList.sort((a, b) => b.createdAt - a.createdAt);

        // Cache posts in LocalStorage for 0ms load next time!
        try {
            localStorage.setItem("urvi_cached_community_posts", JSON.stringify(postsList.slice(0, 30)));
        } catch (e) { /* ignore storage quota */ }

        // Initial render: Build all cards once
        if (!isInitialPostsLoaded) {
            postsContainer.innerHTML = "";
            renderedPostIds.clear();

            postsList.forEach(post => {
                const cardHtml = createPostCardHTML(post);
                postsContainer.insertAdjacentHTML("beforeend", cardHtml);
                renderedPostIds.add(post.postId);
                bindPostCardEvents(post.postId, post);
            });

            isInitialPostsLoaded = true;
            return;
        }

        // Real-time differential updates (In-Place without wiping DOM!)
        postsList.forEach(post => {
            const existingCard = document.getElementById(`postcard-${post.postId}`);

            if (!existingCard) {
                const cardHtml = createPostCardHTML(post);
                postsContainer.insertAdjacentHTML("afterbegin", cardHtml);
                renderedPostIds.add(post.postId);
                bindPostCardEvents(post.postId, post);
            } else {
                const likesSpan = existingCard.querySelector(".like-count");
                if (likesSpan && likesSpan.textContent != post.likesCount) {
                    likesSpan.textContent = post.likesCount || 0;
                }

                const commentsSpan = existingCard.querySelector(".comment-count");
                if (commentsSpan && commentsSpan.textContent != post.commentsCount) {
                    commentsSpan.textContent = post.commentsCount || 0;
                }

                const sharesSpan = existingCard.querySelector(".share-count");
                if (sharesSpan && sharesSpan.textContent != post.sharesCount) {
                    sharesSpan.textContent = post.sharesCount || 0;
                }
            }
        });

        // Remove cards that were deleted
        const activeIds = new Set(postsList.map(p => p.postId));
        renderedPostIds.forEach(id => {
            if (!activeIds.has(id)) {
                document.getElementById(`postcard-${id}`)?.remove();
                renderedPostIds.delete(id);
            }
        });
    });
}

/* =====================================================
   POST CARD TEMPLATE & EVENT BINDING (IMAGE & VIDEO)
   ===================================================== */
function createPostCardHTML(post) {
    const ownPost = currentUserId === post.userId;
    const isGold = isAdminUser(null, post.userId, post.userName);
    const isBlue = post.userRole === "verified" || post.isVerified === true;
    const ringCls = isGold ? "avatar-ring-gold" : (isBlue ? "avatar-ring-blue" : "");
    const verifiedBadgeHTML = getVerifiedBadge(null, post.userId, post.userName);

    const userAvatar = post.userPhoto && post.userPhoto !== 'default' && post.userPhoto.length > 5
        ? post.userPhoto
        : `https://ui-avatars.com/api/?name=${encodeURIComponent(post.userName)}&background=22C55E&color=fff`;

    const isVideo = post.isVideo || isVideoUrl(post.imageUrl);

    let mediaHTML = "";
    if (post.imageUrl) {
        if (isVideo) {
            mediaHTML = `<video src="${post.imageUrl}" controls class="post-video" preload="metadata" playsinline></video>`;
        } else {
            mediaHTML = `<img src="${post.imageUrl}" class="post-image" loading="lazy" alt="Post image">`;
        }
    }

    return `
    <div class="col-12 post-card-wrapper" id="postcard-${post.postId}">
        <div class="post-card">
            <div class="post-header">
                <div class="post-header-left" onclick="navigateToUserProfile('${post.userId}')">
                    <img src="${userAvatar}" class="post-profile-img ${ringCls}" alt="${post.userName}">
                    <div>
                        <h6 class="d-inline-flex align-items-center mb-0">${post.userName} ${verifiedBadgeHTML}</h6>
                        <small class="d-block text-muted" style="font-size: 11px;">${timeAgo(post.createdAt)}</small>
                    </div>
                </div>
                <div class="post-header-right">
                    ${!ownPost && currentUserId ? `<button type="button" class="follow-btn-sm" id="follow-sm-${post.postId}" data-author-id="${post.userId}" title="Follow/Unfollow"></button>` : ""}
                    ${ownPost ? `<button type="button" class="btn btn-sm btn-outline-danger border-0" onclick="deletePost('${post.postId}')"><i class="bi bi-trash-fill"></i></button>` : ""}
                </div>
            </div>

            ${mediaHTML}

            <div class="post-content">
                <p class="post-caption" id="caption-${post.postId}">${post.description || ""}</p>
                ${(post.description || "").length > 120 ? `<span class="read-more" onclick="toggleCaption('${post.postId}')">Read More</span>` : ""}
                ${post.location ? `<div class="location mt-2"><i class="bi bi-geo-alt-fill"></i> ${post.location}</div>` : ""}
            </div>

            <div class="post-footer">
                <button type="button" class="like-btn" id="like-btn-${post.postId}" onclick="likePost('${post.postId}', this, event)">
                    <i class="bi bi-heart"></i>
                    <span class="like-count">${post.likesCount || 0}</span>
                </button>

                <button type="button" class="comment-btn" onclick="toggleComments('${post.postId}')">
                    <i class="bi bi-chat-dots"></i>
                    <span class="comment-count">${post.commentsCount || 0}</span>
                </button>

                <button type="button" onclick="sharePost('${post.postId}', event)">
                    <i class="bi bi-share"></i>
                    <span class="share-count">${post.sharesCount || 0}</span>
                </button>
            </div>

            <div class="comments-section" id="comments-${post.postId}" style="display:none;">
                <div class="comments-list" id="comments-list-${post.postId}"></div>
                ${currentUserId ? `
                <form class="comment-input-row" onsubmit="addComment('${post.postId}', event)">
                    <input type="text" placeholder="Write a comment..." id="comment-input-${post.postId}" maxlength="300" autocomplete="off">
                    <button type="submit"><i class="bi bi-send-fill"></i></button>
                </form>` : ""}
            </div>
        </div>
    </div>`;
}

async function bindPostCardEvents(postId, post) {
    const card = document.getElementById(`postcard-${postId}`);
    if (!card) return;

    if (currentUserId) {
        try {
            const likeSnap = await get(ref(db, `community/likes/${postId}/${currentUserId}`));
            if (likeSnap.exists()) {
                const likeBtn = document.getElementById(`like-btn-${postId}`);
                if (likeBtn) {
                    likeBtn.classList.add("liked");
                    likeBtn.querySelector("i").className = "bi bi-heart-fill";
                }
            }
        } catch (e) { /* ignore */ }
    }

    const followBtn = card.querySelector(".follow-btn-sm");
    if (followBtn && currentUserId) {
        setupFollowBtnSm(followBtn, post.userId);
    }
}

async function setupFollowBtnSm(btn, authorId) {
    try {
        const snap = await get(ref(db, `community/following/${currentUserId}/${authorId}`));
        if (snap.exists()) {
            btn.classList.add("following");
            btn.innerHTML = '<i class="bi bi-person-check-fill"></i>';
        } else {
            btn.innerHTML = '<i class="bi bi-person-plus"></i>';
        }
    } catch (e) {
        btn.innerHTML = '<i class="bi bi-person-plus"></i>';
    }

    btn.onclick = async (e) => {
        e.stopPropagation();
        const followingRef = ref(db, `community/following/${currentUserId}/${authorId}`);
        const followersRef = ref(db, `community/followers/${authorId}/${currentUserId}`);

        try {
            const checkSnap = await get(followingRef);
            if (checkSnap.exists()) {
                await remove(followingRef);
                await remove(followersRef);
                btn.classList.remove("following");
                btn.innerHTML = '<i class="bi bi-person-plus"></i>';
            } else {
                await set(followingRef, true);
                await set(followersRef, true);
                btn.classList.add("following");
                btn.innerHTML = '<i class="bi bi-person-check-fill"></i>';
            }
        } catch (err) {
            console.error("Small follow error:", err);
        }
    };
}

/* =====================================================
   SMOOTH LIKE, COMMENTS & SHARE
   ===================================================== */
window.likePost = async function (postId, btn, event) {
    if (event) event.preventDefault();

    if (!currentUserId) {
        alert("Please login first.");
        window.location.href = "../logins/login.html";
        return;
    }

    const likeRef = ref(db, `community/likes/${postId}/${currentUserId}`);
    const postRef = ref(db, `community/posts/${postId}`);
    const icon = btn.querySelector("i");
    const countSpan = btn.querySelector(".like-count");
    let currentCount = parseInt(countSpan.textContent) || 0;

    const isLikedNow = btn.classList.contains("liked");

    if (isLikedNow) {
        btn.classList.remove("liked");
        icon.className = "bi bi-heart";
        currentCount = Math.max(0, currentCount - 1);
        countSpan.textContent = currentCount;
    } else {
        btn.classList.add("liked", "like-animate");
        icon.className = "bi bi-heart-fill";
        currentCount++;
        countSpan.textContent = currentCount;
        setTimeout(() => btn.classList.remove("like-animate"), 400);
    }

    try {
        if (isLikedNow) {
            await remove(likeRef);
        } else {
            await set(likeRef, true);
        }

        await update(postRef, { likesCount: currentCount });

        if (!isLikedNow) {
            const postSnap = await get(postRef);
            if (postSnap.exists()) {
                const authorId = postSnap.val().userId;
                if (authorId !== currentUserId) {
                    const meSnap = await get(child(ref(db), `users/${currentUserId}`));
                    if (meSnap.exists()) {
                        const me = meSnap.val();
                        const myName = `${me.firstName || ""} ${me.lastName || ""}`.trim();
                        const notifRef = push(ref(db, `notifications/${authorId}`));
                        await set(notifRef, {
                            type: "like",
                            fromUserId: currentUserId,
                            fromUserName: myName,
                            fromUserPhoto: me.profilePic || "default",
                            postId: postId,
                            message: `${myName} liked your post`,
                            read: false,
                            createdAt: Date.now()
                        });
                    }
                }
            }
        }
    } catch (error) {
        console.error("Like sync error:", error);
    }
};

window.toggleComments = async function (postId) {
    const section = document.getElementById(`comments-${postId}`);
    if (!section) return;

    if (section.style.display === "none" || section.style.display === "") {
        section.style.display = "block";
        await loadComments(postId);
    } else {
        section.style.display = "none";
    }
};

async function loadComments(postId) {
    const list = document.getElementById(`comments-list-${postId}`);
    if (!list) return;
    list.innerHTML = '<div class="text-center p-2"><div class="spinner-border spinner-border-sm text-success"></div></div>';

    try {
        const snap = await get(child(ref(db), `community/comments/${postId}`));
        if (!snap.exists()) {
            list.innerHTML = '<p class="text-muted text-center" style="font-size:13px;padding:8px;">No comments yet</p>';
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
                <div class="comment-item" id="comment-item-${c.id}">
                    <div class="comment-header">
                        <strong style="cursor:pointer;" onclick="navigateToUserProfile('${c.userId}')">${c.userName || "User"}</strong>
                        <small>${timeAgo(c.createdAt)}</small>
                    </div>
                    <p class="comment-text">${c.text}</p>
                    ${canDelete ? `<button type="button" class="comment-delete-btn" onclick="deleteComment('${postId}', '${c.id}')" title="Delete comment"><i class="bi bi-trash3"></i></button>` : ""}
                </div>
            `;
        }).join("");
    } catch (e) {
        list.innerHTML = '<p class="text-muted text-center" style="font-size:13px;">Failed to load comments</p>';
    }
}

window.addComment = async function (postId, event) {
    if (event) event.preventDefault();

    const input = document.getElementById(`comment-input-${postId}`);
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;

    const activeUser = localStorage.getItem("urvi_logged_user");
    if (!activeUser) {
        alert("Please login first.");
        window.location.href = "../logins/login.html";
        return;
    }

    try {
        const userSnap = await get(child(ref(db), `users/${activeUser}`));
        const me = userSnap.exists() ? userSnap.val() : {};
        const myName = `${me.firstName || ""} ${me.lastName || ""}`.trim() || "User";

        const commentRef = push(ref(db, `community/comments/${postId}`));
        const newCommentData = {
            userId: activeUser,
            userName: myName,
            userPhoto: me.profilePic || "default",
            text: text,
            createdAt: Date.now()
        };

        input.value = "";

        const list = document.getElementById(`comments-list-${postId}`);
        if (list) {
            const emptyMsg = list.querySelector("p");
            if (emptyMsg) emptyMsg.remove();

            const commentItemHtml = `
                <div class="comment-item" id="comment-item-${commentRef.key}">
                    <div class="comment-header">
                        <strong style="cursor:pointer;" onclick="navigateToUserProfile('${activeUser}')">${myName}</strong>
                        <small>Just now</small>
                    </div>
                    <p class="comment-text">${text}</p>
                    <button type="button" class="comment-delete-btn" onclick="deleteComment('${postId}', '${commentRef.key}')" title="Delete comment"><i class="bi bi-trash3"></i></button>
                </div>
            `;
            list.insertAdjacentHTML("beforeend", commentItemHtml);
        }

        await set(commentRef, newCommentData);

        const postSnap = await get(ref(db, `community/posts/${postId}`));
        if (postSnap.exists()) {
            const newCount = (postSnap.val().commentsCount || 0) + 1;
            await update(ref(db, `community/posts/${postId}`), { commentsCount: newCount });

            const card = document.getElementById(`postcard-${postId}`);
            if (card) {
                const countSpan = card.querySelector(".comment-count");
                if (countSpan) countSpan.textContent = newCount;
            }
        }

    } catch (e) {
        console.error("Add comment error:", e);
    }
};

window.deleteComment = async function (postId, commentId) {
    if (!confirm("Are you sure you want to delete this comment?")) return;

    try {
        document.getElementById(`comment-item-${commentId}`)?.remove();

        await remove(ref(db, `community/comments/${postId}/${commentId}`));

        const postSnap = await get(ref(db, `community/posts/${postId}`));
        if (postSnap.exists()) {
            const newCount = Math.max(0, (postSnap.val().commentsCount || 0) - 1);
            await update(ref(db, `community/posts/${postId}`), { commentsCount: newCount });

            const card = document.getElementById(`postcard-${postId}`);
            if (card) {
                const countSpan = card.querySelector(".comment-count");
                if (countSpan) countSpan.textContent = newCount;
            }
        }
    } catch (e) {
        console.error("Delete comment error:", e);
    }
};

window.deletePost = async function (postId) {
    if (!confirm("Permanently delete this post? This will remove the post, comments, likes, and associated Cloudinary media.")) return;
    try {
        const postSnap = await get(child(ref(db), `community/posts/${postId}`));
        if (postSnap.exists()) {
            const postData = postSnap.val();
            if (postData.imageUrl && postData.imageUrl.includes("cloudinary.com")) {
                const { public_id, resource_type } = extractPublicIdFromUrl(postData.imageUrl);
                if (public_id) {
                    await deleteFromCloudinary(public_id, resource_type);
                }
            }
        }

        document.getElementById(`postcard-${postId}`)?.remove();

        await remove(ref(db, `community/posts/${postId}`));
        await remove(ref(db, `community/likes/${postId}`));
        await remove(ref(db, `community/comments/${postId}`));
        showToast("Post and Cloudinary assets deleted.");
    } catch (error) {
        console.error("Delete post error:", error);
        alert("Unable to delete post: " + error.message);
    }
};

window.sharePost = async function (postId, event) {
    if (event) event.preventDefault();

    try {
        const postRef = ref(db, `community/posts/${postId}`);
        const snapshot = await get(postRef);
        let shareText = "Check out this community post on URVI 🌿";
        let shareUrl = window.location.href;

        if (snapshot.exists()) {
            const post = snapshot.val();
            const totalShares = (post.sharesCount || 0) + 1;
            await update(postRef, { sharesCount: totalShares });

            const card = document.getElementById(`postcard-${postId}`);
            if (card) {
                const countSpan = card.querySelector(".share-count");
                if (countSpan) countSpan.textContent = totalShares;
            }

            if (post.description) {
                shareText = post.description.substring(0, 100) + (post.description.length > 100 ? "..." : "");
            }
        }

        if (navigator.share) {
            await navigator.share({
                title: "URVI Community",
                text: shareText,
                url: shareUrl
            });
        } else {
            await navigator.clipboard.writeText(shareUrl);
            showToast("🔗 Link copied to clipboard!");
        }
    } catch (error) {
        if (error.name !== "AbortError") {
            console.log(error);
        }
    }
};

function timeAgo(timestamp) {
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

window.toggleCaption = function (postId) {
    const caption = document.getElementById(`caption-${postId}`);
    if (caption) caption.classList.toggle("expanded");
};

function showToast(message) {
    let toast = document.getElementById("communityToast");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "communityToast";
        toast.className = "community-toast";
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 3000);
}

// Init
loadSidebarProfile();
loadAllUsers();