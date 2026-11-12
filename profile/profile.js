import { db, ref, get, child, set } from "../config.js";
import { uploadToCloudinary, cropToSquare, isVideoUrl } from "../cloudinary.js";
import { getLevelFromXP, extractTreeXP } from "./my-virtual-tree.js";
import {
    update,
    push,
    remove,
    onValue
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

/* =====================================================
   URVI – profile.js  |  My Profile Page Logic & Modals
   ===================================================== */

const rawUserId = localStorage.getItem("urvi_logged_user");
const loggedInUserId =
    rawUserId && rawUserId !== "undefined" && rawUserId !== "null"
        ? rawUserId.trim()
        : null;

// Redirect if viewing another user's profile
const urlParams = new URLSearchParams(window.location.search);
const targetUidParam = urlParams.get("uid") || urlParams.get("id");
if (targetUidParam && loggedInUserId && targetUidParam.trim().toLowerCase() !== loggedInUserId.toLowerCase()) {
    window.location.replace(`user-profile.html?uid=${encodeURIComponent(targetUidParam.trim())}`);
}

let selectedProfileFile = null;

document.addEventListener("DOMContentLoaded", () => {
    loadUserData();
    setupEditModeHandlers();
    setupAccountDeletionHandlers();
    setupSettingsModalHandlers();
    setupDirectMenuButton();
});

// ── Profile Picture Direct Upload & Crop ──
document.getElementById("img-upload")?.addEventListener("change", async function () {
    const file = this.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
        alert("Please select a valid image file.");
        return;
    }

    const spinner = document.getElementById("profile-pic-spinner");
    const profileImg = document.getElementById("db-profilePic");

    try {
        if (spinner) spinner.classList.remove("d-none");

        let uploadBlob = file;
        try {
            uploadBlob = await cropToSquare(file, 300);
        } catch (e) {
            console.warn("Crop fallback to original:", e);
        }

        // Instant local preview
        if (profileImg) profileImg.src = URL.createObjectURL(uploadBlob);

        // Upload to Cloudinary immediately
        const profilePicUrl = await uploadToCloudinary(uploadBlob);

        if (profilePicUrl && loggedInUserId) {
            await update(ref(db, `users/${loggedInUserId}`), {
                profilePic: profilePicUrl,
                updatedAt: Date.now()
            });

            // Update local storage cache
            const cachedUserData = localStorage.getItem("urvi_user_data");
            if (cachedUserData) {
                try {
                    const cached = JSON.parse(cachedUserData);
                    cached.profilePic = profilePicUrl;
                    localStorage.setItem("urvi_user_data", JSON.stringify(cached));
                } catch (e) { /* ignore */ }
            }

            if (profileImg) profileImg.src = profilePicUrl;
            alert("Profile picture updated successfully! 🌿");
        }
    } catch (e) {
        console.error("Profile picture upload failed:", e);
        alert("Failed to upload profile picture: " + e.message);
    } finally {
        if (spinner) spinner.classList.add("d-none");
    }
});

// ── Load User Profile Data ──
async function loadUserData() {
    if (!loggedInUserId) {
        alert("Please log in first.");
        window.location.href = "../logins/login.html";
        return;
    }

    // Instant render from local storage cache if available AND belongs to logged-in user
    const cachedUserData = localStorage.getItem("urvi_user_data");
    if (cachedUserData) {
        try {
            const cachedUser = JSON.parse(cachedUserData);
            const matchesCurrent = !loggedInUserId || !cachedUser.user_id ||
                cachedUser.user_id.toLowerCase() === loggedInUserId.toLowerCase() ||
                (cachedUser.auth_uid && cachedUser.auth_uid === loggedInUserId) ||
                (cachedUser.email && cachedUser.email.toLowerCase() === loggedInUserId.toLowerCase()) ||
                loggedInUserId.toLowerCase() === "urvi.earth";

            if (matchesCurrent) {
                populateProfileFields(cachedUser);
                checkDeletionStatus(cachedUser);
            } else {
                localStorage.removeItem("urvi_user_data");
            }
        } catch (e) { /* ignore */ }
    }

    try {
        let snapshot = await get(child(ref(db), `users/${loggedInUserId}`));
        let user = snapshot.exists() ? snapshot.val() : null;

        // Fallback: search users tree if loggedInUserId is auth_uid or handle variant
        if (!user) {
            const allUsersSnap = await get(child(ref(db), "users"));
            if (allUsersSnap.exists()) {
                const allU = allUsersSnap.val();
                const matchedKey = Object.keys(allU).find(k => {
                    const u = allU[k];
                    return k.toLowerCase() === loggedInUserId.toLowerCase() ||
                           (u.user_id && u.user_id.toLowerCase() === loggedInUserId.toLowerCase()) ||
                           (u.auth_uid && u.auth_uid === loggedInUserId) ||
                           (u.email && u.email.toLowerCase() === loggedInUserId.toLowerCase());
                });
                if (matchedKey) {
                    user = allU[matchedKey];
                }
            }
        }

        if (user) {
            const isSelf = !loggedInUserId ||
                (user.user_id && user.user_id.toLowerCase() === loggedInUserId.toLowerCase()) ||
                (user.auth_uid && user.auth_uid === loggedInUserId) ||
                (user.email && user.email.toLowerCase() === loggedInUserId.toLowerCase()) ||
                loggedInUserId.toLowerCase() === "urvi.earth";

            if (isSelf) {
                localStorage.setItem("urvi_user_data", JSON.stringify(user));
            }
            populateProfileFields(user);
            loadFollowCounts(user.user_id || loggedInUserId);
            loadMyPosts(user.user_id || loggedInUserId);
            loadUserChallengesAndProofs(user.user_id || loggedInUserId);
            checkDeletionStatus(user);
        } else if (!cachedUserData) {
            console.warn("User profile record fallback active.");
        }
    } catch (err) {
        console.error("Profile load error:", err);
    }
}

function isAdminUser(user, uid = "", name = "") {
    const cleanUid = String(uid || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const cleanName = String(name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const userHandle = String(user ? (user.user_id || user.userId || "") : "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const role = String(user ? (user.role || user.userType || user.user_type || "") : "").toLowerCase();

    return cleanUid.includes("urviearth") ||
           userHandle.includes("urviearth") ||
           cleanName.includes("urviearth") ||
           role === "admin";
}

function populateProfileFields(user) {
    const isGoldAdmin = isAdminUser(user, rawUserId, `${user.firstName || ""} ${user.lastName || ""}`);
    const isBlueVerified = user.role === "verified" || user.isVerified === true;

    const badgeHTML = isGoldAdmin
        ? `<span class="verified-badge gold" title="URVI Official Admin"><i class="bi bi-patch-check-fill"></i></span>`
        : (isBlueVerified ? `<span class="verified-badge blue" title="Verified Eco Leader"><i class="bi bi-patch-check-fill"></i></span>` : "");

    const typeBadgeHTML = isGoldAdmin
        ? `<span class="admin-gold-badge-tag"><i class="bi bi-shield-lock-fill"></i> 👑 URVI Official Admin</span>`
        : (isBlueVerified ? `<span class="user-blue-badge-tag"><i class="bi bi-patch-check-fill"></i> ⚡ Verified Eco Leader</span>` : "🌿 " + (user.userType || "Eco Member"));

    if (document.getElementById("db-firstName")) document.getElementById("db-firstName").value = user.firstName || "";
    if (document.getElementById("db-lastName")) document.getElementById("db-lastName").value = user.lastName || "";
    if (document.getElementById("db-email")) document.getElementById("db-email").value = user.email || "";
    if (document.getElementById("db-mobile")) document.getElementById("db-mobile").value = user.mobile || "";
    if (document.getElementById("db-bio")) document.getElementById("db-bio").value = user.bio || "";
    if (document.getElementById("db-dob")) document.getElementById("db-dob").value = user.dob || "";
    if (document.getElementById("db-userType")) document.getElementById("db-userType").innerHTML = typeBadgeHTML;

    // Synchronize modal fields as well
    if (document.getElementById("modal-firstName")) document.getElementById("modal-firstName").value = user.firstName || "";
    if (document.getElementById("modal-lastName")) document.getElementById("modal-lastName").value = user.lastName || "";
    if (document.getElementById("modal-email")) document.getElementById("modal-email").value = user.email || "";
    if (document.getElementById("modal-mobile")) document.getElementById("modal-mobile").value = user.mobile || "";
    if (document.getElementById("modal-bio")) document.getElementById("modal-bio").value = user.bio || "";
    if (document.getElementById("modal-dob")) document.getElementById("modal-dob").value = user.dob || "";

    // Display bio in Profile Hero Card (Instagram style)
    const displayBio = document.getElementById("profile-display-bio");
    if (displayBio) {
        displayBio.textContent = user.bio || "";
        const bioWrap = document.getElementById("profile-bio-container");
        if (bioWrap) bioWrap.style.display = (user.bio && user.bio.trim().length > 0) ? "block" : "none";
    }

    const nameElem = document.getElementById("welcome-name");
    if (nameElem) {
        nameElem.innerHTML = `${user.firstName || ""} ${user.lastName || ""}`.trim() + " " + badgeHTML;
    }

    if (document.getElementById("db-createdAt")) {
        document.getElementById("db-createdAt").value = user.createdAt
            ? new Date(user.createdAt).toLocaleDateString("en-US", { year: 'numeric', month: 'short', day: 'numeric' })
            : "2026";
    }
    if (document.getElementById("db-user_id")) document.getElementById("db-user_id").textContent = `@${rawUserId || ""}`;

    const profilePicElem = document.getElementById("db-profilePic");
    if (profilePicElem && user.profilePic && user.profilePic !== "default" && user.profilePic.length > 5) {
        profilePicElem.src = user.profilePic;
    }

    if (document.getElementById("score-points")) document.getElementById("score-points").textContent = user.points || 0;
    if (document.getElementById("score-trees")) document.getElementById("score-trees").textContent = user.trees_planted || 0;
    if (document.getElementById("score-contributions")) document.getElementById("score-contributions").textContent = user.contributions || 0;
    if (document.getElementById("score-streak")) document.getElementById("score-streak").textContent = (user.highestStreak || user.currentStreak || 0);

    const treeXP = extractTreeXP(user);
    const treeLvl = getLevelFromXP(treeXP);
    const badgeContainer = document.getElementById("tree-level-badge-container");
    if (badgeContainer) {
        badgeContainer.innerHTML = `
            <a href="my-virtual-tree.html" class="tree-level-badge" title="View My Virtual Tree (${treeXP.toLocaleString()} XP)">
                <span class="tree-level-icon">${treeLvl.icon || '🌳'}</span>
                <span class="tree-level-tag">Lvl ${treeLvl.level}</span>
                <span class="tree-level-name">${treeLvl.name}</span>
                <span class="tree-level-xp ms-1 badge bg-success bg-opacity-10 text-success border border-success border-opacity-25 rounded-pill px-2 py-1" style="font-size:11px;">${treeXP.toLocaleString()} XP</span>
                <i class="bi bi-chevron-right tree-level-arrow"></i>
            </a>
        `;
    }

    // Configure Change Password Card (Only shown if account has a password / not Google signup)
    setupPasswordCard(user);
}

// ── Check if Account has Password & Configure Security Card ──
function setupPasswordCard(user) {
    const card = document.getElementById("change-password-card");
    if (!card) return;

    card.classList.remove("d-none");
    setupChangePasswordHandler(user);
}

// ── Change Password Handler (Checks old password if set) ──
let isPasswordHandlerBound = false;
function setupChangePasswordHandler(currentUser) {
    if (isPasswordHandlerBound) return;
    isPasswordHandlerBound = true;

    const updateBtn = document.getElementById("btn-update-password");
    const feedback = document.getElementById("pwd-feedback");
    const currentInput = document.getElementById("pwd-current");

    // If account has no password yet (e.g. Google auth), make current password optional
    const hasExistingPassword = Boolean(
        currentUser &&
        currentUser.password &&
        typeof currentUser.password === "string" &&
        currentUser.password.trim().length > 0 &&
        currentUser.password !== "google"
    );

    if (!hasExistingPassword && currentInput) {
        currentInput.placeholder = "None set (Optional)";
        currentInput.required = false;
    }

    function showPwdFeedback(msg, type = "danger") {
        if (!feedback) return;
        feedback.className = `small mt-3 p-2 rounded-3 alert alert-${type}`;
        feedback.innerHTML = msg;
        feedback.classList.remove("d-none");
    }

    updateBtn?.addEventListener("click", async () => {
        const currentInput = document.getElementById("pwd-current");
        const newInput = document.getElementById("pwd-new");
        const confirmInput = document.getElementById("pwd-confirm");

        const currentVal = currentInput ? currentInput.value.trim() : "";
        const newVal = newInput ? newInput.value.trim() : "";
        const confirmVal = confirmInput ? confirmInput.value.trim() : "";

        // Fetch fresh user record from Firebase to guarantee up-to-date verification
        let currentRecord = currentUser;
        try {
            const snap = await get(child(ref(db), `users/${loggedInUserId}`));
            if (snap.exists()) {
                currentRecord = snap.val();
            } else if (currentUser && currentUser.user_id) {
                const snap2 = await get(child(ref(db), `users/${currentUser.user_id}`));
                if (snap2.exists()) currentRecord = snap2.val();
            }
        } catch (e) { /* fallback */ }

        const dbHasPassword = Boolean(
            currentRecord &&
            currentRecord.password &&
            typeof currentRecord.password === "string" &&
            currentRecord.password.trim().length > 0 &&
            currentRecord.password !== "google"
        );

        if (dbHasPassword) {
            if (!currentVal) {
                showPwdFeedback("⚠️ Please enter your current password.", "warning");
                return;
            }
            if (currentRecord.password !== currentVal) {
                showPwdFeedback("❌ Current password is incorrect. Please try again.", "danger");
                return;
            }
        }

        if (!newVal || !confirmVal) {
            showPwdFeedback("⚠️ Please enter and confirm your new password.", "warning");
            return;
        }

        if (newVal.length < 6) {
            showPwdFeedback("⚠️ New password must be at least 6 characters.", "warning");
            return;
        }

        if (newVal !== confirmVal) {
            showPwdFeedback("❌ New password and confirmation do not match.", "danger");
            return;
        }

        if (dbHasPassword && newVal === currentVal) {
            showPwdFeedback("⚠️ New password cannot be the same as your current password.", "warning");
            return;
        }

        updateBtn.disabled = true;
        updateBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Updating...`;

        try {
            const targetPath = (currentRecord && currentRecord.user_id) ? currentRecord.user_id : loggedInUserId;

            // Update in Firebase RTDB
            await update(ref(db, `users/${targetPath}`), {
                password: newVal,
                updatedAt: Date.now()
            });

            // Also update loggedInUserId path if different
            if (loggedInUserId !== targetPath) {
                try {
                    await update(ref(db, `users/${loggedInUserId}`), {
                        password: newVal,
                        updatedAt: Date.now()
                    });
                } catch (e) { /* ignore */ }
            }

            // Update local storage user data
            const cachedUserData = localStorage.getItem("urvi_user_data");
            if (cachedUserData) {
                try {
                    const cached = JSON.parse(cachedUserData);
                    cached.password = newVal;
                    localStorage.setItem("urvi_user_data", JSON.stringify(cached));
                } catch (e) { /* ignore */ }
            }

            if (currentRecord) currentRecord.password = newVal;

            // Clear inputs
            if (currentInput) currentInput.value = "";
            if (newInput) newInput.value = "";
            if (confirmInput) confirmInput.value = "";

            showPwdFeedback("✅ Password updated successfully! 🔒🌿", "success");
            setTimeout(() => {
                feedback?.classList.add("d-none");
            }, 4500);

        } catch (err) {
            console.error("Change password error:", err);
            showPwdFeedback("Failed to update password: " + err.message, "danger");
        } finally {
            updateBtn.disabled = false;
            updateBtn.innerHTML = `<i class="bi bi-key-fill me-1"></i> Update Password`;
        }
    });
}

// ── Password Visibility Toggle Helper ──
window.togglePasswordVisibility = function (inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const isPass = input.type === "password";
    input.type = isPass ? "text" : "password";
    const icon = btn ? btn.querySelector("i") : null;
    if (icon) {
        icon.className = isPass ? "bi bi-eye-slash" : "bi bi-eye";
    }
};

// ── Check 30-Day Deletion Grace Period Status ──
function checkDeletionStatus(user) {
    const banner = document.getElementById("deletion-warning-banner");
    const dateSpan = document.getElementById("deletion-scheduled-date");
    if (!banner) return;

    if (user.status === "pending_deletion") {
        const scheduledMs = user.scheduledDeletionAt || (Date.now() + (30 * 24 * 60 * 60 * 1000));
        dateSpan.innerText = new Date(scheduledMs).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
        banner.classList.remove("d-none");
    } else {
        banner.classList.add("d-none");
    }
}

// ── Account Deletion Request & Cancellation Handlers ──
function setupAccountDeletionHandlers() {
    const requestBtn = document.getElementById("btn-request-account-deletion");
    const cancelBtn = document.getElementById("btn-cancel-deletion");

    requestBtn?.addEventListener("click", async () => {
        const confirmed = confirm(
            "⚠️ REQUEST ACCOUNT DELETION\n\n" +
            "Your account will be placed into a 30-Day Grace Period.\n" +
            "You may cancel this request at any time during the 30 days.\n\n" +
            "After 30 days, Master Administration will permanently delete your profile, posts, comments, media, and records.\n\n" +
            "Do you wish to proceed with scheduling deletion?"
        );

        if (!confirmed) return;

        try {
            const now = Date.now();
            const scheduledAt = now + (30 * 24 * 60 * 60 * 1000);

            await update(ref(db, `users/${loggedInUserId}`), {
                status: "pending_deletion",
                deletionRequestedAt: now,
                scheduledDeletionAt: scheduledAt
            });

            alert("Account deletion requested. Your profile is now in a 30-day grace period.");
            loadUserData();
        } catch (err) {
            console.error("Request deletion error:", err);
            alert("Failed to request deletion: " + err.message);
        }
    });

    cancelBtn?.addEventListener("click", async () => {
        try {
            await update(ref(db, `users/${loggedInUserId}`), {
                status: "active",
                deletionRequestedAt: null,
                scheduledDeletionAt: null
            });

            alert("Account deletion cancelled. Your profile has been restored to active status!");
            loadUserData();
        } catch (err) {
            console.error("Cancel deletion error:", err);
            alert("Failed to restore account: " + err.message);
        }
    });
}

// ── Edit Profile Handlers (File Upload & Logout) ──
function setupEditModeHandlers() {
    document.getElementById("logout-btn")?.addEventListener("click", () => {
        localStorage.removeItem("urvi_logged_user");
        localStorage.removeItem("urvi_user_data");
        window.location.href = "../logins/login.html";
    });
}

// ── Followers & Posts Helpers ──
async function loadFollowCounts(targetId) {
    const idToCheck = targetId || loggedInUserId;
    if (!idToCheck) return;

    try {
        let ferSnap = await get(child(ref(db), `community/followers/${idToCheck}`));
        if (!ferSnap.exists() && idToCheck !== idToCheck.toLowerCase()) {
            ferSnap = await get(child(ref(db), `community/followers/${idToCheck.toLowerCase()}`));
        }

        let fingSnap = await get(child(ref(db), `community/following/${idToCheck}`));
        if (!fingSnap.exists() && idToCheck !== idToCheck.toLowerCase()) {
            fingSnap = await get(child(ref(db), `community/following/${idToCheck.toLowerCase()}`));
        }

        const fCount = ferSnap.exists() ? Object.keys(ferSnap.val()).length : 0;
        const ingCount = fingSnap.exists() ? Object.keys(fingSnap.val()).length : 0;

        const ferEl = document.getElementById("stat-followers");
        const ingEl = document.getElementById("stat-following");
        
        if (ferEl) {
            ferEl.querySelector("strong").innerText = fCount;
            ferEl.onclick = () => showFollowList("Followers", idToCheck, "followers");
        }
        if (ingEl) {
            ingEl.querySelector("strong").innerText = ingCount;
            ingEl.onclick = () => showFollowList("Following", idToCheck, "following");
        }
    } catch (e) { 
        console.warn("Follow stats error:", e); 
    }
}

async function showFollowList(title, userId, type) {
    const modalEl = document.getElementById("followListModal");
    if (!modalEl) return;

    const modal = new bootstrap.Modal(modalEl);
    const titleEl = document.getElementById("followListTitle");
    const body = document.getElementById("followListBody");

    if (titleEl) titleEl.textContent = title;
    if (body) {
        body.innerHTML = `
            <div class="text-center p-4">
                <div class="spinner-border spinner-border-sm text-success" role="status"></div>
                <small class="d-block text-muted mt-2">Loading ${title.toLowerCase()}...</small>
            </div>
        `;
    }
    modal.show();

    try {
        let path = `community/${type}/${userId}`;
        let snap = await get(child(ref(db), path));
        if (!snap.exists() && userId !== userId.toLowerCase()) {
            snap = await get(child(ref(db), `community/${type}/${userId.toLowerCase()}`));
        }

        if (!snap.exists()) {
            body.innerHTML = `<p class="text-center text-muted p-4 my-2" style="font-size:13px;">No ${title.toLowerCase()} yet.</p>`;
            return;
        }

        const userIds = Object.keys(snap.val());
        let itemsHTML = "";

        for (const uid of userIds) {
            try {
                let uSnap = await get(child(ref(db), `users/${uid}`));
                if (!uSnap.exists() && uid !== uid.toLowerCase()) {
                    uSnap = await get(child(ref(db), `users/${uid.toLowerCase()}`));
                }

                if (uSnap.exists()) {
                    const u = uSnap.val();
                    const fullName = `${u.firstName || ""} ${u.lastName || ""}`.trim() || uid;
                    const initial = fullName.charAt(0).toUpperCase() || "U";
                    const pic = u.profilePic && u.profilePic !== "default" && u.profilePic.length > 5;
                    const avatarHTML = pic 
                        ? `<img src="${u.profilePic}" style="width:40px; height:40px; border-radius:50%; object-fit:cover;" alt="${fullName}">`
                        : `<div style="width:40px; height:40px; border-radius:50%; background:#15803D; color:#ffffff; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:16px;">${initial}</div>`;

                    itemsHTML += `
                        <div class="d-flex align-items-center justify-content-between p-2 mb-2 rounded-3 border bg-white shadow-sm" style="cursor:pointer;" onclick="window.location.href='user-profile.html?uid=${uid}'">
                            <div class="d-flex align-items-center gap-3" style="min-width:0; flex-grow:1;">
                                ${avatarHTML}
                                <div style="min-width:0;">
                                    <strong class="d-block text-dark text-truncate" style="font-size:13px;">${fullName}</strong>
                                    <small class="text-muted text-truncate d-block" style="font-size:11px;">@${uid}</small>
                                </div>
                            </div>
                            <span class="btn btn-sm btn-outline-success rounded-pill px-3 py-1 fw-bold flex-shrink-0" style="font-size:11px;">View Profile</span>
                        </div>
                    `;
                }
            } catch (err) { /* ignore single user fetch error */ }
        }

        body.innerHTML = itemsHTML || `<p class="text-center text-muted p-4 my-2" style="font-size:13px;">No ${title.toLowerCase()} found.</p>`;
    } catch (err) {
        console.error("Show follow list error:", err);
        body.innerHTML = `<p class="text-center text-muted p-4 my-2" style="font-size:13px;">Failed to load ${title.toLowerCase()}.</p>`;
    }
}

async function loadMyPosts(targetId) {
    const grid = document.getElementById("my-posts-grid");
    const countEl = document.getElementById("stat-posts-count");
    if (!grid) return;

    // Show circular URVI inline loader while fetching
    if (window.getUrviSpinnerHTML) {
        grid.innerHTML = window.getUrviSpinnerHTML({ text: "Loading posts...", size: "sm" });
    }

    const idToCheck = (targetId || loggedInUserId || "").toLowerCase();

    try {
        const pSnap = await get(child(ref(db), "community/posts"));
        if (!pSnap.exists()) {
            grid.innerHTML = `<p class="text-muted p-4 text-center w-100" style="grid-column: 1 / -1;">No posts shared yet 🌿</p>`;
            if (countEl) countEl.querySelector("strong").innerText = 0;
            return;
        }

        const postsData = pSnap.val();
        const myPosts = Object.keys(postsData)
            .map(k => ({ id: k, ...postsData[k] }))
            .filter(p => {
                const uid = String(p.userId || p.user_id || "").toLowerCase();
                return uid === idToCheck || uid === String(loggedInUserId).toLowerCase();
            });

        if (countEl) countEl.querySelector("strong").innerText = myPosts.length;
        const tabPostCount = document.getElementById("tab-posts-count");
        if (tabPostCount) tabPostCount.innerText = myPosts.length;

        if (myPosts.length === 0) {
            grid.innerHTML = `<p class="text-muted p-4 text-center w-100" style="grid-column: 1 / -1;">No posts shared yet 🌿</p>`;
            return;
        }

        grid.innerHTML = myPosts.map(p => {
            const isVid = p.videoUrl || (p.imageUrl && (p.imageUrl.match(/\.(mp4|webm|mov)(\?|$)/i) || p.imageUrl.includes('/video/upload/')));
            const mediaUrl = p.videoUrl || p.imageUrl;
            return `
                <div class="my-post-card" data-post-id="${p.id}" title="${(p.description || 'View post').replace(/"/g, '&quot;')}">
                    ${mediaUrl ? (
                        isVid
                            ? `<video src="${mediaUrl}" preload="metadata" muted playsinline></video>
                               <span class="post-type-badge"><i class="bi bi-play-fill"></i></span>`
                            : `<img src="${mediaUrl}" alt="Post" loading="lazy">`
                    ) : `
                        <div class="post-thumb-text">
                            <span>${(p.description || 'Eco update').slice(0, 65)}</span>
                        </div>
                    `}
                    <div class="post-thumb-overlay">
                        <i class="bi bi-eye-fill"></i>
                    </div>
                </div>
            `;
        }).join("");

        // Attach click listeners to open full post modal
        grid.querySelectorAll(".my-post-card").forEach(card => {
            card.addEventListener("click", () => {
                const pid = card.getAttribute("data-post-id");
                const found = myPosts.find(item => item.id === pid);
                if (found) showPostDetail(found);
            });
        });
    } catch (e) {
        console.warn("My posts error:", e);
        grid.innerHTML = `<p class="text-danger p-3 text-center" style="grid-column: 1 / -1;">Failed to load posts.</p>`;
    }
}

function showPostDetail(post) {
    const modalEl = document.getElementById("postDetailModal");
    const bodyEl = document.getElementById("postDetailBody");
    if (!modalEl || !bodyEl) return;

    const postId = post.id || post.postId;
    const isVid = post.videoUrl || (post.imageUrl && (post.imageUrl.match(/\.(mp4|webm|mov)(\?|$)/i) || post.imageUrl.includes('/video/upload/')));
    const mediaUrl = post.videoUrl || post.imageUrl;
    const isOwner = (post.userId || post.user_id) === loggedInUserId;
    const dateStr = post.createdAt ? new Date(post.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
    const userAvatar = post.userPhoto && post.userPhoto !== 'default' && post.userPhoto.length > 5
        ? post.userPhoto
        : `https://ui-avatars.com/api/?name=${encodeURIComponent(post.userName || 'U')}&background=22C55E&color=fff`;

    const likesCount = typeof post.likesCount === 'number'
        ? post.likesCount
        : (post.likes ? (typeof post.likes === 'object' ? Object.keys(post.likes).length : post.likes) : 0);

    const commentsCount = typeof post.commentsCount === 'number'
        ? post.commentsCount
        : (post.comments ? (typeof post.comments === 'object' ? Object.keys(post.comments).length : post.comments) : 0);

    let mediaHTML = "";
    if (mediaUrl) {
        if (isVid) {
            mediaHTML = `<video src="${mediaUrl}" controls playsinline autoplay class="post-detail-img mb-3" style="width:100%;max-height:480px;object-fit:contain;background:#000;border-radius:14px;display:block;"></video>`;
        } else {
            mediaHTML = `<img src="${mediaUrl}" alt="Post" class="post-detail-img mb-3" style="width:100%;height:auto;max-height:480px;object-fit:contain;background:#0b0f19;border-radius:14px;display:block;">`;
        }
    }

    bodyEl.innerHTML = `
        <div class="d-flex align-items-center gap-3 mb-3">
            <img src="${userAvatar}" class="rounded-circle" style="width:44px;height:44px;object-fit:cover;" onerror="this.src='https://ui-avatars.com/api/?name=U&background=22C55E&color=fff'">
            <div>
                <div class="fw-bold text-dark">${post.userName || 'URVI Member'}</div>
                <div class="text-muted small">${dateStr}</div>
            </div>
        </div>

        ${mediaHTML}

        ${post.description ? `<p class="mt-2 text-dark" style="font-size:14.5px;line-height:1.55;white-space:pre-line;">${post.description}</p>` : ''}
        ${post.location ? `<div class="location small text-muted mb-2"><i class="bi bi-geo-alt-fill text-danger me-1"></i>${post.location}</div>` : ''}

        <!-- Interactive Buttons Row -->
        <div class="d-flex align-items-center justify-content-between border-top border-bottom py-2 my-3">
            <div class="d-flex gap-2">
                <button type="button" class="btn btn-sm btn-outline-danger rounded-pill px-3" id="profile-modal-like-btn-${postId}" onclick="window.likeProfileModalPost('${postId}', this)">
                    <i class="bi bi-heart me-1"></i>
                    <span id="profile-modal-like-count-${postId}">${likesCount}</span> Likes
                </button>
                <button type="button" class="btn btn-sm btn-outline-success rounded-pill px-3" onclick="window.shareProfileModalPost('${postId}')">
                    <i class="bi bi-share-fill me-1"></i> Share
                </button>
            </div>
            ${isOwner ? `
                <button type="button" class="btn btn-sm btn-outline-danger rounded-pill px-3" id="btn-delete-current-post">
                    <i class="bi bi-trash3-fill me-1"></i> Delete
                </button>
            ` : ''}
        </div>

        <!-- Comments Section (Vertically Scrollable With Full Post) -->
        <div class="modal-comments-box mt-3 pb-2">
            <h6><i class="bi bi-chat-dots-fill text-success me-1"></i> Comments (<span id="profile-modal-comment-count-${postId}">${commentsCount}</span>)</h6>
            <div class="comments-list mt-2" id="profile-modal-comments-list-${postId}">
                <div class="text-center p-2"><div class="spinner-border spinner-border-sm text-success"></div></div>
            </div>

            ${loggedInUserId ? `
            <form class="d-flex gap-2 mt-3" action="javascript:void(0);" method="post" onsubmit="event.preventDefault(); window.addProfileModalComment('${postId}', event); return false;">
                <input type="text" class="form-control form-control-sm rounded-pill px-3" placeholder="Write a comment..." id="profile-modal-comment-input-${postId}" autocomplete="off" onkeydown="if(event.key==='Enter'||event.keyCode===13){event.preventDefault();window.addProfileModalComment('${postId}',event);}">
                <button type="button" class="btn btn-sm btn-success rounded-pill px-3" onclick="window.addProfileModalComment('${postId}', event)" onpointerdown="event.preventDefault();" style="touch-action:manipulation;"><i class="bi bi-send-fill" style="pointer-events:none;"></i></button>
            </form>` : `
            <div class="p-2 text-center my-2 rounded-3 border bg-light" style="cursor:pointer;" onclick="window.location.href='../logins/login.html'">
                <small class="text-muted fw-semibold"><i class="bi bi-box-arrow-in-right text-success me-1"></i> Log in to react or comment</small>
            </div>`}
        </div>
    `;

    // Check if user already liked
    if (loggedInUserId) {
        get(ref(db, `community/likes/${postId}/${loggedInUserId}`)).then(snap => {
            if (snap.exists()) {
                const btn = document.getElementById(`profile-modal-like-btn-${postId}`);
                if (btn) {
                    btn.className = "btn btn-sm btn-danger rounded-pill px-3";
                    btn.querySelector("i").className = "bi bi-heart-fill me-1";
                }
            }
        }).catch(() => {});
    }

    if (isOwner) {
        document.getElementById("btn-delete-current-post")?.addEventListener("click", async () => {
            if (!confirm("Are you sure you want to delete this post?")) return;
            try {
                await remove(ref(db, `community/posts/${postId}`));
                const modalInstance = bootstrap.Modal.getInstance(modalEl);
                if (modalInstance) modalInstance.hide();
                loadMyPosts(loggedInUserId);
            } catch (err) {
                alert("Failed to delete post: " + err.message);
            }
        });
    }

    loadProfileModalComments(postId);

    const modal = new bootstrap.Modal(modalEl);
    modal.show();
}

async function loadProfileModalComments(postId) {
    const list = document.getElementById(`profile-modal-comments-list-${postId}`);
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

        const activeUser = loggedInUserId;
        const postSnap = await get(ref(db, `community/posts/${postId}`));
        const postOwnerId = postSnap.exists() ? postSnap.val().userId : null;

        list.innerHTML = comments.map(c => {
            const canDelete = activeUser && (activeUser === c.userId || activeUser === postOwnerId);
            return `
            <div class="comment-item position-relative" id="profile-my-comment-${c.id}">
                <div class="comment-header ${canDelete ? 'pe-4' : ''}">
                    <strong>${c.userName || "User"}</strong>
                    <small>${new Date(c.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>
                </div>
                <p class="comment-text">${c.text}</p>
                ${canDelete ? `
                <button type="button" class="btn btn-sm text-danger p-0 position-absolute" style="top:8px; right:10px; line-height:1; font-size:13px; background:none; border:none; cursor:pointer;" onclick="window.deleteProfileModalComment('${postId}', '${c.id}')" title="Delete comment">
                    <i class="bi bi-trash3"></i>
                </button>` : ""}
            </div>
            `;
        }).join("");
    } catch (e) {
        list.innerHTML = '<p class="text-muted text-center small">Failed to load comments</p>';
    }
}

window.likeProfileModalPost = async function (postId, btn) {
    if (!loggedInUserId) {
        alert("Please login first.");
        window.location.href = "../logins/login.html";
        return;
    }

    const likeRef = ref(db, `community/likes/${postId}/${loggedInUserId}`);
    const postRef = ref(db, `community/posts/${postId}`);
    const countSpan = document.getElementById(`profile-modal-like-count-${postId}`);
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
    } catch (e) {
        console.error("Like modal sync error:", e);
    }
};

window.shareProfileModalPost = function (postId) {
    const url = window.location.origin + `/profile/user-profile.html?uid=${loggedInUserId}`;
    if (navigator.share) {
        navigator.share({
            title: "Check out this post on URVI!",
            text: "Take a look at this environmental update on URVI:",
            url: url
        }).catch(() => {});
    } else {
        navigator.clipboard.writeText(url).then(() => {
            alert("Post link copied to clipboard!");
        }).catch(() => {
            prompt("Copy post link:", url);
        });
    }
};

window.deleteProfileModalComment = async function (postId, commentId) {
    if (!confirm("Are you sure you want to delete this comment?")) return;
    try {
        document.getElementById(`profile-my-comment-${commentId}`)?.remove();
        await remove(ref(db, `community/comments/${postId}/${commentId}`));

        const postSnap = await get(ref(db, `community/posts/${postId}`));
        if (postSnap.exists()) {
            const count = Math.max(0, (postSnap.val().commentsCount || 0) - 1);
            await update(ref(db, `community/posts/${postId}`), { commentsCount: count });
            const countSpan = document.getElementById(`profile-modal-comment-count-${postId}`);
            if (countSpan) countSpan.textContent = count;
        }
    } catch (e) {
        console.error("Delete modal comment error:", e);
        alert("Failed to delete comment: " + e.message);
    }
};

const submittingProfileCommentPostIds = new Set();

window.addProfileModalComment = async function (postId, event) {
    if (event) {
        try {
            event.preventDefault();
            event.stopPropagation();
        } catch (err) {}
    }

    if (submittingProfileCommentPostIds.has(postId)) return;

    const input = document.getElementById(`profile-modal-comment-input-${postId}`);
    if (!input) return;
    const text = input.value.trim();
    if (!text) {
        input.focus();
        return;
    }

    const activeUser = loggedInUserId || localStorage.getItem("urvi_logged_user");
    if (!activeUser) {
        alert("Please login first.");
        return;
    }

    submittingProfileCommentPostIds.add(postId);
    const form = input.closest("form");
    const sendBtn = form ? form.querySelector("button") : null;
    if (sendBtn) {
        sendBtn.disabled = true;
    }

    try {
        let myName = "User";
        let myPhoto = "default";
        const cachedUserData = localStorage.getItem("urvi_user_data");
        if (cachedUserData) {
            try {
                const u = JSON.parse(cachedUserData);
                myName = `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.name || activeUser;
                myPhoto = u.profilePic || "default";
            } catch (err) {}
        }

        try {
            const meSnap = await get(child(ref(db), `users/${activeUser}`));
            if (meSnap.exists()) {
                const me = meSnap.val();
                myName = `${me.firstName || ""} ${me.lastName || ""}`.trim() || myName;
                myPhoto = me.profilePic || myPhoto;
            }
        } catch (err) {}

        const commentRef = push(ref(db, `community/comments/${postId}`));
        await set(commentRef, {
            userId: activeUser,
            userName: myName,
            userPhoto: myPhoto,
            text: text,
            createdAt: Date.now()
        });

        input.value = "";
        try { input.blur(); } catch (err) {}
        await loadProfileModalComments(postId);

        try {
            const postSnap = await get(ref(db, `community/posts/${postId}`));
            if (postSnap.exists()) {
                const count = (postSnap.val().commentsCount || 0) + 1;
                await update(ref(db, `community/posts/${postId}`), { commentsCount: count });
                const countSpan = document.getElementById(`profile-modal-comment-count-${postId}`);
                if (countSpan) countSpan.textContent = count;
            }
        } catch (err) {}
    } catch (e) {
        console.error("Add modal comment error:", e);
        alert("Failed to post comment: " + e.message);
    } finally {
        submittingProfileCommentPostIds.delete(postId);
        if (sendBtn) sendBtn.disabled = false;
    }
};

async function loadUserChallengesAndProofs(targetId) {
    const challengesListEl = document.getElementById("profile-active-challenges-list");
    const proofsGrid = document.getElementById("my-proofs-grid");
    const tabProofsCount = document.getElementById("tab-proofs-count");
    const btnTabPosts = document.getElementById("btn-tab-posts");
    const btnTabProofs = document.getElementById("btn-tab-proofs");
    const postsGrid = document.getElementById("my-posts-grid");

    // Setup tab switcher between Posts and Challenge Proofs
    if (btnTabPosts && btnTabProofs && !btnTabPosts._isBound) {
        btnTabPosts._isBound = true;
        btnTabPosts.addEventListener("click", () => {
            btnTabPosts.className = "btn btn-sm btn-success rounded-pill px-3 fw-bold";
            btnTabProofs.className = "btn btn-sm btn-outline-secondary rounded-pill px-3 fw-semibold";
            postsGrid?.classList.remove("d-none");
            proofsGrid?.classList.add("d-none");
        });

        btnTabProofs.addEventListener("click", () => {
            btnTabProofs.className = "btn btn-sm btn-success rounded-pill px-3 fw-bold";
            btnTabPosts.className = "btn btn-sm btn-outline-secondary rounded-pill px-3 fw-semibold";
            postsGrid?.classList.add("d-none");
            proofsGrid?.classList.remove("d-none");
        });
    }

    if (!challengesListEl) return;

    const idToCheck = targetId || loggedInUserId;
    if (!idToCheck) return;

    const now = new Date();
    const monthKey = `${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, "0")}`;
    const todayStr = now.toISOString().split("T")[0];

    if (window.getUrviSpinnerHTML) {
        challengesListEl.innerHTML = window.getUrviSpinnerHTML({ text: "Loading challenges...", size: "sm" });
        if (proofsGrid) proofsGrid.innerHTML = window.getUrviSpinnerHTML({ text: "Loading challenge proofs...", size: "sm" });
    }

    try {
        const uactSnap = await get(child(ref(db), `user_activities/${idToCheck}`));
        if (!uactSnap.exists()) {
            challengesListEl.innerHTML = `
                <div class="d-flex align-items-center justify-content-between p-3 bg-light rounded-4">
                    <span class="small text-muted">No monthly challenges started yet.</span>
                    <a href="../activities/activities.html" class="btn btn-sm btn-outline-success rounded-pill px-3 fw-bold">Explore Challenges</a>
                </div>
            `;
            if (proofsGrid) proofsGrid.innerHTML = `<div class="col-12 text-center text-muted py-3">No activity proofs submitted yet.</div>`;
            if (tabProofsCount) tabProofsCount.innerText = "0";
            return;
        }

        const monthsData = uactSnap.val();
        const currentMonthActs = monthsData[monthKey] || {};
        const actEntries = Object.entries(currentMonthActs);

        // 1. Calculate and update best streak in score-streak card
        let bestStreak = 0;
        let allProofs = [];

        Object.values(monthsData).forEach(mObj => {
            if (!mObj || typeof mObj !== "object") return;
            Object.entries(mObj).forEach(([aId, aData]) => {
                if (aData.streak && aData.streak > bestStreak) bestStreak = aData.streak;
                if (aData.highestStreak && aData.highestStreak > bestStreak) bestStreak = aData.highestStreak;
                if (aData.uploads) {
                    Object.entries(aData.uploads).forEach(([uId, u]) => {
                        allProofs.push({
                            actId: aId,
                            actTitle: aData.title || aId,
                            actIcon: aData.icon || "🌱",
                            uId,
                            ...u
                        });
                    });
                }
            });
        });

        const streakEl = document.getElementById("score-streak");
        if (streakEl) streakEl.textContent = bestStreak;

        // 2. Render Active Challenges Status list
        if (actEntries.length === 0) {
            challengesListEl.innerHTML = `
                <div class="d-flex align-items-center justify-content-between p-3 bg-light rounded-4">
                    <span class="small text-muted">No active challenges for this month yet.</span>
                    <a href="../activities/activities.html" class="btn btn-sm btn-outline-success rounded-pill px-3 fw-bold">Join Challenges</a>
                </div>
            `;
        } else {
            challengesListEl.innerHTML = actEntries.map(([actId, act]) => {
                const uploads = act.uploads ? Object.values(act.uploads) : [];
                const todayUpload = uploads.find(u => u.date === todayStr);

                let statusBadge = `<span class="badge bg-light text-danger border"><i class="bi bi-clock me-1"></i>Task Due Today</span>`;
                if (todayUpload) {
                    if (todayUpload.verified) statusBadge = `<span class="badge bg-success-subtle text-success"><i class="bi bi-check-circle-fill me-1"></i>Verified ✓</span>`;
                    else if (todayUpload.rejected) statusBadge = `<span class="badge bg-danger-subtle text-danger"><i class="bi bi-x-circle-fill me-1"></i>Rejected</span>`;
                    else statusBadge = `<span class="badge bg-warning-subtle text-warning text-dark"><i class="bi bi-hourglass-split me-1"></i>Under Review</span>`;
                }

                return `
                    <div class="d-flex align-items-center justify-content-between p-2 mb-2 bg-light rounded-3">
                        <div class="d-flex align-items-center gap-2">
                            <span class="fs-4">${act.icon || "🌱"}</span>
                            <div>
                                <div class="fw-bold small text-dark">${act.title || actId}</div>
                                <small class="text-danger fw-semibold" style="font-size:11px;">🔥 ${act.streak || 0} Days Streak</small>
                            </div>
                        </div>
                        <div>
                            ${statusBadge}
                        </div>
                    </div>
                `;
            }).join("");
        }

        // 3. Render Proofs Grid
        if (tabProofsCount) tabProofsCount.innerText = allProofs.length;
        if (proofsGrid) {
            if (allProofs.length === 0) {
                proofsGrid.innerHTML = `<div class="col-12 text-center text-muted py-3">No activity proof photos submitted yet.</div>`;
            } else {
                allProofs.sort((a, b) => (b.uploadedAt || 0) - (a.uploadedAt || 0));
                proofsGrid.innerHTML = allProofs.map(u => {
                    const isVid = isVideoUrl(u.mediaUrl) || u.mediaType === "video";
                    const media = isVid
                        ? `<video src="${u.mediaUrl}" controls style="height:120px; width:100%; object-fit:cover; border-radius:10px; background:#0F172A;"></video>`
                        : `<img src="${u.mediaUrl}" style="height:120px; width:100%; object-fit:cover; border-radius:10px;" alt="Proof" onerror="this.src='../assets/logo.png'">`;

                    let stBadge = `<span class="badge bg-warning text-dark" style="font-size:9.5px;">Pending</span>`;
                    if (u.verified) stBadge = `<span class="badge bg-success" style="font-size:9.5px;">Verified ✓</span>`;
                    if (u.rejected) stBadge = `<span class="badge bg-danger" style="font-size:9.5px;">Rejected</span>`;

                    return `
                        <div class="col-6 col-md-4 col-lg-3">
                            <div class="p-2 border rounded-3 bg-white h-100 d-flex flex-column justify-content-between">
                                ${media}
                                <div class="mt-2">
                                    <div class="fw-bold text-truncate" style="font-size:11px;">${u.actIcon || "🌱"} ${u.actTitle || "Challenge"}</div>
                                    <div class="d-flex align-items-center justify-content-between mt-1">
                                        <small class="text-muted" style="font-size:10px;">${u.date || "Past"}</small>
                                        ${stBadge}
                                    </div>
                                </div>
                            </div>
                        </div>
                    `;
                }).join("");
            }
        }

    } catch (e) {
        console.warn("Load challenges and proofs error:", e);
    }
}

/* =====================================================
   SETTINGS & SECURITY MODAL & DIRECT MENU BUTTON HANDLERS
   ===================================================== */
function setupDirectMenuButton() {
    const menuBtn = document.getElementById("btn-profile-mobile-menu");
    if (menuBtn) {
        menuBtn.addEventListener("click", () => {
            if (typeof window.openUrviProfileMenu === "function") {
                window.openUrviProfileMenu();
            } else {
                const modalEl = document.getElementById("profileSettingsModal");
                if (modalEl && window.bootstrap) {
                    const m = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
                    m.show();
                } else {
                    const overlay = document.getElementById("urvi-profile-sheet-overlay");
                    const sheet = document.getElementById("urvi-profile-action-sheet");
                    overlay?.classList.add("active");
                    sheet?.classList.add("active");
                    document.body.classList.add("sheet-open");
                }
            }
        });
    }

    document.getElementById("btn-hero-edit-profile")?.addEventListener("click", () => {
        const modalEl = document.getElementById("profileSettingsModal");
        if (modalEl && window.bootstrap) {
            const m = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
            m.show();
        }
    });
}

function setupSettingsModalHandlers() {
    // 1. Tab Switching
    const tabEdit = document.getElementById("tab-btn-edit");
    const tabSecurity = document.getElementById("tab-btn-security");
    const paneEdit = document.getElementById("settings-pane-edit");
    const paneSecurity = document.getElementById("settings-pane-security");

    tabEdit?.addEventListener("click", () => {
        tabEdit.style.background = "#FFFFFF";
        tabEdit.style.color = "#16A34A";
        tabEdit.style.boxShadow = "0 2px 6px rgba(0,0,0,0.06)";
        tabSecurity.style.background = "transparent";
        tabSecurity.style.color = "#64748B";
        tabSecurity.style.boxShadow = "none";
        paneEdit?.classList.remove("d-none");
        paneSecurity?.classList.add("d-none");
    });

    tabSecurity?.addEventListener("click", () => {
        tabSecurity.style.background = "#FFFFFF";
        tabSecurity.style.color = "#16A34A";
        tabSecurity.style.boxShadow = "0 2px 6px rgba(0,0,0,0.06)";
        tabEdit.style.background = "transparent";
        tabEdit.style.color = "#64748B";
        tabEdit.style.boxShadow = "none";
        paneSecurity?.classList.remove("d-none");
        paneEdit?.classList.add("d-none");
    });

    // 2. Save Profile Details from Modal
    const modalSaveBtn = document.getElementById("modal-save-profile-btn");
    const modalEditFeedback = document.getElementById("modal-edit-feedback");

    modalSaveBtn?.addEventListener("click", async () => {
        modalSaveBtn.disabled = true;
        modalSaveBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Saving...`;

        try {
            const updates = {
                firstName: document.getElementById("modal-firstName").value.trim(),
                lastName: document.getElementById("modal-lastName").value.trim(),
                bio: document.getElementById("modal-bio").value.trim(),
                dob: document.getElementById("modal-dob").value.trim(),
                updatedAt: Date.now()
            };

            await update(ref(db, `users/${loggedInUserId}`), updates);

            const cachedUserData = localStorage.getItem("urvi_user_data");
            if (cachedUserData) {
                try {
                    const cached = JSON.parse(cachedUserData);
                    Object.assign(cached, updates);
                    localStorage.setItem("urvi_user_data", JSON.stringify(cached));
                } catch (e) { /* ignore */ }
            }

            if (modalEditFeedback) {
                modalEditFeedback.className = "alert alert-success p-2 small mt-3 rounded-3";
                modalEditFeedback.innerHTML = `✅ Profile details updated successfully! 🌿`;
                modalEditFeedback.classList.remove("d-none");
            }

            loadUserData();

            setTimeout(() => {
                if (modalEditFeedback) modalEditFeedback.classList.add("d-none");
                const modalEl = document.getElementById("profileSettingsModal");
                if (modalEl && window.bootstrap) {
                    const modal = window.bootstrap.Modal.getInstance(modalEl);
                    modal?.hide();
                }
            }, 1400);

        } catch (err) {
            console.error("Save profile error:", err);
            if (modalEditFeedback) {
                modalEditFeedback.className = "alert alert-danger p-2 small mt-3 rounded-3";
                modalEditFeedback.innerHTML = `❌ Failed to save: ${err.message}`;
                modalEditFeedback.classList.remove("d-none");
            }
        } finally {
            modalSaveBtn.disabled = false;
            modalSaveBtn.innerHTML = `<i class="bi bi-check-lg me-1"></i> Save Profile Details`;
        }
    });

    // 3. Update Password from Modal
    const modalUpdatePwdBtn = document.getElementById("modal-update-pwd-btn");
    const modalPwdFeedback = document.getElementById("modal-pwd-feedback");

    modalUpdatePwdBtn?.addEventListener("click", async () => {
        const curInput = document.getElementById("modal-pwd-current");
        const newInput = document.getElementById("modal-pwd-new");
        const confInput = document.getElementById("modal-pwd-confirm");

        const curVal = curInput ? curInput.value.trim() : "";
        const newVal = newInput ? newInput.value.trim() : "";
        const confVal = confInput ? confInput.value.trim() : "";

        function showModalPwdFeedback(msg, type = "danger") {
            if (!modalPwdFeedback) return;
            modalPwdFeedback.className = `alert alert-${type} p-2 small mt-2 rounded-3`;
            modalPwdFeedback.innerHTML = msg;
            modalPwdFeedback.classList.remove("d-none");
        }

        modalUpdatePwdBtn.disabled = true;
        modalUpdatePwdBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Verifying...`;

        try {
            let userRecord = null;
            const snap = await get(child(ref(db), `users/${loggedInUserId}`));
            if (snap.exists()) userRecord = snap.val();

            const dbHasPassword = Boolean(
                userRecord &&
                userRecord.password &&
                typeof userRecord.password === "string" &&
                userRecord.password.trim().length > 0 &&
                userRecord.password !== "google"
            );

            if (dbHasPassword) {
                if (!curVal) {
                    showModalPwdFeedback("⚠️ Please enter your current password to verify security.", "warning");
                    modalUpdatePwdBtn.disabled = false;
                    modalUpdatePwdBtn.innerHTML = `<i class="bi bi-shield-check me-1"></i> Update Password`;
                    return;
                }
                if (userRecord.password !== curVal) {
                    showModalPwdFeedback("❌ Current password is incorrect. Please try again.", "danger");
                    modalUpdatePwdBtn.disabled = false;
                    modalUpdatePwdBtn.innerHTML = `<i class="bi bi-shield-check me-1"></i> Update Password`;
                    return;
                }
            }

            if (!newVal || !confVal) {
                showModalPwdFeedback("⚠️ Please enter and confirm your new password.", "warning");
                modalUpdatePwdBtn.disabled = false;
                modalUpdatePwdBtn.innerHTML = `<i class="bi bi-shield-check me-1"></i> Update Password`;
                return;
            }

            if (newVal.length < 6) {
                showModalPwdFeedback("⚠️ New password must be at least 6 characters long.", "warning");
                modalUpdatePwdBtn.disabled = false;
                modalUpdatePwdBtn.innerHTML = `<i class="bi bi-shield-check me-1"></i> Update Password`;
                return;
            }

            if (newVal !== confVal) {
                showModalPwdFeedback("⚠️ New password and confirmation do not match.", "warning");
                modalUpdatePwdBtn.disabled = false;
                modalUpdatePwdBtn.innerHTML = `<i class="bi bi-shield-check me-1"></i> Update Password`;
                return;
            }

            await update(ref(db, `users/${loggedInUserId}`), {
                password: newVal,
                passwordUpdatedAt: Date.now()
            });

            const cached = localStorage.getItem("urvi_user_data");
            if (cached) {
                try {
                    const c = JSON.parse(cached);
                    c.password = newVal;
                    localStorage.setItem("urvi_user_data", JSON.stringify(c));
                } catch (e) { /* ignore */ }
            }

            showModalPwdFeedback("✅ Password updated successfully! Your account is secure.", "success");
            if (curInput) curInput.value = "";
            if (newInput) newInput.value = "";
            if (confInput) confInput.value = "";

            setTimeout(() => {
                if (modalPwdFeedback) modalPwdFeedback.classList.add("d-none");
                const modalEl = document.getElementById("profileSettingsModal");
                if (modalEl && window.bootstrap) {
                    const modal = window.bootstrap.Modal.getInstance(modalEl);
                    modal?.hide();
                }
            }, 1600);

        } catch (err) {
            console.error("Password update error:", err);
            showModalPwdFeedback("❌ Error: " + err.message, "danger");
        } finally {
            modalUpdatePwdBtn.disabled = false;
            modalUpdatePwdBtn.innerHTML = `<i class="bi bi-shield-check me-1"></i> Update Password`;
        }
    });
}