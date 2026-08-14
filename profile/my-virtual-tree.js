/* =====================================================
   URVI – my-virtual-tree.js | Realistic Living Virtual Tree Engine
   ===================================================== */
import { db, ref, get, child, update } from "../config.js";

/* ══════════════════════════════════════
   CONSTANTS — 10 Believable Tree Levels
   ══════════════════════════════════════ */
const TREE_LEVELS = [
    { level: 1,  xp: 0,    name: "Seed",               icon: "🌱", desc: "The journey begins. A fertile seed resting in rich earth, ready to take root.", image: "../assets/tree/level_1.jpg" },
    { level: 2,  xp: 250,  name: "Sprout",              icon: "🌿", desc: "First signs of growth. A tender green shoot emerges through the soil.", image: "../assets/tree/level_1.jpg" },
    { level: 3,  xp: 600,  name: "Young Sprout",        icon: "🌿", desc: "First true leaves appear, reaching toward the morning light with graceful strength.", image: "../assets/tree/level_3.jpg" },
    { level: 4,  xp: 1000, name: "Small Sapling",       icon: "🌳", desc: "A young wooden trunk and primary branches develop, establishing structure.", image: "../assets/tree/level_3.jpg" },
    { level: 5,  xp: 1500, name: "Sapling",             icon: "🌳", desc: "The tree begins to take shape with rich foliage layers and natural wood bark.", image: "../assets/tree/level_5.jpg" },
    { level: 6,  xp: 2200, name: "Young Tree",          icon: "🌳", desc: "Stronger trunk and a fuller canopy with deeper root foundations.", image: "../assets/tree/level_5.jpg" },
    { level: 7,  xp: 3000, name: "Growing Tree",        icon: "🌲", desc: "More branches and dense, flourishing foliage casting cool shade.", image: "../assets/tree/level_7.jpg" },
    { level: 8,  xp: 4000, name: "Strong Tree",         icon: "🌲", desc: "A healthy, established tree with rich foliage and early blossom buds.", image: "../assets/tree/level_7.jpg" },
    { level: 9,  xp: 5500, name: "Mature Tree",         icon: "🌺", desc: "A majestic mature tree alive with flowers, fruits, and visiting butterflies.", image: "../assets/tree/level_9.jpg" },
    { level: 10, xp: 7500, name: "URVI Guardian Tree",  icon: "🏆", desc: "Your complete URVI journey — a magnificent thriving ancient ecosystem of life, beauty, and purpose.", image: "../assets/tree/level_10.jpg" }
];

// Preload all level artwork images into memory for instant seamless cross-fading
const preloadedImages = {};
function preloadTreeArtworks() {
    TREE_LEVELS.forEach(lvl => {
        if (!preloadedImages[lvl.image]) {
            const img = new Image();
            img.src = lvl.image;
            preloadedImages[lvl.image] = img;
        }
    });
}
preloadTreeArtworks();

let activeGrowthAnimationId = null;
let activeParticleEmitterId = null;

/* ── Helpers ── */
function parseXP(val) {
    if (val === undefined || val === null) return 0;
    if (typeof val === "number") return isNaN(val) ? 0 : Math.round(val);
    const clean = String(val).replace(/[^0-9.-]/g, "");
    const parsed = parseFloat(clean);
    return isNaN(parsed) ? 0 : Math.round(parsed);
}

function extractTreeXP(user) {
    if (!user || typeof user !== "object") return 0;
    const candidates = [
        user.treeXP,
        user.tree_xp,
        user.treeXp,
        user.treexp,
        user.tree_XP,
        user.xp,
        user.XP,
        user.TreeXP
    ];
    for (const val of candidates) {
        if (val !== undefined && val !== null && val !== "") {
            const num = parseXP(val);
            if (!isNaN(num) && num > 0) return num;
        }
    }
    // If no explicit treeXP, fallback to points if positive
    if (user.points !== undefined && user.points !== null) {
        const p = parseXP(user.points);
        if (!isNaN(p) && p > 0) return p;
    }
    return 0;
}

function getLevelFromXP(xp) {
    let result = TREE_LEVELS[0];
    for (const lvl of TREE_LEVELS) {
        if (xp >= lvl.xp) result = lvl;
        else break;
    }
    return result;
}

function getNextLevel(currentLevel) {
    return TREE_LEVELS.find(l => l.level === currentLevel + 1) || null;
}

function getActiveUserId() {
    let raw = localStorage.getItem("urvi_logged_user");
    if (!raw || raw === "undefined" || raw === "null") {
        try {
            const ud = JSON.parse(localStorage.getItem("urvi_user_data") || "{}");
            raw = ud.user_id || ud.id || ud.uid || ud.email;
        } catch (e) { /* ignore */ }
    }
    return (raw && raw !== "undefined" && raw !== "null") ? String(raw).trim() : null;
}

/* ══════════════════════════════════════
   PAGE INITIALIZATION
   ══════════════════════════════════════ */
document.addEventListener("DOMContentLoaded", () => {
    const urlParams = new URLSearchParams(window.location.search);
    const viewUid = urlParams.get("uid");
    const activeUserId = getActiveUserId();

    if (viewUid && viewUid !== activeUserId) {
        // Public view
        loadTreePage(viewUid, false);
    } else if (activeUserId) {
        loadTreePage(activeUserId, true);
    } else {
        alert("Please log in to view your Virtual Tree.");
        window.location.href = "../logins/login.html";
    }
});

async function loadTreePage(uid, isOwner) {
    try {
        let userSnap = await get(child(ref(db), `users/${uid}`));
        let userData = userSnap.exists() ? userSnap.val() : null;

        // Fallback user lookup if handle / auth uid variant
        if (!userData) {
            const allUsersSnap = await get(child(ref(db), "users"));
            if (allUsersSnap.exists()) {
                const allU = allUsersSnap.val();
                const matchedKey = Object.keys(allU).find(k => {
                    const u = allU[k];
                    return k.toLowerCase() === uid.toLowerCase() ||
                           (u.user_id && u.user_id.toLowerCase() === uid.toLowerCase()) ||
                           (u.auth_uid && u.auth_uid === uid) ||
                           (u.email && u.email.toLowerCase() === uid.toLowerCase());
                });
                if (matchedKey) {
                    userData = allU[matchedKey];
                }
            }
        }

        if (!userData) {
            const cached = localStorage.getItem("urvi_user_data");
            if (cached) {
                try { userData = JSON.parse(cached); } catch (e) { /* ignore */ }
            }
        }

        if (!userData) {
            showError("This tree could not be found.");
            return;
        }

        try { localStorage.setItem("urvi_user_data", JSON.stringify(userData)); } catch (e) { /* ignore */ }

        const treeXP = extractTreeXP(userData);
        const levelData = getLevelFromXP(treeXP);
        const lastSeenLevel = userData.lastSeenTreeLevel || 0;

        // Load XP history (owner only)
        let historyEntries = [];
        if (isOwner) {
            const histSnap = await get(child(ref(db), `treeXPHistory/${uid}`));
            if (histSnap.exists()) {
                const raw = histSnap.val();
                historyEntries = Object.entries(raw)
                    .map(([k, v]) => ({ id: k, ...v }))
                    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            }
        }

        // Public view banner
        if (!isOwner) {
            showPublicBanner(userData, uid);
            document.getElementById("tree-history-section")?.classList.add("d-none");
            document.title = `${userData.firstName || uid}'s Virtual Tree | URVI`;
        }

        // Render static UI blocks
        renderLevelInfo(levelData);
        renderEcoStats(userData, treeXP);
        if (isOwner) renderHistory(historyEntries);

        // Hide loading, show content
        document.getElementById("tree-loading").classList.add("d-none");
        document.getElementById("tree-content").classList.remove("d-none");

        // Execute Smooth Realistic Time-Lapse Tree Growth
        playSmoothTreeGrowth(levelData.level, treeXP);

        // Wire "View Growth" button to replay the growth on demand
        const viewGrowthBtn = document.getElementById("btn-view-growth");
        if (viewGrowthBtn) {
            viewGrowthBtn.classList.remove("d-none");
            viewGrowthBtn.onclick = () => {
                playSmoothTreeGrowth(levelData.level, treeXP);
            };
        }

        // Save last seen level
        if (isOwner && levelData.level > lastSeenLevel) {
            await update(ref(db, `users/${uid}`), { lastSeenTreeLevel: levelData.level, treeLevel: levelData.level });
        }

    } catch (err) {
        console.error("Virtual Tree load error:", err);
        showError("Your tree is taking a moment to grow... Please try again.");
    }
}

function showError(msg) {
    const loading = document.getElementById("tree-loading");
    if (loading) {
        loading.innerHTML = `
            <div style="font-size:48px;">🌱</div>
            <p>${msg}</p>
            <button class="btn btn-sm btn-outline-success rounded-pill px-3 mt-2" onclick="location.reload()">Retry</button>
        `;
    }
}

function showPublicBanner(user, uid) {
    const banner = document.getElementById("public-view-banner");
    if (!banner) return;
    banner.classList.remove("d-none");

    const pic = user.profilePic && user.profilePic !== "default" && user.profilePic.length > 5
        ? user.profilePic
        : `https://ui-avatars.com/api/?name=${encodeURIComponent((user.firstName || "") + " " + (user.lastName || ""))}&background=22C55E&color=fff&size=80`;

    document.getElementById("public-avatar").src = pic;
    document.getElementById("public-name").textContent = `${user.firstName || ""} ${user.lastName || ""}`.trim() || uid;
    document.getElementById("public-handle").textContent = `@${user.user_id || uid}`;
}

/* ══════════════════════════════════════════════════════
   SMOOTH CONTINUOUS BOTANICAL GROWTH ENGINE
   ══════════════════════════════════════════════════════ */

/**
 * Executes a smooth, continuous growth animation with dual cross-dissolving surfaces,
 * vertical botanical scaling, an organic spore emitter, and 60fps counter interpolation.
 */
function playSmoothTreeGrowth(targetLevel, targetXP) {
    // Cancel any running animations
    if (activeGrowthAnimationId) cancelAnimationFrame(activeGrowthAnimationId);
    if (activeParticleEmitterId) cancelAnimationFrame(activeParticleEmitterId);

    const container = document.getElementById("tree-svg-container");
    if (!container) return;

    // Dual-surface stage with Canvas Particle Emitter
    container.innerHTML = `
        <div class="realistic-scene-canvas" id="realistic-tree-stage">
            <!-- Surface A (Primary) -->
            <div class="tree-surface-layer surface-a visible" id="tree-surface-a">
                <img src="${TREE_LEVELS[0].image}" class="tree-nature-img" alt="Virtual Tree Stage">
            </div>

            <!-- Surface B (Cross-Dissolve Layer) -->
            <div class="tree-surface-layer surface-b" id="tree-surface-b">
                <img src="${TREE_LEVELS[0].image}" class="tree-nature-img" alt="Virtual Tree Stage">
            </div>

            <!-- Atmospheric Lighting & Shaders -->
            <div class="tree-atmospheric-vignette"></div>
            <div class="tree-sunlight-bloom" id="tree-sunlight-bloom"></div>

            <!-- Continuous Botanical Spores Canvas -->
            <canvas id="growth-spores-canvas" class="growth-spores-canvas"></canvas>

            <!-- Final Living Overlays (mounted after growth finishes) -->
            <div class="tree-living-overlay" id="tree-living-overlay-container"></div>
        </div>
    `;

    const surfaceA = document.getElementById("tree-surface-a");
    const surfaceB = document.getElementById("tree-surface-b");
    const overlayEl = document.getElementById("tree-living-overlay-container");
    const canvas = document.getElementById("growth-spores-canvas");

    const numEl = document.getElementById("scene-level-num");
    const nameEl = document.getElementById("scene-level-name");
    const pillEl = document.getElementById("scene-xp-pill");
    const headerXpEl = document.getElementById("header-total-xp");
    const currentXpEl = document.getElementById("xp-current");
    const targetXpEl = document.getElementById("xp-target");
    const remainEl = document.getElementById("xp-remaining");
    const barEl = document.getElementById("xp-bar-fill");

    // Initialize Canvas Spores Emitter
    initGrowthSpores(canvas);

    // Timeline Configuration
    const stages = [];
    for (let l = 1; l <= targetLevel; l++) {
        stages.push({
            level: l,
            levelData: TREE_LEVELS[l - 1],
            xpTarget: l === targetLevel ? targetXP : TREE_LEVELS[l - 1].xp
        });
    }

    // Pacing: smooth cinematic pacing (4.0s - 4.8s total for 10 levels)
    const totalDuration = targetLevel === 1 ? 800 : Math.min(4800, Math.max(2800, targetLevel * 500));
    const startTime = performance.now();

    let activeSurface = "A"; // toggles between A and B for smooth overlapping cross-fades
    let currentRenderedStageIdx = 0;

    function renderStageSurface(stageIdx) {
        const stage = stages[stageIdx];
        if (!stage) return;

        const nextSurface = (activeSurface === "A") ? surfaceB : surfaceA;
        const currentSurface = (activeSurface === "A") ? surfaceA : surfaceB;

        const nextImg = nextSurface.querySelector("img");
        if (nextImg) {
            nextImg.src = stage.levelData.image;
        }

        // Apply smooth cross-fade with vertical growth scale
        nextSurface.classList.remove("fading-out");
        nextSurface.classList.add("visible", "morphing-grow");

        currentSurface.classList.remove("visible", "morphing-grow");
        currentSurface.classList.add("fading-out");

        activeSurface = (activeSurface === "A") ? "B" : "A";
        currentRenderedStageIdx = stageIdx;

        // Update stage label and highlighted timeline step
        if (numEl) numEl.textContent = `LEVEL ${stage.level}`;
        if (nameEl) nameEl.textContent = stage.levelData.name;
        renderTreeJourney(stage.level, stage.xpTarget);
    }

    // Render initial Level 1 stage
    renderStageSurface(0);

    function animationTick(now) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / totalDuration, 1);

        // Smooth cubic ease-out for fluid growth deceleration
        const ease = 1 - Math.pow(1 - progress, 3);
        const runningXP = Math.round(ease * targetXP);

        // Update real-time XP counters at 60fps
        if (pillEl) pillEl.textContent = `${runningXP.toLocaleString()} XP`;
        if (headerXpEl) headerXpEl.textContent = runningXP.toLocaleString();
        if (currentXpEl) currentXpEl.textContent = runningXP.toLocaleString();

        // Check which stage we should be displaying based on runningXP
        const currentLevelData = getLevelFromXP(runningXP);
        const targetStageIdx = Math.min(currentLevelData.level - 1, stages.length - 1);

        if (targetStageIdx > currentRenderedStageIdx) {
            renderStageSurface(targetStageIdx);
        }

        // Update Progress Bar
        const currentNextLevel = getNextLevel(currentLevelData.level);
        if (currentNextLevel) {
            if (targetXpEl) targetXpEl.textContent = currentNextLevel.xp.toLocaleString();
            const remaining = Math.max(currentNextLevel.xp - runningXP, 0);
            if (remainEl) remainEl.textContent = `${remaining.toLocaleString()} XP to next growth`;
            const pct = Math.min(((runningXP - currentLevelData.xp) / (currentNextLevel.xp - currentLevelData.xp)) * 100, 100);
            if (barEl) barEl.style.width = `${Math.max(pct, 3)}%`;
        } else {
            if (targetXpEl) targetXpEl.textContent = "7,500+";
            if (remainEl) remainEl.textContent = "🏆 Maximum URVI Guardian Tree reached!";
            if (barEl) barEl.style.width = "100%";
        }

        if (progress < 1) {
            activeGrowthAnimationId = requestAnimationFrame(animationTick);
        } else {
            // Growth Completed: Settle into Final Idle State
            finalizeGrowthState(targetLevel, targetXP);
        }
    }

    activeGrowthAnimationId = requestAnimationFrame(animationTick);

    function finalizeGrowthState(finalLevel, finalXP) {
        const finalLevelData = TREE_LEVELS[finalLevel - 1] || TREE_LEVELS[0];

        // Ensure final stage image is fully visible
        const currentSurface = (activeSurface === "A") ? surfaceA : surfaceB;
        const otherSurface = (activeSurface === "A") ? surfaceB : surfaceA;

        currentSurface.querySelector("img").src = finalLevelData.image;
        currentSurface.className = "tree-surface-layer visible settled-idle";
        otherSurface.className = "tree-surface-layer";

        // Final UI Settle
        renderLevelInfo(finalLevelData);
        renderTreeJourney(finalLevel, finalXP);

        // Mount Living Environmental Overlays (butterflies, soaring birds, volumetric sunbeams)
        if (overlayEl) {
            overlayEl.innerHTML = generateLivingOverlayHTML(finalLevel);
        }

        // Stop continuous heavy particle generation after 1.5s and leave gentle ambient motes
        setTimeout(() => {
            if (activeParticleEmitterId) {
                cancelAnimationFrame(activeParticleEmitterId);
                activeParticleEmitterId = null;
            }
            if (canvas) {
                const ctx = canvas.getContext("2d");
                ctx?.clearRect(0, 0, canvas.width, canvas.height);
            }
        }, 1500);
    }
}

/** Continuous Luminous Nature Spores Canvas Animation */
function initGrowthSpores(canvas) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = canvas.offsetWidth || 700;
    canvas.height = canvas.offsetHeight || 460;

    const spores = [];
    const sporeColors = ["#86EFAC", "#4ADE80", "#FEF08A", "#22C55E", "#FDE047"];

    for (let i = 0; i < 40; i++) {
        spores.push({
            x: canvas.width * 0.25 + Math.random() * canvas.width * 0.5,
            y: canvas.height * 0.7 + Math.random() * (canvas.height * 0.25),
            radius: 1.2 + Math.random() * 2.4,
            speedY: 1.2 + Math.random() * 2.2,
            speedX: (Math.random() - 0.5) * 1.4,
            opacity: 0.2 + Math.random() * 0.8,
            color: sporeColors[Math.floor(Math.random() * sporeColors.length)]
        });
    }

    function renderSpores() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        spores.forEach(s => {
            s.y -= s.speedY;
            s.x += s.speedX + Math.sin(s.y * 0.05) * 0.4;
            s.opacity -= 0.003;

            if (s.y < 40 || s.opacity <= 0) {
                s.y = canvas.height * 0.75 + Math.random() * 40;
                s.x = canvas.width * 0.25 + Math.random() * canvas.width * 0.5;
                s.opacity = 0.4 + Math.random() * 0.6;
            }

            ctx.beginPath();
            ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
            ctx.fillStyle = s.color;
            ctx.globalAlpha = Math.max(s.opacity, 0);
            ctx.shadowBlur = 8;
            ctx.shadowColor = s.color;
            ctx.fill();
        });

        activeParticleEmitterId = requestAnimationFrame(renderSpores);
    }

    activeParticleEmitterId = requestAnimationFrame(renderSpores);
}

/** Generate dynamic living overlay elements for the current level */
function generateLivingOverlayHTML(level) {
    return `
        <!-- Volumetric Sunbeams -->
        <div class="living-sunbeam sunbeam-1"></div>
        <div class="living-sunbeam sunbeam-2"></div>

        <!-- Ambient Floating Pollen / Light Motes -->
        <div class="living-motes-layer">
            <div class="mote mote-1"></div>
            <div class="mote mote-2"></div>
            <div class="mote mote-3"></div>
            <div class="mote mote-4"></div>
            <div class="mote mote-5"></div>
            <div class="mote mote-6"></div>
            <div class="mote mote-7"></div>
            <div class="mote mote-8"></div>
        </div>

        <!-- Floating Petals (Levels 8-9) -->
        ${level >= 8 ? `
        <div class="living-petals-layer">
            <div class="petal petal-1"></div>
            <div class="petal petal-2"></div>
            <div class="petal petal-3"></div>
            <div class="petal petal-4"></div>
        </div>
        ` : ""}

        <!-- Fluttering Butterflies (Levels 9-10) -->
        ${level >= 9 ? `
        <div class="living-butterflies-layer">
            <div class="live-butterfly butterfly-1">
                <div class="b-wing left"></div>
                <div class="b-wing right"></div>
            </div>
            <div class="live-butterfly butterfly-2">
                <div class="b-wing left"></div>
                <div class="b-wing right"></div>
            </div>
        </div>
        ` : ""}

        <!-- Soaring Sky Bird (Level 10) -->
        ${level >= 10 ? `
        <div class="living-bird-layer">
            <div class="live-sky-bird"></div>
        </div>
        ` : ""}
    `;
}

/* ══════════════════════════════════════
   UI RENDERERS & DATA BINDING
   ══════════════════════════════════════ */

function renderLevelInfo(levelData) {
    const iconEl = document.getElementById("level-info-icon");
    const headEl = document.getElementById("level-info-heading");
    const stageEl = document.getElementById("level-info-stage");
    const descEl = document.getElementById("level-info-desc");

    if (iconEl) iconEl.textContent = levelData.icon;
    if (headEl) headEl.textContent = `LEVEL ${levelData.level}`;
    if (stageEl) stageEl.textContent = levelData.name;
    if (descEl) descEl.textContent = levelData.desc;
}

function renderTreeJourney(currentLevel, currentXP) {
    const list = document.getElementById("journey-timeline");
    if (!list) return;

    list.innerHTML = TREE_LEVELS.map(lvl => {
        let nodeClass, icon, xpTag;
        if (lvl.level < currentLevel) {
            nodeClass = "completed";
            icon = '<i class="bi bi-check-lg"></i>';
            xpTag = `<div class="journey-xp-tag">${lvl.xp.toLocaleString()} XP</div>`;
        } else if (lvl.level === currentLevel) {
            nodeClass = "current";
            icon = lvl.level;
            const next = getNextLevel(lvl.level);
            const targetText = next ? `${next.xp.toLocaleString()} XP` : "MAX";
            xpTag = `<div class="journey-xp-tag">${(currentXP || 0).toLocaleString()} / ${targetText}</div>`;
        } else {
            nodeClass = "locked";
            icon = '<i class="bi bi-lock-fill"></i>';
            const remaining = lvl.xp - (currentXP || 0);
            xpTag = `<div class="journey-xp-tag remaining">${remaining.toLocaleString()} XP to unlock</div>`;
        }
        const titleClass = nodeClass === "locked" ? "journey-title locked-title" : "journey-title";

        return `
            <li class="journey-step">
                <div class="journey-node ${nodeClass}">${icon}</div>
                <div class="journey-info">
                    <div class="${titleClass}">Level ${lvl.level} — ${lvl.name}</div>
                    ${xpTag}
                </div>
            </li>
        `;
    }).join("");
}

function renderEcoStats(user, treeXP) {
    const grid = document.getElementById("eco-stats-grid");
    if (!grid) return;

    const stats = [
        { icon: "⭐", value: (treeXP || 0).toLocaleString(), label: "Tree XP" },
        { icon: "✨", value: (user.points || 0).toLocaleString(), label: "Eco Points" },
        { icon: "🌳", value: (user.trees_planted || 0).toLocaleString(), label: "Trees Planted" },
        { icon: "🤝", value: (user.contributions || 0).toLocaleString(), label: "Contributions" },
        { icon: "📜", value: "—", label: "Certificates" }
    ];

    grid.innerHTML = stats.map(s => `
        <div class="eco-stat-card">
            <span class="stat-icon">${s.icon}</span>
            <span class="stat-value">${s.value}</span>
            <span class="stat-label">${s.label}</span>
        </div>
    `).join("");

    // Async: load certificate count
    loadCertificateCount(user.user_id || getActiveUserId()).then(count => {
        const certCard = grid.querySelectorAll(".eco-stat-card")[4];
        if (certCard) certCard.querySelector(".stat-value").textContent = count.toLocaleString();
    });
}

async function loadCertificateCount(uid) {
    try {
        const certSnap = await get(child(ref(db), `certificates/${uid}`));
        if (!certSnap.exists()) return 0;
        return Object.keys(certSnap.val()).length;
    } catch { return 0; }
}

function renderHistory(entries) {
    const list = document.getElementById("history-list");
    const section = document.getElementById("tree-history-section");
    if (!list || !section) return;

    if (!entries || entries.length === 0) {
        list.innerHTML = `<li class="history-empty">No tree growth events yet. Start participating in URVI activities to earn Tree XP!</li>`;
        return;
    }

    const INITIAL_SHOW = 8;
    const renderItems = (items) => items.map(e => {
        const date = e.createdAt ? new Date(e.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
        return `
            <li class="history-item">
                <span class="history-xp-badge">+${e.xp} XP</span>
                <span class="history-desc">${e.description || e.type || "Tree XP"}</span>
                <span class="history-date">${date}</span>
            </li>
        `;
    }).join("");

    list.innerHTML = renderItems(entries.slice(0, INITIAL_SHOW));

    if (entries.length > INITIAL_SHOW) {
        const btn = document.createElement("button");
        btn.className = "history-view-all";
        btn.textContent = `View All (${entries.length} events)`;
        btn.addEventListener("click", () => {
            list.innerHTML = renderItems(entries);
        });
        section.appendChild(btn);
    }
}

/* ══════════════════════════════════════
   EXPORT
   ══════════════════════════════════════ */
export { TREE_LEVELS, getLevelFromXP, parseXP, extractTreeXP, playSmoothTreeGrowth };
