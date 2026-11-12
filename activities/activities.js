/* =====================================================
   URVI – activities.js | Monthly Challenges & Multi-Streak Engine
   ===================================================== */
import { db, ref, get, child, set, update, push } from "../config.js";
import { uploadToCloudinaryDetailed, isVideoUrl } from "../cloudinary.js";

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
let currentMonthKey = "";
let cachedMonthlyActivities = {};
let cachedUserActivities = {};
let capturedLocation = null;

document.addEventListener("DOMContentLoaded", () => {
    initCurrentMonth();
    loadChallengesPage();
    setupProofUploadModal();
});

function initCurrentMonth() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    currentMonthKey = `${y}_${m}`;

    const monthNames = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];
    const monthLabelEl = document.getElementById("current-month-label");
    if (monthLabelEl) {
        monthLabelEl.innerText = `${monthNames[now.getMonth()]} ${y} Challenges`;
    }
}

async function loadChallengesPage() {
    const activeContainer = document.getElementById("active-challenges-container");
    const availableContainer = document.getElementById("available-challenges-container");
    if (!activeContainer || !availableContainer) return;

    if (window.getUrviSpinnerHTML) {
        activeContainer.innerHTML = `<div class="col-12">${window.getUrviSpinnerHTML({ text: "Loading your active challenges..." })}</div>`;
        availableContainer.innerHTML = `<div class="col-12">${window.getUrviSpinnerHTML({ text: "Loading available eco challenges..." })}</div>`;
    } else {
        activeContainer.innerHTML = `<div class="col-12 text-center py-4 text-muted"><span class="spinner-border spinner-border-sm me-2"></span>Loading your active challenges...</div>`;
        availableContainer.innerHTML = `<div class="col-12 text-center py-4 text-muted"><span class="spinner-border spinner-border-sm me-2"></span>Loading available challenges...</div>`;
    }

    try {
        // 1. Fetch Admin Published Monthly Activities
        const mSnap = await get(child(ref(db), `monthly_activities/${currentMonthKey}/activities`));
        cachedMonthlyActivities = mSnap.exists() ? mSnap.val() : {};

        // 2. Fetch User Activities for This Month
        if (currentUserId) {
            const uSnap = await get(child(ref(db), `user_activities/${currentUserId}/${currentMonthKey}`));
            cachedUserActivities = uSnap.exists() ? uSnap.val() : {};
            await evaluateStreakResets();
        } else {
            cachedUserActivities = {};
        }

        renderStreakDashboardStats();
        renderActiveChallenges();
        renderAvailableChallenges();
        renderProofUploadHistory();

    } catch (err) {
        console.error("Load challenges error:", err);
        activeContainer.innerHTML = `<div class="col-12 alert alert-danger">Error loading challenges: ${err.message}</div>`;
        availableContainer.innerHTML = `<div class="col-12 alert alert-danger">Error loading challenges.</div>`;
    } finally {
        if (window.hideUrviLoader) window.hideUrviLoader();
    }
}

/** Check if any active streak was broken due to missing yesterday's upload */
async function evaluateStreakResets() {
    if (!currentUserId || !cachedUserActivities) return;

    const todayStr = new Date().toISOString().split("T")[0];
    const yesterdayDate = new Date(Date.now() - 86400000);
    const yesterdayStr = yesterdayDate.toISOString().split("T")[0];

    for (const [actId, act] of Object.entries(cachedUserActivities)) {
        if (!act || act.streak === 0) continue;

        const lastDate = act.lastUploadDate;
        if (!lastDate) continue;

        // If last upload is older than yesterday, streak resets to 0!
        if (lastDate !== todayStr && lastDate !== yesterdayStr) {
            act.streak = 0;
            try {
                await update(ref(db, `user_activities/${currentUserId}/${currentMonthKey}/${actId}`), {
                    streak: 0
                });
            } catch (e) {
                console.warn("Failed to reset streak in database:", e);
            }
        }
    }
}

function renderStreakDashboardStats() {
    const bestStreakEl = document.getElementById("stat-best-streak");
    const activeCountEl = document.getElementById("stat-active-challenges");
    const pointsEarnedEl = document.getElementById("stat-streak-points");

    const joinedActs = Object.values(cachedUserActivities || {});
    const activeCount = joinedActs.length;

    let bestStreak = 0;
    let totalStreakPts = 0;

    joinedActs.forEach(a => {
        if (a.streak && a.streak > bestStreak) bestStreak = a.streak;
        if (a.totalDaysCompleted && a.pointsPerDay) {
            totalStreakPts += (a.totalDaysCompleted * a.pointsPerDay);
        }
    });

    if (bestStreakEl) bestStreakEl.innerText = `${bestStreak} Days`;
    if (activeCountEl) activeCountEl.innerText = `${activeCount} / 5`;
    if (pointsEarnedEl) pointsEarnedEl.innerText = `${totalStreakPts} pts`;

    const badge = document.getElementById("active-challenges-badge");
    if (badge) badge.innerText = `${activeCount} Active`;
}

function renderActiveChallenges() {
    const container = document.getElementById("active-challenges-container");
    if (!container) return;

    if (!currentUserId) {
        container.innerHTML = `
            <div class="col-12 text-center py-4">
                <p class="text-muted mb-2">Please log in to track your challenges and maintain streaks.</p>
                <a href="../logins/login.html" class="btn btn-success rounded-pill px-4 fw-bold">Log In / Register</a>
            </div>
        `;
        return;
    }

    const joinedEntries = Object.entries(cachedUserActivities || {});
    if (joinedEntries.length === 0) {
        container.innerHTML = `
            <div class="col-12 text-center py-4">
                <div class="mb-2" style="font-size:36px;">🌱</div>
                <h6 class="fw-bold text-dark">You haven't joined any challenges yet this month!</h6>
                <p class="small text-muted">Pick one or more of the 5 challenges below to start earning daily streak rewards.</p>
            </div>
        `;
        return;
    }

    const todayStr = new Date().toISOString().split("T")[0];

    container.innerHTML = joinedEntries.map(([actId, act]) => {
        const fullActData = cachedMonthlyActivities[actId] || {};
        const title = act.title || fullActData.title || "Challenge";
        const icon = act.icon || fullActData.icon || "🌱";
        const category = act.category || fullActData.category || "General";
        const targetDays = act.targetDays || fullActData.targetDays || 30;
        const streak = act.streak || 0;
        const highestStreak = act.highestStreak || streak;
        const totalCompleted = act.totalDaysCompleted || 0;
        const progressPct = Math.min(100, Math.round((totalCompleted / targetDays) * 100));

        // Evaluate today's status
        const uploads = act.uploads ? Object.values(act.uploads) : [];
        const todayUpload = uploads.find(u => u.date === todayStr);

        let todayStatusBadge = "";
        let uploadBtnMarkup = "";

        if (todayUpload) {
            if (todayUpload.verified === true) {
                todayStatusBadge = `<span class="badge bg-success-subtle text-success py-2 px-3 rounded-pill fw-semibold"><i class="bi bi-check-circle-fill me-1"></i> Today's Task Verified! Streak Active 🔥</span>`;
                uploadBtnMarkup = `<button type="button" class="btn btn-outline-success rounded-pill w-100 fw-bold py-2 disabled" style="font-size:13px;"><i class="bi bi-patch-check-fill me-1"></i> Completed For Today</button>`;
            } else if (todayUpload.rejected === true) {
                todayStatusBadge = `<span class="badge bg-danger-subtle text-danger py-2 px-3 rounded-pill fw-semibold"><i class="bi bi-exclamation-octagon-fill me-1"></i> Upload Rejected (${todayUpload.rejectionNote || 'Re-upload proof'})</span>`;
                uploadBtnMarkup = `<button type="button" class="btn btn-danger rounded-pill w-100 fw-bold py-2 btn-open-upload-modal" data-act-id="${actId}" data-act-title="${title}" style="font-size:13px;"><i class="bi bi-arrow-repeat me-1"></i> Re-Upload Proof Today</button>`;
            } else {
                todayStatusBadge = `<span class="badge bg-warning-subtle text-warning py-2 px-3 rounded-pill fw-semibold text-dark"><i class="bi bi-hourglass-split me-1"></i> Proof Submitted • Pending Admin Verification</span>`;
                uploadBtnMarkup = `<button type="button" class="btn btn-outline-warning text-dark rounded-pill w-100 fw-bold py-2 disabled" style="font-size:13px;"><i class="bi bi-clock-history me-1"></i> Submitted Today (Under Review)</button>`;
            }
        } else {
            todayStatusBadge = `<span class="badge bg-light text-danger border py-2 px-3 rounded-pill fw-semibold"><i class="bi bi-camera-fill me-1"></i> Proof Pending Today</span>`;
            uploadBtnMarkup = `<button type="button" class="btn btn-success rounded-pill w-100 fw-bold py-2 btn-open-upload-modal shadow-sm" data-act-id="${actId}" data-act-title="${title}" style="font-size:13px;"><i class="bi bi-camera-fill me-1"></i> Upload Today's Proof</button>`;
        }

        return `
            <div class="col-12 col-md-6">
                <div class="active-challenge-card">
                    <div>
                        <div class="d-flex align-items-center justify-content-between mb-3">
                            <div class="d-flex align-items-center gap-2">
                                <span class="fs-2">${icon}</span>
                                <div>
                                    <h5 class="fw-bold m-0 text-dark" style="font-size:1.05rem;">${title}</h5>
                                    <small class="text-muted" style="font-size:11px;">${category}</small>
                                </div>
                            </div>
                            <div class="streak-fire-badge">
                                <span>🔥</span> ${streak} Days
                            </div>
                        </div>

                        <div class="mb-3">
                            ${todayStatusBadge}
                        </div>

                        <!-- Progress Bar -->
                        <div class="mb-3">
                            <div class="d-flex align-items-center justify-content-between small text-muted mb-1" style="font-size:11px;">
                                <span>Challenge Progress</span>
                                <span class="fw-bold text-dark">${totalCompleted} / ${targetDays} Days (${progressPct}%)</span>
                            </div>
                            <div class="progress" style="height:8px; border-radius:10px; background:#F1F5F9;">
                                <div class="progress-bar bg-success" style="width:${progressPct}%;"></div>
                            </div>
                        </div>

                        <div class="d-flex align-items-center justify-content-between small text-muted mb-3 pt-2 border-top" style="font-size:11px;">
                            <span><i class="bi bi-award-fill text-warning me-1"></i>Best Streak: <strong>${highestStreak} Days</strong></span>
                            <span><i class="bi bi-star-fill text-success me-1"></i>+${act.pointsPerDay || fullActData.pointsPerDay || 10} pts / day</span>
                        </div>
                    </div>

                    <div>
                        ${uploadBtnMarkup}
                    </div>
                </div>
            </div>
        `;
    }).join("");

    // Wire Upload Buttons
    container.querySelectorAll(".btn-open-upload-modal").forEach(btn => {
        btn.addEventListener("click", () => {
            const actId = btn.dataset.actId;
            const actTitle = btn.dataset.actTitle;
            openUploadModal(actId, actTitle);
        });
    });
}

function renderAvailableChallenges() {
    const container = document.getElementById("available-challenges-container");
    if (!container) return;

    const allActs = Object.entries(cachedMonthlyActivities || {});
    if (allActs.length === 0) {
        container.innerHTML = `
            <div class="col-12 text-center py-4 text-muted">
                <p>No published challenges found for this month.</p>
            </div>
        `;
        return;
    }

    // Filter out activities already joined
    const availableActs = allActs.filter(([id]) => !cachedUserActivities[id]);

    if (availableActs.length === 0) {
        container.innerHTML = `
            <div class="col-12 text-center py-4">
                <div class="alert alert-success d-inline-block rounded-4 px-4 py-3 m-0">
                    <i class="bi bi-check-circle-fill fs-3 text-success d-block mb-1"></i>
                    <h6 class="fw-bold m-0 text-success">You have joined all ${allActs.length} challenges this month! 🏆</h6>
                    <small class="text-muted">Maintain your daily streaks above to maximize rewards.</small>
                </div>
            </div>
        `;
        return;
    }

    container.innerHTML = availableActs.map(([actId, act]) => {
        return `
            <div class="col-12 col-md-6 col-xl-4">
                <div class="available-challenge-card">
                    <div>
                        <div class="d-flex align-items-center justify-content-between mb-2">
                            <span class="fs-3">${act.icon || "🌱"}</span>
                            <span class="badge bg-success-subtle text-success rounded-pill px-2 py-1 small">${act.category || "General"}</span>
                        </div>
                        <h5 class="fw-bold text-dark mb-2" style="font-size:1rem;">${act.title}</h5>
                        <p class="small text-muted mb-3" style="line-height:1.4; font-size:12px;">${act.description}</p>
                        
                        <div class="d-flex flex-wrap gap-2 mb-3">
                            <span class="badge bg-light text-dark border">🎯 ${act.targetDays || 30} Days</span>
                            <span class="badge bg-light text-success border">⭐ +${act.pointsPerDay || 10} pts/day</span>
                            <span class="badge bg-light text-primary border">🏆 +${act.bonusOnCompletion || 100} bonus</span>
                        </div>
                    </div>

                    <div class="pt-2 border-top">
                        <button type="button" class="btn btn-outline-success rounded-pill w-100 fw-bold py-2 btn-join-challenge" data-act-id="${actId}">
                            <i class="bi bi-play-fill me-1"></i> Start This Challenge
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join("");

    // Wire Join Buttons
    container.querySelectorAll(".btn-join-challenge").forEach(btn => {
        btn.addEventListener("click", async () => {
            if (!currentUserId) {
                alert("Please log in to join monthly challenges!");
                window.location.href = "../logins/login.html";
                return;
            }

            const actId = btn.dataset.actId;
            const actData = cachedMonthlyActivities[actId];
            if (!actData) return;

            btn.disabled = true;
            btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Joining...`;

            try {
                const initialUserAct = {
                    chosenAt: Date.now(),
                    streak: 0,
                    highestStreak: 0,
                    totalDaysCompleted: 0,
                    lastUploadDate: "",
                    status: "active",
                    title: actData.title,
                    icon: actData.icon || "🌱",
                    category: actData.category,
                    pointsPerDay: actData.pointsPerDay || 10,
                    targetDays: actData.targetDays || 30
                };

                await set(ref(db, `user_activities/${currentUserId}/${currentMonthKey}/${actId}`), initialUserAct);

                // Update cached copy & re-render
                cachedUserActivities[actId] = initialUserAct;
                renderStreakDashboardStats();
                renderActiveChallenges();
                renderAvailableChallenges();

                alert(`🎉 You started the '${actData.title}' challenge! Upload your proof daily to build your streak.`);
            } catch (err) {
                console.error("Join challenge error:", err);
                alert("Failed to join challenge: " + err.message);
                btn.disabled = false;
                btn.innerHTML = `<i class="bi bi-play-fill me-1"></i> Start This Challenge`;
            }
        });
    });
}

function renderProofUploadHistory() {
    const historySection = document.getElementById("history-section");
    const container = document.getElementById("user-upload-history-container");
    if (!historySection || !container || !currentUserId) return;

    let allUploads = [];
    Object.entries(cachedUserActivities || {}).forEach(([actId, act]) => {
        if (!act.uploads) return;
        Object.entries(act.uploads).forEach(([upId, u]) => {
            allUploads.push({
                actId,
                actTitle: act.title,
                actIcon: act.icon,
                upId,
                ...u
            });
        });
    });

    if (allUploads.length === 0) {
        historySection.style.display = "none";
        return;
    }

    historySection.style.display = "block";
    allUploads.sort((a, b) => (b.uploadedAt || 0) - (a.uploadedAt || 0));

    container.innerHTML = allUploads.slice(0, 6).map(u => {
        const isVid = isVideoUrl(u.mediaUrl) || u.mediaType === "video";
        const mediaMarkup = isVid
            ? `<video src="${u.mediaUrl}" controls class="proof-thumb mb-2"></video>`
            : `<img src="${u.mediaUrl}" class="proof-thumb mb-2" alt="Proof" onerror="this.src='../assets/logo.png'">`;

        let statusBadge = `<span class="badge bg-warning text-dark"><i class="bi bi-hourglass-split me-1"></i> Pending Verification</span>`;
        if (u.verified === true) statusBadge = `<span class="badge bg-success"><i class="bi bi-check-circle-fill me-1"></i> Verified</span>`;
        if (u.rejected === true) statusBadge = `<span class="badge bg-danger"><i class="bi bi-x-circle-fill me-1"></i> Rejected</span>`;

        return `
            <div class="col-6 col-md-4 col-xl-2">
                <div class="p-2 border rounded-4 bg-white h-100 d-flex flex-column justify-content-between">
                    <div>
                        ${mediaMarkup}
                        <div class="fw-bold small text-truncate mb-1" style="font-size:11px;">${u.actIcon || "🌱"} ${u.actTitle || "Challenge"}</div>
                        <div class="small text-muted mb-1" style="font-size:10px;">${u.date || "Past Day"}</div>
                    </div>
                    <div>
                        ${statusBadge}
                    </div>
                </div>
            </div>
        `;
    }).join("");
}

// -----------------------------------------------------------------
// Proof Upload Modal & Handlers
// -----------------------------------------------------------------
let selectedProofFile = null;
let proofModalInstance = null;

function setupProofUploadModal() {
    const modalEl = document.getElementById("uploadProofModal");
    if (!modalEl) return;

    if (window.bootstrap && window.bootstrap.Modal) {
        proofModalInstance = new window.bootstrap.Modal(modalEl);
    }

    const fileInput = document.getElementById("proof-file-input");
    const previewBox = document.getElementById("proof-media-preview-box");
    const geoToggle = document.getElementById("proof-geotag-toggle");
    const locationFeedback = document.getElementById("proof-location-feedback");
    const form = document.getElementById("proof-upload-form");
    const submitBtn = document.getElementById("btn-submit-proof");
    const progressContainer = document.getElementById("proof-upload-progress-container");
    const progressBar = document.getElementById("proof-upload-progress");

    // File Preview & Video Duration Check
    fileInput?.addEventListener("change", function () {
        selectedProofFile = this.files[0] || null;
        if (!selectedProofFile) {
            previewBox?.classList.add("d-none");
            return;
        }

        const isVideo = selectedProofFile.type.startsWith("video/");

        if (isVideo) {
            const videoElem = document.createElement("video");
            videoElem.preload = "metadata";
            videoElem.onloadedmetadata = function () {
                window.URL.revokeObjectURL(videoElem.src);
                if (videoElem.duration > 30) {
                    alert("⚠️ Video exceeds maximum length of 30 seconds. Please select a shorter video clip.");
                    fileInput.value = "";
                    selectedProofFile = null;
                    previewBox.classList.add("d-none");
                } else {
                    renderProofPreview(selectedProofFile, true);
                }
            };
            videoElem.src = URL.createObjectURL(selectedProofFile);
        } else {
            renderProofPreview(selectedProofFile, false);
        }
    });

    function renderProofPreview(file, isVid) {
        if (!previewBox) return;
        previewBox.classList.remove("d-none");
        const url = URL.createObjectURL(file);
        if (isVid) {
            previewBox.innerHTML = `<video src="${url}" controls class="w-100 rounded-3" style="max-height:220px; background:#0F172A;"></video>`;
        } else {
            previewBox.innerHTML = `<img src="${url}" class="w-100 rounded-3" style="max-height:300px; height:auto; object-fit:contain; background:#0b0f19;" alt="Proof Preview">`;
        }
    }

    // Optional Geolocation Capture
    geoToggle?.addEventListener("change", function () {
        if (this.checked) {
            if ("geolocation" in navigator) {
                if (locationFeedback) {
                    locationFeedback.classList.remove("d-none");
                    locationFeedback.innerText = "Requesting GPS coordinates...";
                }
                navigator.geolocation.getCurrentPosition(
                    (pos) => {
                        capturedLocation = {
                            lat: parseFloat(pos.coords.latitude.toFixed(5)),
                            lng: parseFloat(pos.coords.longitude.toFixed(5))
                        };
                        if (locationFeedback) {
                            locationFeedback.innerText = `✓ GPS Captured: ${capturedLocation.lat}, ${capturedLocation.lng}`;
                        }
                    },
                    (err) => {
                        console.warn("Geolocation error:", err);
                        capturedLocation = null;
                        if (locationFeedback) {
                            locationFeedback.innerText = "Could not fetch GPS. Optional tag skipped.";
                        }
                    },
                    { timeout: 8000 }
                );
            } else {
                capturedLocation = null;
                if (locationFeedback) locationFeedback.innerText = "Geolocation not supported.";
            }
        } else {
            capturedLocation = null;
            if (locationFeedback) locationFeedback.classList.add("d-none");
        }
    });

    // Form Submission
    form?.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!selectedProofFile) {
            alert("Please select an image or video file as proof.");
            return;
        }

        const actId = document.getElementById("proof-act-id").value;
        const caption = document.getElementById("proof-caption").value.trim();
        const todayStr = new Date().toISOString().split("T")[0];

        submitBtn.disabled = true;
        submitBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Uploading Proof...`;
        progressContainer?.classList.remove("d-none");

        try {
            // Upload to Cloudinary
            const cloudData = await uploadToCloudinaryDetailed(selectedProofFile, (pct) => {
                if (progressBar) progressBar.style.width = `${pct}%`;
            });

            const uploadPayload = {
                date: todayStr,
                mediaUrl: cloudData.secure_url,
                mediaType: cloudData.resource_type || (selectedProofFile.type.startsWith("video/") ? "video" : "image"),
                caption: caption || "",
                uploadedAt: Date.now(),
                verified: false,
                rejected: false
            };

            if (capturedLocation) {
                uploadPayload.location = capturedLocation;
            }

            // Push under user_activities/{userId}/{monthKey}/{actId}/uploads
            const uploadRef = push(ref(db, `user_activities/${currentUserId}/${currentMonthKey}/${actId}/uploads`));
            await set(uploadRef, uploadPayload);

            // Close modal & reset form
            form.reset();
            selectedProofFile = null;
            capturedLocation = null;
            previewBox?.classList.add("d-none");
            progressContainer?.classList.add("d-none");
            if (progressBar) progressBar.style.width = "0%";
            if (locationFeedback) locationFeedback.classList.add("d-none");

            if (proofModalInstance) proofModalInstance.hide();

            // Reload user activities
            await loadChallengesPage();

            alert("🎉 Daily task proof submitted successfully! Your streak will update as soon as URVI Admin verifies your upload.");

        } catch (err) {
            console.error("Proof submission error:", err);
            alert("Upload failed: " + err.message);
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = `<i class="bi bi-cloud-arrow-up-fill me-1"></i> Submit Proof for Verification`;
        }
    });
}

function openUploadModal(actId, actTitle) {
    document.getElementById("proof-act-id").value = actId;
    document.getElementById("proof-month-key").value = currentMonthKey;
    document.getElementById("uploadModalSubtitle").innerText = `Challenge: ${actTitle}`;
    document.getElementById("proof-file-input").value = "";
    document.getElementById("proof-caption").value = "";
    document.getElementById("proof-media-preview-box")?.classList.add("d-none");

    if (proofModalInstance) {
        proofModalInstance.show();
    }
}
