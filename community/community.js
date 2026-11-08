import { db } from "../config.js";
import { uploadToCloudinary, uploadToCloudinaryDetailed, deleteFromCloudinary, extractPublicIdFromUrl, isVideoUrl } from "../cloudinary.js";

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

const rawUserId = localStorage.getItem("urvi_logged_user");
const currentUserId = (rawUserId && rawUserId !== "undefined" && rawUserId !== "null" && rawUserId.trim() !== "")
    ? rawUserId.trim()
    : null;

/**
 * Gatekeeper for creating posts: Guests must log in first
 */
window.openCreatePostModal = function () {
    if (!currentUserId) {
        alert("Please log in to share posts and stories with the URVI community!");
        window.location.href = "../logins/login.html";
        return;
    }
    const modalEl = document.getElementById("createPostModal");
    if (modalEl && window.bootstrap) {
        const modal = window.bootstrap.Modal.getOrCreateInstance(modalEl);
        modal.show();
    }
};

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
    // 1. Modal Authentication Guards (Ensure guests cannot open post/story modals)
    document.getElementById("createPostModal")?.addEventListener("show.bs.modal", function (e) {
        if (!currentUserId) {
            e.preventDefault();
            alert("Please log in to share posts and stories with the URVI community!");
            window.location.href = "../logins/login.html";
        }
    });

    document.getElementById("uploadStoryModal")?.addEventListener("show.bs.modal", function (e) {
        if (!currentUserId) {
            e.preventDefault();
            alert("Please log in to keep stories on URVI!");
            window.location.href = "../logins/login.html";
        }
    });

    document.getElementById("storyPostChoiceModal")?.addEventListener("show.bs.modal", function (e) {
        if (!currentUserId) {
            e.preventDefault();
            alert("Please log in to add stories or posts!");
            window.location.href = "../logins/login.html";
        }
    });

    // 2. Instant Cache Load from LocalStorage for 0ms delay!
    loadCachedPosts();
    initCommunityStoriesEngine();

    // 3. Restore Scroll Position if returning from user profile page
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
            const matchesCurrent = !currentUserId || !cachedUser.user_id ||
                cachedUser.user_id.toLowerCase() === currentUserId.toLowerCase() ||
                (cachedUser.auth_uid && cachedUser.auth_uid === currentUserId) ||
                (cachedUser.email && cachedUser.email.toLowerCase() === currentUserId.toLowerCase()) ||
                currentUserId.toLowerCase() === "urvi.earth";
            if (matchesCurrent) {
                renderSidebarBox(cachedUser);
            } else {
                localStorage.removeItem("urvi_user_data");
            }
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
   SEARCH, SUGGESTED CHAMPIONS & INSTAGRAM STORIES
   ===================================================== */
async function loadAllUsers() {
    try {
        renderInstagramStories(); // Initial render from cache or placeholders
        const snap = await get(child(ref(db), "users"));
        if (snap.exists()) {
            allUsers = snap.val();
            renderSuggestedUsers();
            renderInstagramStories(); // Refresh with live users from Firebase
        }
    } catch (e) {
        console.error("Load users error:", e);
    }
}

function renderInstagramStories() {
    const storiesScroll = document.getElementById("instaStoriesScroll");
    if (!storiesScroll) return;

    let currentUser = null;
    try {
        const cached = localStorage.getItem("urvi_user_data");
        if (cached) currentUser = JSON.parse(cached);
    } catch (e) { /* ignore */ }

    const myPic = currentUser && currentUser.profilePic && currentUser.profilePic.length > 5 && currentUser.profilePic !== "default"
        ? currentUser.profilePic
        : null;
    const myName = currentUser ? (currentUser.firstName || "You") : "You";
    const myInitial = myName.charAt(0).toUpperCase();

    // 1. "Your Story" item with plus badge
    let html = `
        <div class="insta-story-item" id="btn-insta-add-story" data-bs-toggle="modal" data-bs-target="#createPostModal">
            <div class="insta-story-avatar-wrap your-story">
                ${myPic 
                    ? `<img src="${myPic}" class="insta-story-avatar" alt="Your story">`
                    : `<div class="insta-story-avatar">${myInitial}</div>`
                }
                <div class="insta-story-add-badge"><i class="bi bi-plus"></i></div>
            </div>
            <span class="insta-story-username">Your story</span>
        </div>
    `;

    // 2. Stories from active community members
    const storyUsers = [];
    for (const uid in allUsers) {
        if (uid !== currentUserId) {
            storyUsers.push({ uid, ...allUsers[uid] });
        }
        if (storyUsers.length >= 10) break;
    }

    if (storyUsers.length > 0) {
        storyUsers.forEach((u, idx) => {
            const name = (u.firstName || u.user_id || u.uid || "Eco Friend").split(" ")[0];
            const pic = u.profilePic && u.profilePic.length > 5 && u.profilePic !== "default"
                ? u.profilePic
                : null;
            const ringType = idx % 2 === 0 ? "" : "green-ring";

            html += `
                <div class="insta-story-item" onclick="navigateToUserProfile('${u.uid}')">
                    <div class="insta-story-avatar-wrap ${ringType}">
                        ${pic 
                            ? `<img src="${pic}" class="insta-story-avatar" alt="${name}">`
                            : `<div class="insta-story-avatar">${name.charAt(0).toUpperCase()}</div>`
                        }
                    </div>
                    <span class="insta-story-username">${name}</span>
                </div>
            `;
        });
    }

    storiesScroll.innerHTML = html;
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
if (postsContainer && !postsContainer.children.length && window.getUrviSpinnerHTML) {
    postsContainer.innerHTML = window.getUrviSpinnerHTML({ text: "Loading community feed..." });
}

loadPostsRealtime();

function loadPostsRealtime() {
    const postsRef = ref(db, "community/posts");

    onValue(postsRef, (snapshot) => {
        if (window.hideUrviLoader) window.hideUrviLoader();
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
                </form>` : `
                <div class="p-2 text-center my-2 rounded-3 border bg-light" style="cursor:pointer;" onclick="window.location.href='../logins/login.html'">
                    <small class="text-muted fw-semibold"><i class="bi bi-box-arrow-in-right text-success me-1"></i> Log in to react or join the conversation</small>
                </div>
                `}
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
        alert("Please log in to like posts!");
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

    if (!currentUserId) {
        alert("Please log in to comment on posts!");
        window.location.href = "../logins/login.html";
        return;
    }

    try {
        const userSnap = await get(child(ref(db), `users/${currentUserId}`));
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

// =====================================================
//  Community Real-Time 24-Hour Stories Engine
// =====================================================
let commChoiceModalInstance = null;
let commUploadStoryModalInstance = null;
let commSelectedStoryFile = null;

let commStoriesByUser = {};
let commStoryUserKeys = [];
let commCurrentStoryUserIdx = 0;
let commCurrentStoryItemIdx = 0;
let commStoryStepTimer = null;
let commStoryAnimationReq = null;
let commStoryCurrentDuration = 5000;

function getCommSeenStoryIds() {
    try {
        return JSON.parse(localStorage.getItem("urvi_seen_story_ids") || "[]");
    } catch {
        return [];
    }
}

function markCommStoryAsSeen(storyId) {
    if (!storyId) return;
    const seen = getCommSeenStoryIds();
    if (!seen.includes(storyId)) {
        seen.push(storyId);
        try {
            localStorage.setItem("urvi_seen_story_ids", JSON.stringify(seen.slice(-200)));
        } catch { /* ignore */ }
    }
}

function initCommunityStoriesEngine() {
    const choiceModalEl = document.getElementById("storyPostChoiceModal");
    const uploadModalEl = document.getElementById("uploadStoryModal");

    if (window.bootstrap && window.bootstrap.Modal) {
        if (choiceModalEl) commChoiceModalInstance = new window.bootstrap.Modal(choiceModalEl);
        if (uploadModalEl) commUploadStoryModalInstance = new window.bootstrap.Modal(uploadModalEl);
    }

    document.getElementById("btn-choice-add-story")?.addEventListener("click", () => {
        if (!currentUserId) {
            alert("Please log in to keep stories on URVI!");
            window.location.href = "../logins/login.html";
            return;
        }
        if (commChoiceModalInstance) commChoiceModalInstance.hide();
        if (commUploadStoryModalInstance) commUploadStoryModalInstance.show();
    });

    setupCommStoryUploadHandlers();
    setupCommStoryViewerEvents();

    // Listen on Firebase stories/
    onValue(ref(db, "stories"), (snapshot) => {
        const rawStories = snapshot.val() || {};
        renderCommStoriesTray(rawStories);
    });
}

function setupCommStoryUploadHandlers() {
    const fileInput = document.getElementById("story-file-input");
    const previewBox = document.getElementById("story-media-preview-box");
    const form = document.getElementById("story-upload-form");
    const submitBtn = document.getElementById("btn-submit-story");
    const progressContainer = document.getElementById("story-progress-container");
    const progressBar = document.getElementById("story-progress-bar");

    fileInput?.addEventListener("change", function () {
        commSelectedStoryFile = this.files[0] || null;
        if (!commSelectedStoryFile) {
            previewBox?.classList.add("d-none");
            return;
        }

        const isVideo = commSelectedStoryFile.type.startsWith("video/");
        if (isVideo) {
            const v = document.createElement("video");
            v.preload = "metadata";
            v.onloadedmetadata = function () {
                window.URL.revokeObjectURL(v.src);
                if (v.duration > 30) {
                    alert("⚠️ Story videos are limited to 30 seconds. Please select a shorter video clip.");
                    fileInput.value = "";
                    commSelectedStoryFile = null;
                    previewBox?.classList.add("d-none");
                } else {
                    renderCommStoryPreview(commSelectedStoryFile, true);
                }
            };
            v.src = URL.createObjectURL(commSelectedStoryFile);
        } else {
            renderCommStoryPreview(commSelectedStoryFile, false);
        }
    });

    function renderCommStoryPreview(file, isVid) {
        if (!previewBox) return;
        previewBox.classList.remove("d-none");
        const url = URL.createObjectURL(file);
        if (isVid) {
            previewBox.innerHTML = `<video src="${url}" controls class="w-100 rounded-3" style="max-height:220px; background:#0F172A;"></video>`;
        } else {
            previewBox.innerHTML = `<img src="${url}" class="w-100 rounded-3" style="max-height:220px; object-fit:cover;" alt="Story Preview">`;
        }
    }

    form?.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!currentUserId) {
            alert("Please log in to share stories!");
            window.location.href = "../logins/login.html";
            return;
        }

        if (!commSelectedStoryFile) {
            alert("Please select a photo or video to share.");
            return;
        }

        const caption = document.getElementById("story-caption-input")?.value.trim() || "";
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Uploading...`;
        progressContainer?.classList.remove("d-none");

        try {
            const cloudData = await uploadToCloudinaryDetailed(commSelectedStoryFile, (pct) => {
                if (progressBar) progressBar.style.width = `${pct}%`;
            });

            let authorName = "Volunteer";
            let authorPic = "";
            const cached = localStorage.getItem("urvi_user_data");
            if (cached) {
                try {
                    const u = JSON.parse(cached);
                    authorName = `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.name || currentUserId;
                    authorPic = u.profilePic || "";
                } catch { /* ignore */ }
            }

            const isVid = commSelectedStoryFile.type.startsWith("video/") || cloudData.resource_type === "video";
            const now = Date.now();

            const newStoryRef = push(ref(db, "stories"));
            await set(newStoryRef, {
                userId: currentUserId,
                username: authorName,
                userAvatar: authorPic,
                mediaUrl: cloudData.secure_url,
                mediaType: isVid ? "video" : "image",
                caption: caption,
                createdAt: now,
                expiresAt: now + (24 * 60 * 60 * 1000)
            });

            form.reset();
            commSelectedStoryFile = null;
            previewBox?.classList.add("d-none");
            progressContainer?.classList.add("d-none");
            if (progressBar) progressBar.style.width = "0%";
            if (commUploadStoryModalInstance) commUploadStoryModalInstance.hide();

            alert("🎉 Your 24-hour Story has been shared!");
        } catch (err) {
            console.error("Story upload error:", err);
            alert("Failed to post story: " + err.message);
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = `<i class="bi bi-send-fill me-1"></i> Share to Story`;
        }
    });
}

function renderCommStoriesTray(rawStories) {
    const tray = document.getElementById("stories-tray");
    if (!tray) return;

    const now = Date.now();
    const seenIds = getCommSeenStoryIds();

    const activeStories = Object.entries(rawStories)
        .map(([id, data]) => ({ id, ...data }))
        .filter(s => s.expiresAt && s.expiresAt > now);

    commStoriesByUser = {};
    activeStories.forEach(s => {
        const uid = s.userId || "anonymous";
        if (!commStoriesByUser[uid]) commStoriesByUser[uid] = [];
        commStoriesByUser[uid].push(s);
    });

    Object.keys(commStoriesByUser).forEach(uid => {
        commStoriesByUser[uid].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    });

    const otherUsers = Object.keys(commStoriesByUser).filter(uid => uid !== currentUserId);
    otherUsers.sort((a, b) => {
        const aHasUnseen = commStoriesByUser[a].some(s => !seenIds.includes(s.id));
        const bHasUnseen = commStoriesByUser[b].some(s => !seenIds.includes(s.id));
        if (aHasUnseen && !bHasUnseen) return -1;
        if (!aHasUnseen && bHasUnseen) return 1;
        return (commStoriesByUser[b][0]?.createdAt || 0) - (commStoriesByUser[a][0]?.createdAt || 0);
    });

    commStoryUserKeys = [];
    if (currentUserId && commStoriesByUser[currentUserId]) {
        commStoryUserKeys.push(currentUserId);
    }
    commStoryUserKeys = commStoryUserKeys.concat(otherUsers);

    let html = "";

    let myAvatar = null;
    let myName = "You";
    if (currentUserId) {
        const cached = localStorage.getItem("urvi_user_data");
        if (cached) {
            try {
                const u = JSON.parse(cached);
                if (u.profilePic && u.profilePic.length > 5 && u.profilePic !== "default" && !u.profilePic.includes("logo.png")) {
                    myAvatar = u.profilePic;
                }
                myName = `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.name || u.user_id || currentUserId;
            } catch { /* ignore */ }
        }
    }

    const myInitial = (myName.charAt(0) || "U").toUpperCase();
    const myStories = currentUserId ? (commStoriesByUser[currentUserId] || []) : [];
    const hasMyStories = myStories.length > 0;
    const myRingClass = hasMyStories ? "story-ring" : "story-ring seen";

    const myAvatarHTML = myAvatar
        ? `<img src="${myAvatar}" class="story-avatar-img" alt="Your Story">`
        : (currentUserId
            ? `<div class="story-avatar-img story-avatar-initial">${myInitial}</div>`
            : `<div class="story-avatar-img story-avatar-initial" style="background:#E2E8F0;color:#64748B;"><i class="bi bi-person-fill" style="font-size:22px;"></i></div>`
        );

    html += `
        <div class="story-item" id="comm-story-item-self">
            <div class="${myRingClass}">
                ${myAvatarHTML}
                <div class="story-add-badge"><i class="bi bi-plus-lg"></i></div>
            </div>
            <span class="story-username">Your Story</span>
        </div>
    `;

    otherUsers.forEach(uid => {
        const uStories = commStoriesByUser[uid];
        const latestStory = uStories[uStories.length - 1];
        const allSeen = uStories.every(s => seenIds.includes(s.id));
        const ringClass = allSeen ? "story-ring seen" : "story-ring";
        const hasPic = latestStory.userAvatar && latestStory.userAvatar.length > 5 && latestStory.userAvatar !== "default" && !latestStory.userAvatar.includes("logo.png");
        const name = latestStory.username || uid;
        const initial = (name.charAt(0) || "U").toUpperCase();

        const userAvatarHTML = hasPic
            ? `<img src="${latestStory.userAvatar}" class="story-avatar-img" alt="${name}">`
            : `<div class="story-avatar-img story-avatar-initial" style="background:linear-gradient(135deg,#10B981 0%,#047857 100%);color:#fff;">${initial}</div>`;

        html += `
            <div class="story-item comm-story-user-bubble" data-uid="${uid}">
                <div class="${ringClass}">
                    ${userAvatarHTML}
                </div>
                <span class="story-username">${name}</span>
            </div>
        `;
    });

    tray.innerHTML = html;

    document.getElementById("comm-story-item-self")?.addEventListener("click", () => {
        if (!currentUserId) {
            alert("Please log in to add stories or community posts!");
            window.location.href = "../logins/login.html";
            return;
        }
        // If user has stories, directly open their story in the viewer
        // Inside the viewer, they immediately see "New Story" and "Delete" options
        if (hasMyStories) {
            openCommStoryViewer(currentUserId);
            return;
        }
        if (commChoiceModalInstance) commChoiceModalInstance.show();
    });

    tray.querySelectorAll(".comm-story-user-bubble").forEach(bubble => {
        bubble.addEventListener("click", () => {
            const uid = bubble.dataset.uid;
            openCommStoryViewer(uid);
        });
    });
}

const commSessionViewedStories = new Set();
let isCommStoryPaused = false;
let commStoryRemainingTime = 5000;

function pauseCommStoryTimer() {
    if (isCommStoryPaused) return;
    isCommStoryPaused = true;
    clearTimeout(commStoryStepTimer);
    cancelAnimationFrame(commStoryAnimationReq);
    const mediaContainer = document.getElementById("storyViewerMediaContainer");
    const vid = mediaContainer?.querySelector("video");
    if (vid) vid.pause();
    const elapsed = performance.now() - commStoryProgressStart;
    commStoryRemainingTime = Math.max(500, commStoryCurrentDuration - elapsed);
}

function resumeCommStoryTimer() {
    if (!isCommStoryPaused) return;
    isCommStoryPaused = false;
    const mediaContainer = document.getElementById("storyViewerMediaContainer");
    const vid = mediaContainer?.querySelector("video");
    if (vid) {
        vid.play().catch(() => {});
    }
    const currentFill = document.getElementById(`comm-story-progress-fill-${commCurrentStoryItemIdx}`);
    commStoryProgressStart = performance.now() - (commStoryCurrentDuration - commStoryRemainingTime);
    runCommStoryProgressAnimation(currentFill, commStoryCurrentDuration);
    commStoryStepTimer = setTimeout(() => {
        advanceCommStory(1);
    }, commStoryRemainingTime);
}

function openCommStoryViewer(userId) {
    const overlay = document.getElementById("storyViewerOverlay");
    if (!overlay) return;

    const userIdx = commStoryUserKeys.indexOf(userId);
    if (userIdx === -1) return;

    commCurrentStoryUserIdx = userIdx;
    commCurrentStoryItemIdx = 0;

    overlay.classList.remove("d-none");
    document.body.style.overflow = "hidden";

    showCommStoryItem();
}

function closeCommStoryViewer() {
    const overlay = document.getElementById("storyViewerOverlay");
    if (overlay) overlay.classList.add("d-none");
    document.body.style.overflow = "";

    clearTimeout(commStoryStepTimer);
    cancelAnimationFrame(commStoryAnimationReq);
    isCommStoryPaused = false;

    document.getElementById("storyViewersSheet")?.classList.add("d-none");

    const mediaContainer = document.getElementById("storyViewerMediaContainer");
    if (mediaContainer) {
        const vid = mediaContainer.querySelector("video");
        if (vid) vid.pause();
        mediaContainer.innerHTML = "";
    }
}

function showCommStoryItem() {
    clearTimeout(commStoryStepTimer);
    cancelAnimationFrame(commStoryAnimationReq);
    isCommStoryPaused = false;

    document.getElementById("storyViewersSheet")?.classList.add("d-none");

    const currentUid = commStoryUserKeys[commCurrentStoryUserIdx];
    const userStories = commStoriesByUser[currentUid] || [];

    if (commCurrentStoryItemIdx >= userStories.length) {
        if (commCurrentStoryUserIdx + 1 < commStoryUserKeys.length) {
            commCurrentStoryUserIdx++;
            commCurrentStoryItemIdx = 0;
            showCommStoryItem();
            return;
        } else {
            closeCommStoryViewer();
            return;
        }
    }

    if (commCurrentStoryItemIdx < 0) {
        if (commCurrentStoryUserIdx > 0) {
            commCurrentStoryUserIdx--;
            const prevUserStories = commStoriesByUser[commStoryUserKeys[commCurrentStoryUserIdx]] || [];
            commCurrentStoryItemIdx = Math.max(0, prevUserStories.length - 1);
            showCommStoryItem();
            return;
        } else {
            commCurrentStoryItemIdx = 0;
        }
    }

    const story = userStories[commCurrentStoryItemIdx];
    if (!story) {
        closeCommStoryViewer();
        return;
    }

    markCommStoryAsSeen(story.id);

    // ── Free Tier Optimized View Tracking ──
    if (currentUserId && currentUserId !== story.userId) {
        if (!commSessionViewedStories.has(story.id)) {
            commSessionViewedStories.add(story.id);
            let vName = "URVI Member";
            let vAvatar = "";
            try {
                const udata = JSON.parse(localStorage.getItem("urvi_user_data") || "{}");
                vName = `${udata.firstName || ""} ${udata.lastName || ""}`.trim() || udata.name || currentUserId;
                vAvatar = udata.profilePic || "";
            } catch { /* ignore */ }
            try {
                update(ref(db, `stories/${story.id}/views/${currentUserId}`), {
                    name: vName,
                    avatar: vAvatar,
                    time: Date.now()
                });
                if (!story.views) story.views = {};
                story.views[currentUserId] = { name: vName, avatar: vAvatar, time: Date.now() };
            } catch (e) {
                console.warn("Story view track error:", e);
            }
        }
    }

    const isOwner = currentUserId && (story.userId === currentUserId);

    // 1. Owner Buttons in Header (New Story & Delete)
    const btnNew = document.getElementById("btn-story-new");
    const btnDelete = document.getElementById("btn-story-delete");
    if (btnNew) btnNew.classList.toggle("d-none", !isOwner);
    if (btnDelete) btnDelete.classList.toggle("d-none", !isOwner);

    // 2. Views Count (STRICTLY PRIVATE: Only the story owner can see view count and viewers!)
    const viewersContainer = document.getElementById("storyViewersContainer");
    const viewsObj = story.views || {};
    const viewsCount = Object.keys(viewsObj).length;
    const viewsCountEl = document.getElementById("story-viewers-count");
    const btnViewers = document.getElementById("btn-story-viewers");

    if (viewersContainer) {
        // Hidden completely for other users so views stay 100% private
        viewersContainer.classList.toggle("d-none", !isOwner);
    }
    if (viewsCountEl && isOwner) {
        viewsCountEl.innerText = `${viewsCount} Viewers`;
    }
    if (btnViewers && isOwner) {
        btnViewers.title = "See who viewed this story";
        btnViewers.classList.add("clickable");
    }

    // 3. Likes State (STRICTLY FOR COMMUNITY MEMBERS: Hidden on your own story!)
    const likesContainer = document.getElementById("storyLikesContainer");
    if (likesContainer) {
        // When viewing your own story, the like button is completely HIDDEN (Zero option of self-liking!)
        likesContainer.classList.toggle("d-none", isOwner);
    }

    if (!isOwner) {
        const likesObj = story.likes || {};
        const likesCount = Object.keys(likesObj).length;
        const isLiked = currentUserId && !!likesObj[currentUserId];
        const likesCountEl = document.getElementById("story-likes-count");
        const likeIcon = document.getElementById("story-like-icon");
        const btnLike = document.getElementById("btn-story-like");

        if (likesCountEl) likesCountEl.innerText = likesCount;

        if (btnLike) {
            btnLike.classList.add("story-like-btn");
            btnLike.classList.remove("story-likes-display");
            btnLike.style.cursor = "pointer";
            btnLike.title = isLiked ? "Unlike story" : "Like story";
            btnLike.classList.toggle("liked", isLiked);
            if (likeIcon) {
                likeIcon.className = isLiked ? "bi bi-heart-fill text-danger me-1" : "bi bi-heart me-1";
            }
        }
    }

    const avatarEl = document.getElementById("storyViewerAvatar");
    const usernameEl = document.getElementById("storyViewerUsername");
    const timeEl = document.getElementById("storyViewerTime");
    const captionEl = document.getElementById("storyViewerCaption");

    const authorDisplayName = story.username || story.userId || "User";
    const hasPic = story.userAvatar && story.userAvatar.length > 5 && story.userAvatar !== "default" && !story.userAvatar.includes("logo.png");
    const fallbackPic = `https://ui-avatars.com/api/?name=${encodeURIComponent(authorDisplayName)}&background=22C55E&color=fff&size=100&bold=true`;

    if (avatarEl) avatarEl.src = hasPic ? story.userAvatar : fallbackPic;
    if (usernameEl) usernameEl.innerText = authorDisplayName;
    if (captionEl) captionEl.innerText = story.caption || "";

    if (timeEl && story.createdAt) {
        const elapsedHrs = Math.floor((Date.now() - story.createdAt) / (1000 * 60 * 60));
        timeEl.innerText = elapsedHrs > 0 ? `${elapsedHrs}h ago` : "Just now";
    }

    const progressContainer = document.getElementById("storyProgressSegments");
    if (progressContainer) {
        progressContainer.innerHTML = userStories.map((_, idx) => `
            <div class="story-progress-bar-bg">
                <div class="story-progress-bar-fill" id="comm-story-progress-fill-${idx}" style="width: ${idx < commCurrentStoryItemIdx ? '100%' : '0%'};"></div>
            </div>
        `).join("");
    }

    const mediaContainer = document.getElementById("storyViewerMediaContainer");
    if (!mediaContainer) return;
    mediaContainer.innerHTML = "";

    const currentFill = document.getElementById(`comm-story-progress-fill-${commCurrentStoryItemIdx}`);
    const isVid = isVideoUrl(story.mediaUrl) || story.mediaType === "video";

    if (isVid) {
        const video = document.createElement("video");
        video.src = story.mediaUrl;
        video.autoplay = true;
        video.playsInline = true;
        video.className = "story-viewer-media";

        video.onloadedmetadata = function () {
            commStoryCurrentDuration = Math.min(30, video.duration || 10) * 1000;
            commStoryProgressStart = performance.now();
            runCommStoryProgressAnimation(currentFill, commStoryCurrentDuration);
        };

        video.onended = function () {
            advanceCommStory(1);
        };

        video.onerror = function () {
            advanceCommStory(1);
        };

        mediaContainer.appendChild(video);
    } else {
        const img = document.createElement("img");
        img.src = story.mediaUrl;
        img.className = "story-viewer-media";
        mediaContainer.appendChild(img);

        commStoryCurrentDuration = 5000;
        commStoryProgressStart = performance.now();
        runCommStoryProgressAnimation(currentFill, commStoryCurrentDuration);

        commStoryStepTimer = setTimeout(() => {
            advanceCommStory(1);
        }, commStoryCurrentDuration);
    }
}

function runCommStoryProgressAnimation(fillEl, duration) {
    if (!fillEl) return;
    const start = performance.now();

    function step(now) {
        if (isCommStoryPaused) return;
        const elapsed = now - start;
        const pct = Math.min(100, (elapsed / duration) * 100);
        fillEl.style.width = `${pct}%`;

        if (elapsed < duration) {
            commStoryAnimationReq = requestAnimationFrame(step);
        }
    }

    commStoryAnimationReq = requestAnimationFrame(step);
}

function advanceCommStory(direction) {
    clearTimeout(commStoryStepTimer);
    cancelAnimationFrame(commStoryAnimationReq);

    commCurrentStoryItemIdx += direction;
    showCommStoryItem();
}

function setupCommStoryViewerEvents() {
    document.getElementById("btn-close-story-viewer")?.addEventListener("click", closeCommStoryViewer);

    document.getElementById("storyTapLeft")?.addEventListener("click", (e) => {
        e.stopPropagation();
        advanceCommStory(-1);
    });

    document.getElementById("storyTapRight")?.addEventListener("click", (e) => {
        e.stopPropagation();
        advanceCommStory(1);
    });

    // Story Like Button Toggle
    document.getElementById("btn-story-like")?.addEventListener("click", async (e) => {
        e.stopPropagation();
        const currentUid = commStoryUserKeys[commCurrentStoryUserIdx];
        const userStories = commStoriesByUser[currentUid] || [];
        const currentStory = userStories[commCurrentStoryItemIdx];
        if (!currentStory) return;

        // You cannot like your own story!
        if (currentUserId && currentStory.userId === currentUserId) {
            return;
        }

        if (!currentUserId) {
            alert("Please log in to like stories!");
            window.location.href = "../logins/login.html";
            return;
        }

        if (!currentStory.likes) currentStory.likes = {};
        const wasLiked = !!currentStory.likes[currentUserId];

        try {
            if (wasLiked) {
                delete currentStory.likes[currentUserId];
                await remove(ref(db, `stories/${currentStory.id}/likes/${currentUserId}`));
            } else {
                currentStory.likes[currentUserId] = true;
                await set(ref(db, `stories/${currentStory.id}/likes/${currentUserId}`), true);
            }

            const count = Object.keys(currentStory.likes).length;
            const countEl = document.getElementById("story-likes-count");
            const icon = document.getElementById("story-like-icon");
            const btn = document.getElementById("btn-story-like");
            if (countEl) countEl.innerText = count;
            if (icon) icon.className = !wasLiked ? "bi bi-heart-fill text-danger me-1" : "bi bi-heart me-1";
            if (btn) btn.classList.toggle("liked", !wasLiked);
        } catch (err) {
            console.warn("Like story error:", err);
        }
    });

    // Story Owner "New Story" action
    document.getElementById("btn-story-new")?.addEventListener("click", (e) => {
        e.stopPropagation();
        closeCommStoryViewer();
        if (!currentUserId) {
            alert("Please log in to keep stories on URVI!");
            window.location.href = "../logins/login.html";
            return;
        }
        if (commUploadStoryModalInstance) commUploadStoryModalInstance.show();
    });

    // Story Owner "Delete" action
    document.getElementById("btn-story-delete")?.addEventListener("click", async (e) => {
        e.stopPropagation();
        const currentUid = commStoryUserKeys[commCurrentStoryUserIdx];
        const userStories = commStoriesByUser[currentUid] || [];
        const currentStory = userStories[commCurrentStoryItemIdx];
        if (!currentStory) return;

        pauseCommStoryTimer();
        const ok = confirm("Are you sure you want to delete this story?");
        if (!ok) {
            resumeCommStoryTimer();
            return;
        }

        try {
            await remove(ref(db, `stories/${currentStory.id}`));
            userStories.splice(commCurrentStoryItemIdx, 1);
            if (userStories.length === 0) {
                closeCommStoryViewer();
            } else {
                if (commCurrentStoryItemIdx >= userStories.length) {
                    commCurrentStoryItemIdx = userStories.length - 1;
                }
                showCommStoryItem();
            }
            alert("Story deleted 🌿");
        } catch (err) {
            alert("Failed to delete story: " + err.message);
            resumeCommStoryTimer();
        }
    });

    // Viewers Sheet click handler
    document.getElementById("btn-story-viewers")?.addEventListener("click", (e) => {
        e.stopPropagation();
        const currentUid = commStoryUserKeys[commCurrentStoryUserIdx];
        const userStories = commStoriesByUser[currentUid] || [];
        const currentStory = userStories[commCurrentStoryItemIdx];
        if (!currentStory) return;

        if (currentStory.userId !== currentUserId) {
            return; // Non-owners only see view count number
        }

        pauseCommStoryTimer();
        const sheet = document.getElementById("storyViewersSheet");
        const list = document.getElementById("storyViewersList");
        const badge = document.getElementById("storyViewersCountBadge");
        if (!sheet || !list) return;

        const views = currentStory.views || {};
        const likes = currentStory.likes || {};
        const totalLikes = Object.keys(likes).length;
        const viewerEntries = Object.entries(views);
        if (badge) {
            badge.innerHTML = `${viewerEntries.length} <span class="ms-2 text-danger"><i class="bi bi-heart-fill me-1"></i>${totalLikes}</span>`;
        }

        if (viewerEntries.length === 0) {
            list.innerHTML = `<div class="text-center text-white-50 p-4 small">No views yet. Your story was shared recently 🌿</div>`;
        } else {
            viewerEntries.sort((a, b) => (b[1].time || 0) - (a[1].time || 0));
            list.innerHTML = viewerEntries.map(([uid, v]) => {
                let relTime = "Recently";
                if (v.time) {
                    const diffMin = Math.floor((Date.now() - v.time) / 60000);
                    if (diffMin < 1) relTime = "Just now";
                    else if (diffMin < 60) relTime = `${diffMin}m ago`;
                    else relTime = `${Math.floor(diffMin / 60)}h ago`;
                }
                const hasLiked = !!likes[uid];
                const vName = v.name || uid || 'URVI Member';
                const vHasPic = v.avatar && v.avatar.length > 5 && v.avatar !== "default" && !v.avatar.includes("logo.png");
                const vPic = vHasPic ? v.avatar : `https://ui-avatars.com/api/?name=${encodeURIComponent(vName)}&background=22C55E&color=fff&size=100&bold=true`;
                return `
                    <div class="story-viewer-user-row">
                        <div class="d-flex align-items-center gap-2">
                            <img src="${vPic}" class="rounded-circle" style="width:34px;height:34px;object-fit:cover;">
                            <div class="text-white small fw-semibold">${vName}</div>
                            ${hasLiked ? '<span class="badge bg-danger-subtle text-danger ms-1" style="font-size:10px;"><i class="bi bi-heart-fill me-1"></i>Liked</span>' : ''}
                        </div>
                        <small class="text-white-50" style="font-size:11px;">${relTime}</small>
                    </div>
                `;
            }).join("");
        }

        sheet.classList.remove("d-none");
    });

    // Close Viewers sheet
    document.getElementById("btn-close-story-viewers-sheet")?.addEventListener("click", (e) => {
        e.stopPropagation();
        const sheet = document.getElementById("storyViewersSheet");
        if (sheet) sheet.classList.add("d-none");
        resumeCommStoryTimer();
    });

    window.addEventListener("keydown", (e) => {
        const overlay = document.getElementById("storyViewerOverlay");
        if (!overlay || overlay.classList.contains("d-none")) return;
        if (e.key === "Escape") closeCommStoryViewer();
        if (e.key === "ArrowLeft") advanceCommStory(-1);
        if (e.key === "ArrowRight") advanceCommStory(1);
    });
}
