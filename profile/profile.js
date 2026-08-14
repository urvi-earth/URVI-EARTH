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

let selectedProfileFile = null;

document.addEventListener("DOMContentLoaded", () => {
    loadUserData();
    setupEditModeHandlers();
    setupAccountDeletionHandlers();
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

    // Instant render from local storage cache if available
    const cachedUserData = localStorage.getItem("urvi_user_data");
    if (cachedUserData) {
        try {
            const cachedUser = JSON.parse(cachedUserData);
            populateProfileFields(cachedUser);
            checkDeletionStatus(cachedUser);
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
            localStorage.setItem("urvi_user_data", JSON.stringify(user));
            populateProfileFields(user);
            loadFollowCounts(user.user_id || loggedInUserId);
            loadMyPosts(user.user_id || loggedInUserId);
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

// ── Edit Profile Handlers ──
function setupEditModeHandlers() {
    const pencil = document.getElementById("edit-pencil");
    const saveBtn = document.getElementById("save-btn");
    const cancelBtn = document.getElementById("cancel-btn");
    const editBtns = document.getElementById("edit-buttons");
    const fileInput = document.getElementById("img-upload");

    pencil?.addEventListener("click", () => {
        document.querySelectorAll(".edit-allowed").forEach(inp => inp.removeAttribute("readonly"));
        editBtns?.classList.remove("d-none");
        pencil.classList.add("d-none");
    });

    cancelBtn?.addEventListener("click", () => {
        document.querySelectorAll(".edit-allowed").forEach(inp => inp.setAttribute("readonly", true));
        editBtns?.classList.add("d-none");
        pencil?.classList.remove("d-none");
        loadUserData();
    });

    saveBtn?.addEventListener("click", async () => {
        saveBtn.disabled = true;
        saveBtn.innerText = "Saving...";

        try {
            const dobVal = document.getElementById("db-dob") ? document.getElementById("db-dob").value.trim() : "";

            const updates = {
                firstName: document.getElementById("db-firstName").value.trim(),
                lastName: document.getElementById("db-lastName").value.trim(),
                bio: document.getElementById("db-bio").value.trim(),
                dob: dobVal,
                updatedAt: Date.now()
            };

            await update(ref(db, `users/${loggedInUserId}`), updates);

            // Update local storage user data cache
            const cachedUserData = localStorage.getItem("urvi_user_data");
            if (cachedUserData) {
                try {
                    const cached = JSON.parse(cachedUserData);
                    cached.firstName = updates.firstName;
                    cached.lastName = updates.lastName;
                    cached.bio = updates.bio;
                    cached.dob = updates.dob;
                    localStorage.setItem("urvi_user_data", JSON.stringify(cached));
                } catch (e) { /* ignore */ }
            }

            alert("Profile updated successfully! 🌿");

            document.querySelectorAll(".edit-allowed").forEach(inp => inp.setAttribute("readonly", true));
            editBtns?.classList.add("d-none");
            pencil?.classList.remove("d-none");
            loadUserData();

        } catch (err) {
            console.error("Save profile error:", err);
            alert("Failed to save profile: " + err.message);
        }
        saveBtn.disabled = false;
        saveBtn.innerText = "Save Changes";
    });

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

    const idToCheck = (targetId || loggedInUserId || "").toLowerCase();

    try {
        const pSnap = await get(child(ref(db), "community/posts"));
        if (!pSnap.exists()) {
            grid.innerHTML = `<p class="text-muted p-3">No posts shared yet.</p>`;
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

        if (myPosts.length === 0) {
            grid.innerHTML = `<p class="text-muted p-3">No posts shared yet.</p>`;
            return;
        }

        grid.innerHTML = myPosts.map(p => `
            <div class="my-post-card">
                ${p.imageUrl ? `<img src="${p.imageUrl}" alt="Post">` : `<div class="p-3 bg-light text-dark small">${(p.description || '').slice(0, 60)}...</div>`}
            </div>
        `).join("");
    } catch (e) { console.warn("My posts error:", e); }
}