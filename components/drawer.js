/* =====================================================
   URVI – drawer.js | Instagram-Style Mobile Navigation, 
   Profile Action Sheet, Language Switcher & Desktop Sync
   ===================================================== */
import { db, ref, get, child } from "../config.js";

const CURRENT_LANG_KEY = "urvi_lang_pref";

document.addEventListener("DOMContentLoaded", () => {
    initInstagramBottomNav();
    initProfileMobileMenu();
    initFallbackRoutes();
    syncSidebarProfileBox();
    injectRightVineDecoration();
    ensureTranslatorLoaded();
});

/**
 * 1. INSTAGRAM-STYLE MOBILE BOTTOM NAVIGATION BAR
 * 5 Slots:
 *  1. Help / Support (Green icon)
 *  2. Activities (Green icon)
 *  3. (Main) Home or Community (Elevated Green Circle, White Icon)
 *  4. Impact (Green icon)
 *  5. Profile (Green icon / Avatar)
 * Strictly visible on mobile view only (hidden on desktop >= 992px)
 */
function initInstagramBottomNav() {
    if (document.getElementById("urvi-instagram-bottom-nav")) return;

    const path = window.location.pathname;
    const isRoot = path.endsWith("index.html") || path.endsWith("/");
    const basePath = isRoot ? "" : "../";

    const isHelp = false;
    const isActivities = path.includes("activities");
    const isMobileNav = (window.matchMedia && window.matchMedia("(max-width: 991.98px)").matches) || window.innerWidth <= 991.98;
    const isCommunity = path.includes("community") || (isRoot && isMobileNav);
    const isImpact = path.includes("impact");
    const isProfile = (path.includes("profile/profile.html") || path.endsWith("/profile.html")) && !path.includes("user-profile");

    // Dynamic user avatar for slot 5 if cached AND matches active logged-in user
    let userAvatarUrl = null;
    const activeUserId = localStorage.getItem("urvi_logged_user");
    const cachedUserData = localStorage.getItem("urvi_user_data");
    if (cachedUserData && activeUserId) {
        try {
            const u = JSON.parse(cachedUserData);
            const matchesActive = !u.user_id ||
                u.user_id.toLowerCase() === activeUserId.toLowerCase() ||
                (u.auth_uid && u.auth_uid === activeUserId) ||
                (u.email && u.email.toLowerCase() === activeUserId.toLowerCase()) ||
                activeUserId.toLowerCase() === "urvi.earth";

            if (matchesActive && u && u.profilePic && u.profilePic.length > 5 && u.profilePic !== "default") {
                userAvatarUrl = u.profilePic;
            } else if (!matchesActive) {
                localStorage.removeItem("urvi_user_data");
            }
        } catch (e) { /* ignore */ }
    }

    const navHtml = `
        <nav class="urvi-instagram-bottom-nav d-lg-none" id="urvi-instagram-bottom-nav" aria-label="Mobile Navigation">
            <!-- 1. Help & Support -->
            <button type="button" class="insta-nav-tab ${isHelp ? 'active' : ''}" id="insta-tab-support" aria-label="Help and Support">
                <i class="bi bi-headset insta-tab-icon"></i>
                <span class="insta-tab-label">Support</span>
            </button>

            <!-- 2. Activities -->
            <a href="${basePath}activities/activities.html" class="insta-nav-tab ${isActivities ? 'active' : ''}" id="insta-tab-activities" aria-label="Activities">
                <i class="bi ${isActivities ? 'bi-compass-fill' : 'bi-compass'} insta-tab-icon"></i>
                <span class="insta-tab-label">Activities</span>
            </a>

            <!-- 3. (Main) Home / Community - Elevated Green Background, White Icon -->
            <a href="${basePath}community/community.html" class="insta-nav-tab insta-nav-tab-main ${isCommunity ? 'active' : ''}" id="insta-tab-home" aria-label="Community Feed">
                <div class="insta-main-circle">
                    <i class="bi bi-people-fill"></i>
                </div>
                <span class="insta-tab-label insta-main-label">Community</span>
            </a>

            <!-- 4. Impact -->
            <a href="${basePath}impact/impact.html" class="insta-nav-tab ${isImpact ? 'active' : ''}" id="insta-tab-impact" aria-label="Impact">
                <i class="bi ${isImpact ? 'bi-bullseye' : 'bi-bullseye'} insta-tab-icon"></i>
                <span class="insta-tab-label">Impact</span>
            </a>

            <!-- 5. Profile -->
            <a href="${basePath}profile/profile.html" class="insta-nav-tab ${isProfile ? 'active' : ''}" id="insta-tab-profile" aria-label="Profile">
                ${userAvatarUrl 
                    ? `<img src="${userAvatarUrl}" class="insta-tab-avatar ${isProfile ? 'active-avatar' : ''}" alt="Profile">`
                    : `<i class="bi ${isProfile ? 'bi-person-circle' : 'bi-person'} insta-tab-icon"></i>`
                }
                <span class="insta-tab-label">Profile</span>
            </a>
        </nav>
    `;

    document.body.insertAdjacentHTML("beforeend", navHtml);

    // Support trigger
    document.getElementById("insta-tab-support")?.addEventListener("click", (e) => {
        e.preventDefault();
        if (typeof window.openUrviSupportModal === "function") {
            window.openUrviSupportModal();
        } else {
            const supportLink = document.querySelector('a[onclick*="openUrviSupportModal"]');
            if (supportLink) supportLink.click();
            else alert("Help & Support: Please reach out to support@urvi.earth");
        }
    });

    // Community tab: Smooth scroll to top when already on Community page (prevents unnecessary reloads)
    const communityTab = document.getElementById("insta-tab-home");
    if (communityTab && path.includes("community")) {
        communityTab.addEventListener("click", (e) => {
            e.preventDefault();
            window.scrollTo({ top: 0, behavior: "smooth" });
        });
    }

    // Inject Navigation & Action Sheet Styles
    injectInstagramNavStyles();
}

/**
 * 2. PROFILE SECTION MOBILE MENU (Top Right ☰ Menu Button & Slide-up Sheet)
 * On mobile view on profile.html, this adds the top-right menu button and 
 * an Instagram-style slide-up action sheet with "My Certificates" and "My Virtual Tree".
 */
function initProfileMobileMenu() {
    const path = window.location.pathname;
    const isProfilePage = path.includes("profile/profile.html") || path.endsWith("/profile.html");
    if (!isProfilePage) return;

    const isRoot = path.endsWith("index.html") || path.endsWith("/");
    const basePath = isRoot ? "" : "../";
    const currentLang = localStorage.getItem(CURRENT_LANG_KEY) || "en";

    // 1. Inject Instagram-Style Profile Action Sheet
    if (!document.getElementById("urvi-profile-sheet-overlay")) {
        const sheetHtml = `
            <div id="urvi-profile-sheet-overlay" class="profile-sheet-overlay"></div>
            <div id="urvi-profile-action-sheet" class="profile-action-sheet" role="dialog" aria-modal="true" aria-label="Profile Options">
                <div class="sheet-drag-handle"></div>
                <div class="sheet-header">
                    <h6 class="sheet-title m-0 fw-bold">Menu & Settings</h6>
                    <button type="button" id="profile-sheet-close-btn" class="sheet-close-btn" aria-label="Close menu">&times;</button>
                </div>
                <div class="sheet-menu-list">
                    <!-- 1. Settings > Edit Profile or Change Password -->
                    <div class="sheet-menu-item" id="sheet-open-settings-btn" style="cursor:pointer;">
                        <div class="sheet-icon-wrap" style="background:#F0FDF4; color:#16A34A;">
                            <i class="bi bi-gear-fill"></i>
                        </div>
                        <div class="sheet-item-text">
                            <span class="sheet-item-title">Settings & Security</span>
                            <small class="sheet-item-desc">Edit profile details, change password & privacy</small>
                        </div>
                        <i class="bi bi-chevron-right sheet-arrow"></i>
                    </div>

                    <!-- 2. My Certificates -->
                    <a href="${basePath}profile/mycertificates.html" class="sheet-menu-item">
                        <div class="sheet-icon-wrap" style="background:#ECFDF5; color:#10B981;">
                            <i class="bi bi-award-fill"></i>
                        </div>
                        <div class="sheet-item-text">
                            <span class="sheet-item-title">My Certificates</span>
                            <small class="sheet-item-desc">View verified credentials & achievements</small>
                        </div>
                        <i class="bi bi-chevron-right sheet-arrow"></i>
                    </a>

                    <!-- 3. My Virtual Tree -->
                    <a href="${basePath}profile/my-virtual-tree.html" class="sheet-menu-item">
                        <div class="sheet-icon-wrap" style="background:#F0FDF4; color:#16A34A;">
                            <i class="bi bi-tree-fill"></i>
                        </div>
                        <div class="sheet-item-text">
                            <span class="sheet-item-title">My Virtual Tree</span>
                            <small class="sheet-item-desc">Track real-time XP, level & foliage growth</small>
                        </div>
                        <i class="bi bi-chevron-right sheet-arrow"></i>
                    </a>

                    <!-- 4. Language Switcher in Sheet -->
                    <div class="sheet-menu-item" id="sheet-lang-toggle-btn" style="cursor:pointer;">
                        <div class="sheet-icon-wrap" style="background:#FEF3C7; color:#D97706;">
                            <i class="bi bi-translate"></i>
                        </div>
                        <div class="sheet-item-text flex-grow-1">
                            <span class="sheet-item-title">Language / భాష</span>
                            <small class="sheet-item-desc">${currentLang === 'en' ? 'English (Switch to తెలుగు)' : 'తెలుగు (Switch to EN)'}</small>
                        </div>
                        <span class="badge bg-light text-dark border px-2 py-1 fw-bold" style="font-size:11px;">
                            ${currentLang === 'en' ? 'EN' : 'తెలుగు'}
                        </span>
                    </div>

                    <div class="sheet-menu-divider"></div>

                    <!-- 5. Logout -->
                    <button type="button" class="sheet-menu-item sheet-logout-item w-100 text-start" id="sheet-logout-btn">
                        <div class="sheet-icon-wrap" style="background:#FEE2E2; color:#EF4444;">
                            <i class="bi bi-box-arrow-right"></i>
                        </div>
                        <div class="sheet-item-text">
                            <span class="sheet-item-title text-danger">Logout</span>
                            <small class="sheet-item-desc">Sign out of this device</small>
                        </div>
                    </button>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML("beforeend", sheetHtml);
    }

    const overlay = document.getElementById("urvi-profile-sheet-overlay");
    const sheet = document.getElementById("urvi-profile-action-sheet");
    const closeBtn = document.getElementById("profile-sheet-close-btn");

    function openSheet() {
        document.body.classList.add("sheet-open");
        overlay?.classList.add("active");
        sheet?.classList.add("active");
    }

    function closeSheet() {
        document.body.classList.remove("sheet-open");
        overlay?.classList.remove("active");
        sheet?.classList.remove("active");
    }

    window.openUrviProfileMenu = openSheet;
    window.closeUrviProfileMenu = closeSheet;

    overlay?.addEventListener("click", closeSheet);
    closeBtn?.addEventListener("click", closeSheet);

    // Open Settings & Security Dialog Modal
    document.getElementById("sheet-open-settings-btn")?.addEventListener("click", () => {
        closeSheet();
        const modalEl = document.getElementById("profileSettingsModal");
        if (modalEl && window.bootstrap) {
            const modal = window.bootstrap.Modal.getOrCreateInstance(modalEl);
            modal.show();
        } else if (typeof window.openProfileSettingsDialog === "function") {
            window.openProfileSettingsDialog();
        }
    });

    document.getElementById("sheet-lang-toggle-btn")?.addEventListener("click", toggleLanguageState);

    document.getElementById("sheet-logout-btn")?.addEventListener("click", () => {
        if (confirm("Are you sure you want to log out of URVI?")) {
            localStorage.removeItem("urvi_logged_user");
            localStorage.removeItem("urvi_user_data");
            window.location.href = `${basePath}logins/login.html`;
        }
    });

    // 2. Attach Top-Right Menu Button in Profile Header
    attachProfileTopRightMenuBtn(openSheet);
}

function attachProfileTopRightMenuBtn(openSheetFn) {
    let btn = document.getElementById("btn-profile-mobile-menu");
    if (!btn) {
        const notifWrapper = document.querySelector(".profile-wrapper .notification-wrapper");
        const headerParent = notifWrapper?.parentElement || document.querySelector(".profile-wrapper > .d-flex") || document.querySelector(".profile-wrapper");

        btn = document.createElement("button");
        btn.type = "button";
        btn.id = "btn-profile-mobile-menu";
        btn.className = "insta-profile-menu-btn";
        btn.setAttribute("aria-label", "Profile Menu");
        btn.setAttribute("title", "Options");
        btn.innerHTML = `<i class="bi bi-list"></i>`;

        if (notifWrapper && notifWrapper.parentElement) {
            notifWrapper.parentElement.appendChild(btn);
        } else if (headerParent) {
            headerParent.appendChild(btn);
        }
    }
    btn.onclick = openSheetFn;
}

/**
 * 3. STYLES: Instagram Bottom Navigation & Slide-Up Sheet
 */
function injectInstagramNavStyles() {
    if (document.getElementById("urvi-insta-nav-styles")) return;

    const style = document.createElement("style");
    style.id = "urvi-insta-nav-styles";
    style.textContent = `
        /* Hide old drawer hamburger button & old bottom nav */
        .mobile-hamburger-btn { display: none !important; }
        .bottom-nav, #bottom-nav { display: none !important; }

        /* =====================================================
           INSTAGRAM MOBILE BOTTOM NAVIGATION BAR
           White background, Green icons, Raised Green Center Button
           ===================================================== */
        .urvi-instagram-bottom-nav {
            position: fixed !important;
            bottom: 0 !important;
            left: 0 !important;
            right: 0 !important;
            width: 100% !important;
            height: 62px !important;
            background: #FFFFFF !important;
            border-top: 1px solid rgba(0, 0, 0, 0.08) !important;
            box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.05) !important;
            display: flex !important;
            justify-content: space-around !important;
            align-items: center !important;
            z-index: 10000 !important;
            padding: 0 4px !important;
            padding-bottom: env(safe-area-inset-bottom, 0px) !important;
        }

        /* Desktop view: Completely hidden */
        @media (min-width: 992px) {
            .urvi-instagram-bottom-nav {
                display: none !important;
            }
        }

        /* Add safe bottom padding to page container so nothing is hidden */
        @media (max-width: 991.98px) {
            body {
                padding-bottom: 72px !important;
            }
            .community-container, .main-content, .profile-wrapper, .dashboard-container {
                padding-bottom: 80px !important;
            }
        }

        /* Nav Tabs */
        .insta-nav-tab {
            flex: 1 !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: center !important;
            text-decoration: none !important;
            background: transparent !important;
            border: none !important;
            padding: 4px 0 !important;
            cursor: pointer !important;
            position: relative !important;
            transition: transform 0.15s ease !important;
            -webkit-tap-highlight-color: transparent !important;
        }

        .insta-nav-tab:active {
            transform: scale(0.92) !important;
        }

        /* Default Inactive Tab: Clean Muted Gray (#64748B) */
        .insta-tab-icon {
            font-size: 21px !important;
            color: #64748B !important;
            line-height: 1 !important;
            display: block !important;
            transition: color 0.2s ease, transform 0.2s ease !important;
        }

        .insta-tab-label {
            font-size: 9.5px !important;
            font-weight: 500 !important;
            color: #64748B !important;
            margin-top: 3px !important;
            line-height: 1 !important;
            letter-spacing: -0.2px !important;
            transition: color 0.2s ease, font-weight 0.2s ease !important;
        }

        /* Active Tab: Vibrant URVI Green (#16A34A), Bold Label, No Dot! */
        .insta-nav-tab.active .insta-tab-icon {
            color: #16A34A !important;
            transform: scale(1.1) !important;
        }

        .insta-nav-tab.active .insta-tab-label {
            color: #16A34A !important;
            font-weight: 700 !important;
        }

        /* Completely Remove the Green Indicator Dot */
        .insta-nav-tab.active::after,
        .insta-nav-tab::after {
            display: none !important;
            content: none !important;
        }

        /* Profile Mini Avatar */
        .insta-tab-avatar {
            width: 24px !important;
            height: 24px !important;
            border-radius: 50% !important;
            object-fit: cover !important;
            border: 1.5px solid #CBD5E1 !important;
            display: block !important;
            transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease !important;
        }

        .insta-nav-tab.active .insta-tab-avatar,
        .insta-tab-avatar.active-avatar {
            border: 2px solid #16A34A !important;
            box-shadow: 0 0 0 2px rgba(22, 163, 74, 0.25) !important;
            transform: scale(1.08) !important;
        }

        /* 3. CENTER MAIN TAB (Home / Community)
           Elevated button: Gray when inactive, Vibrant Green gradient when active */
        .insta-nav-tab-main {
            position: relative !important;
            top: -12px !important;
        }

        .insta-main-circle {
            width: 48px !important;
            height: 48px !important;
            border-radius: 50% !important;
            background: #F1F5F9 !important;
            border: 3.5px solid #FFFFFF !important;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08) !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            color: #64748B !important;
            font-size: 22px !important;
            transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
        }

        .insta-nav-tab-main:hover .insta-main-circle,
        .insta-nav-tab-main.active .insta-main-circle {
            background: linear-gradient(135deg, #22C55E 0%, #16A34A 100%) !important;
            color: #FFFFFF !important;
            transform: scale(1.08) !important;
            box-shadow: 0 8px 22px rgba(22, 163, 74, 0.55) !important;
        }

        .insta-nav-tab-main.active::after {
            display: none !important;
        }

        .insta-main-label {
            margin-top: 1px !important;
            font-weight: 500 !important;
            color: #64748B !important;
        }

        .insta-nav-tab-main.active .insta-main-label {
            color: #16A34A !important;
            font-weight: 700 !important;
        }

        /* =====================================================
           PROFILE TOP-RIGHT MENU BUTTON & ACTION SHEET
           ===================================================== */
        .insta-profile-menu-btn {
            font-size: 26px !important;
            color: #16A34A !important;
            line-height: 1 !important;
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            cursor: pointer !important;
            margin-left: 10px !important;
            padding: 4px !important;
            transition: transform 0.2s ease !important;
        }

        .insta-profile-menu-btn:active {
            transform: scale(0.9) !important;
        }

        .profile-sheet-overlay {
            position: fixed; inset: 0;
            background: rgba(15, 23, 42, 0.55);
            backdrop-filter: blur(4px);
            z-index: 10001;
            opacity: 0; visibility: hidden;
            transition: opacity 0.3s ease, visibility 0.3s ease;
        }

        .profile-sheet-overlay.active {
            opacity: 1; visibility: visible;
        }

        .profile-action-sheet {
            position: fixed !important;
            top: 0 !important;
            right: 0 !important;
            bottom: 0 !important;
            width: 310px !important;
            max-width: 86vw !important;
            height: 100vh !important;
            background: #FFFFFF !important;
            border-radius: 24px 0 0 24px !important;
            z-index: 10002 !important;
            padding: 24px 18px !important;
            box-shadow: -10px 0 40px rgba(0, 0, 0, 0.18) !important;
            transform: translateX(100%) !important;
            transition: transform 0.32s cubic-bezier(0.32, 0.72, 0, 1) !important;
            overflow-y: auto !important;
            display: flex !important;
            flex-direction: column !important;
        }

        .profile-action-sheet.active {
            transform: translateX(0) !important;
        }

        .sheet-drag-handle {
            display: none !important;
        }

        .sheet-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 16px;
            padding-bottom: 10px;
            border-bottom: 1px solid #F1F5F9;
        }

        .sheet-title {
            color: #0F172A;
            font-size: 16px;
            letter-spacing: -0.2px;
        }

        .sheet-close-btn {
            background: #F1F5F9;
            border: none;
            width: 28px; height: 28px;
            border-radius: 50%;
            font-size: 18px;
            color: #64748B;
            display: flex; align-items: center; justify-content: center;
            cursor: pointer;
        }

        .sheet-menu-list {
            display: flex;
            flex-direction: column;
            gap: 6px;
        }

        .sheet-menu-item {
            display: flex;
            align-items: center;
            gap: 14px;
            padding: 12px 14px;
            border-radius: 16px;
            text-decoration: none;
            color: #1E293B;
            background: transparent;
            border: none;
            transition: background 0.2s ease;
        }

        .sheet-menu-item:hover, .sheet-menu-item:active {
            background: #F8FAFC;
        }

        .sheet-icon-wrap {
            width: 40px; height: 40px;
            border-radius: 12px;
            display: flex; align-items: center; justify-content: center;
            font-size: 18px;
            flex-shrink: 0;
        }

        .sheet-item-text {
            flex-grow: 1;
            display: flex;
            flex-direction: column;
            min-width: 0;
        }

        .sheet-item-title {
            font-size: 14px;
            font-weight: 600;
            color: #0F172A;
            line-height: 1.3;
        }

        .sheet-item-desc {
            font-size: 11px;
            color: #64748B;
            line-height: 1.3;
        }

        .sheet-arrow {
            font-size: 14px;
            color: #94A3B8;
        }

        .sheet-menu-divider {
            height: 1px;
            background: #F1F5F9;
            margin: 8px 0;
        }

        /* =====================================================
           DARK MODE SUPPORT
           ===================================================== */
        [data-theme="dark"] .urvi-instagram-bottom-nav {
            background: #0F172A !important;
            border-top: 1px solid rgba(255, 255, 255, 0.08) !important;
            box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.3) !important;
        }

        [data-theme="dark"] .insta-tab-icon {
            color: #34D399 !important;
        }

        [data-theme="dark"] .insta-tab-label {
            color: #34D399 !important;
        }

        [data-theme="dark"] .insta-main-circle {
            border-color: #0F172A !important;
            background: linear-gradient(135deg, #10B981 0%, #059669 100%) !important;
        }

        [data-theme="dark"] .profile-action-sheet {
            background: #1E293B !important;
            box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.5) !important;
        }

        [data-theme="dark"] .sheet-title,
        [data-theme="dark"] .sheet-item-title {
            color: #F1F5F9 !important;
        }

        [data-theme="dark"] .sheet-header,
        [data-theme="dark"] .sheet-menu-divider {
            border-color: rgba(255, 255, 255, 0.08) !important;
        }

        [data-theme="dark"] .sheet-menu-item:hover,
        [data-theme="dark"] .sheet-menu-item:active {
            background: rgba(255, 255, 255, 0.05) !important;
        }

        [data-theme="dark"] .sheet-close-btn {
            background: rgba(255, 255, 255, 0.08) !important;
            color: #CBD5E1 !important;
        }

        [data-theme="dark"] .insta-profile-menu-btn {
            color: #34D399 !important;
        }
    `;

    document.head.appendChild(style);
}

function toggleLanguageState(e) {
    if (e) e.preventDefault();
    const cur = localStorage.getItem(CURRENT_LANG_KEY) || "en";
    const nxt = cur === "en" ? "te" : "en";
    localStorage.setItem(CURRENT_LANG_KEY, nxt);

    const gtCombo = document.querySelector(".goog-te-combo");
    if (gtCombo) {
        gtCombo.value = nxt;
        gtCombo.dispatchEvent(new Event("change"));
    }
}

function ensureTranslatorLoaded() {
    if (document.getElementById("google_translate_element")) return;

    const gtDiv = document.createElement("div");
    gtDiv.id = "google_translate_element";
    gtDiv.style.display = "none";
    document.body.appendChild(gtDiv);

    window.googleTranslateElementInit = function () {
        try {
            new window.google.translate.TranslateElement(
                { pageLanguage: "en", includedLanguages: "en,te", autoDisplay: false },
                "google_translate_element"
            );
        } catch (e) { /* ignore */ }
    };

    const script = document.createElement("script");
    script.src = "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
    script.async = true;
    document.head.appendChild(script);
}

/** Synchronize Logged-in User Box in Desktop Sidebar */
async function syncSidebarProfileBox() {
    const activeUserId = localStorage.getItem("urvi_logged_user");
    const desktopBox = document.getElementById("sidebar-profile-box");

    const path = window.location.pathname;
    const isRoot = path.endsWith("index.html") || path.endsWith("/");
    const loginUrl = isRoot ? "logins/login.html" : "../logins/login.html";

    if (!activeUserId) {
        const guestHTML = `
            <small class="d-block text-muted mb-2" style="font-size: 10px;">Access Dashboard</small>
            <a href="${loginUrl}" class="btn btn-success w-100 rounded-pill fw-bold text-center text-decoration-none py-2" style="font-size: 12px;">
                Log In / Sign Up
            </a>
        `;
        if (desktopBox) desktopBox.innerHTML = guestHTML;
        return;
    }

    let user = null;
    const cachedUserData = localStorage.getItem("urvi_user_data");
    if (cachedUserData) {
        try {
            const u = JSON.parse(cachedUserData);
            const matchesActive = !u.user_id ||
                u.user_id.toLowerCase() === activeUserId.toLowerCase() ||
                (u.auth_uid && u.auth_uid === activeUserId) ||
                (u.email && u.email.toLowerCase() === activeUserId.toLowerCase()) ||
                activeUserId.toLowerCase() === "urvi.earth";
            if (matchesActive) {
                user = u;
            } else {
                localStorage.removeItem("urvi_user_data");
            }
        } catch (e) { /* ignore */ }
    }

    if (!user && db) {
        try {
            const uSnap = await get(child(ref(db), `users/${activeUserId}`));
            if (uSnap.exists()) {
                user = uSnap.val();
                try { localStorage.setItem("urvi_user_data", JSON.stringify(user)); } catch { /* ignore */ }
            }
        } catch (e) { /* ignore */ }
    }

    const fullName = user ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || activeUserId : activeUserId;
    const isGoldAdmin = activeUserId.toLowerCase() === "urvi.earth" || (user && (user.userType === "admin" || user.role === "admin"));
    const isVerified = user && (user.role === "verified" || user.isVerified === true);

    const roleBadge = isGoldAdmin ? "👑 URVI Official Admin" : isVerified ? "⚡ Verified Eco Leader" : "🌿 Eco Member";

    const pic = user ? user.profilePic : null;
    const initial = fullName.charAt(0).toUpperCase();

    // Dynamically synchronize the bottom navigation profile avatar if available
    if (pic && pic !== "default" && pic.length > 5) {
        const tabProfile = document.getElementById("insta-tab-profile");
        if (tabProfile) {
            let avatarImg = tabProfile.querySelector(".insta-tab-avatar");
            if (!avatarImg) {
                const icon = tabProfile.querySelector(".insta-tab-icon");
                if (icon) {
                    avatarImg = document.createElement("img");
                    avatarImg.className = `insta-tab-avatar ${isProfile ? 'active-avatar' : ''}`;
                    avatarImg.alt = "Profile";
                    icon.replaceWith(avatarImg);
                }
            }
            if (avatarImg && avatarImg.src !== pic) {
                avatarImg.src = pic;
            }
        }
    }

    const avatarHTML = pic && pic !== "default" && pic.length > 5
        ? `<img src="${pic}" style="width:38px;height:38px;border-radius:50%;object-fit:cover;" alt="${fullName}">`
        : `<div style="width:38px;height:38px;border-radius:50%;background:#14532D;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;">${initial}</div>`;

    const userBoxHTML = `
        <div style="background:#F0FDF4; border:1px solid #DCFCE7; border-radius:16px; padding:14px;">
            <small style="font-size:10px; color:#64748B; text-transform:uppercase; letter-spacing:0.5px; display:block;" class="mb-2">Logged in as</small>
            <div class="d-flex align-items-center gap-2 mb-2">
                ${avatarHTML}
                <div style="min-width:0; flex-grow:1;">
                    <strong class="d-block text-dark text-truncate" style="font-size:13px;">${fullName}</strong>
                    <small class="text-success fw-bold" style="font-size:10px;">${roleBadge}</small>
                </div>
            </div>
            <button type="button" class="btn w-100 rounded-pill py-1 fw-bold text-danger btn-logout-action" style="background:#FFE4E6; border:none; font-size:12px; color:#E11D48;">
                Logout
            </button>
        </div>
    `;

    if (desktopBox) desktopBox.innerHTML = userBoxHTML;

    document.querySelectorAll(".btn-logout-action").forEach(btn => {
        btn.addEventListener("click", () => {
            localStorage.removeItem("urvi_logged_user");
            localStorage.removeItem("urvi_user_data");
            window.location.href = loginUrl;
        });
    });
}

/** Auto-Inject Right Vine Decoration ("right veins") matching index.html width 170px */
function injectRightVineDecoration() {
    let vineEl = document.querySelector(".vine-decoration") || document.getElementById("vineDecoration");
    
    if (vineEl) {
        vineEl.style.width = "170px";
        vineEl.style.height = "100vh";
        vineEl.style.position = "fixed";
        vineEl.style.right = "0";
        vineEl.style.top = "0";
        vineEl.style.pointerEvents = "none";
        vineEl.style.zIndex = "0";
        return;
    }

    const vineHTML = `
        <div class="vine-decoration" id="vineDecoration" aria-hidden="true" style="position:fixed; top:0; right:0; height:100vh; width:170px; pointer-events:none; z-index:0;">
            <svg class="vine-svg" viewBox="0 0 160 960" fill="none" xmlns="http://www.w3.org/2000/svg" style="height:100%; width:100%; opacity:0.88;">
                <defs>
                    <linearGradient id="lf1" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stop-color="#4ADE80" />
                        <stop offset="60%" stop-color="#22C55E" />
                        <stop offset="100%" stop-color="#14532D" />
                    </linearGradient>
                    <linearGradient id="lf2" x1="100%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stop-color="#86EFAC" />
                        <stop offset="100%" stop-color="#16A34A" />
                    </linearGradient>
                    <linearGradient id="lf3" x1="0%" y1="100%" x2="100%" y2="0%">
                        <stop offset="0%" stop-color="#22C55E" />
                        <stop offset="100%" stop-color="#4ADE80" />
                    </linearGradient>
                </defs>

                <!-- WINDING VINE STEMS -->
                <path d="M 110.0 0 L 119.0 10 L 125.6 20 L 128.0 30 L 125.6 40 L 119.0 50 L 110.0 60 L 101.0 70 L 94.4 80 L 92.0 90 L 94.4 100 L 101.0 110 L 110.0 120 L 119.0 130 L 125.6 140 L 128.0 150 L 125.6 160 L 119.0 170 L 110.0 180 L 101.0 190 L 94.4 200 L 92.0 210 L 94.4 220 L 101.0 230 L 110.0 240 L 119.0 250 L 125.6 260 L 128.0 270 L 125.6 280 L 119.0 290 L 110.0 300 L 101.0 310 L 94.4 320 L 92.0 330 L 94.4 340 L 101.0 350 L 110.0 360 L 119.0 370 L 125.6 380 L 128.0 390 L 125.6 400 L 119.0 410 L 110.0 420 L 101.0 430 L 94.4 440 L 92.0 450 L 94.4 460 L 101.0 470 L 110.0 480 L 119.0 490 L 125.6 500 L 128.0 510 L 125.6 520 L 119.0 530 L 110.0 540 L 101.0 550 L 94.4 560 L 92.0 570 L 94.4 580 L 101.0 590 L 110.0 600 L 119.0 610 L 125.6 620 L 128.0 630 L 125.6 640 L 119.0 650 L 110.0 660 L 101.0 670 L 94.4 680 L 92.0 690 L 94.4 700 L 101.0 710 L 110.0 720 L 119.0 730 L 125.6 740 L 128.0 750 L 125.6 760 L 119.0 770 L 110.0 780 L 101.0 790 L 94.4 800 L 92.0 810 L 94.4 820 L 101.0 830 L 110.0 840 L 119.0 850 L 125.6 860 L 128.0 870 L 125.6 880 L 119.0 890 L 110.0 900 L 101.0 910 L 94.4 920 L 92.0 930 L 94.4 940 L 101.0 950 L 110.0 960" stroke="#8B4513" stroke-width="3" stroke-linecap="round" fill="none" />
                <path d="M 113.2 0 L 118.8 10 L 121.0 20 L 119.2 30 L 113.8 40 L 106.4 50 L 98.8 60 L 93.2 70 L 91.0 80 L 92.8 90 L 98.2 100 L 105.6 110 L 113.2 120 L 118.8 130 L 121.0 140 L 119.2 150 L 113.8 160 L 106.4 170 L 98.8 180 L 93.2 190 L 91.0 200 L 92.8 210 L 98.2 220 L 105.6 230 L 113.2 240 L 118.8 250 L 121.0 260 L 119.2 270 L 113.8 280 L 106.4 290 L 98.8 300 L 93.2 310 L 91.0 320 L 92.8 330 L 98.2 340 L 105.6 350 L 113.2 360 L 118.8 370 L 121.0 380 L 119.2 390 L 113.8 400 L 106.4 410 L 98.8 420 L 93.2 430 L 91.0 440 L 92.8 450 L 98.2 460 L 105.6 470 L 113.2 480 L 118.8 490 L 121.0 500 L 119.2 510 L 113.8 520 L 106.4 530 L 98.8 540 L 93.2 550 L 91.0 560 L 92.8 570 L 98.2 580 L 105.6 590 L 113.2 600 L 118.8 610 L 121.0 620 L 119.2 630 L 113.8 640 L 106.4 650 L 98.8 660 L 93.2 670 L 91.0 680 L 92.8 690 L 98.2 700 L 105.6 710 L 113.2 720 L 118.8 730 L 121.0 740 L 119.2 750 L 113.8 760 L 106.4 770 L 98.8 780 L 93.2 790 L 91.0 800 L 92.8 810 L 98.2 820 L 105.6 830 L 113.2 840 L 118.8 850 L 121.0 860 L 119.2 870 L 113.8 880 L 106.4 890 L 98.8 900 L 93.2 910 L 91.0 920 L 92.8 930 L 98.2 940 L 105.6 950 L 113.2 960" stroke="#A0522D" stroke-width="1.8" stroke-linecap="round" fill="none" opacity="0.5" />

                <!-- 21 LEAVES -->
                <path class="vine-leaf" d="M 134.0 27.0 C 143.6 15.8, 152.0 22.2, 158.0 27.0 C 152.0 31.8, 143.6 38.2, 134.0 27.0 Z" fill="url(#lf1)" stroke="#166534" stroke-width="0.8" opacity="0.95" />
                <path class="vine-leaf" d="M 91.3 73.0 C 81.7 61.8, 73.3 65.2, 67.3 70.0 C 73.3 74.8, 81.7 84.2, 91.3 73.0 Z" fill="url(#lf2)" stroke="#166534" stroke-width="0.8" opacity="0.95" />
                <path class="vine-leaf" d="M 116.0 121.0 C 125.6 109.8, 134.0 113.2, 140.0 118.0 C 134.0 122.8, 125.6 132.2, 116.0 121.0 Z" fill="url(#lf3)" stroke="#166534" stroke-width="0.8" opacity="0.95" />
                <path class="vine-leaf" d="M 128.7 162.0 C 138.3 150.8, 146.7 153.2, 152.7 158.0 C 146.7 162.8, 138.3 173.2, 128.7 162.0 Z" fill="url(#lf1)" stroke="#166534" stroke-width="0.8" opacity="0.95" />
                <path class="vine-leaf" d="M 86.0 208.0 C 76.4 196.8, 68.0 207.2, 62.0 212.0 C 68.0 216.8, 76.4 219.2, 86.0 208.0 Z" fill="url(#lf2)" stroke="#166534" stroke-width="0.8" opacity="0.95" />
                <path class="vine-leaf" d="M 128.7 256.0 C 138.3 244.8, 146.7 250.2, 152.7 255.0 C 146.7 259.8, 138.3 267.2, 128.7 256.0 Z" fill="url(#lf3)" stroke="#166534" stroke-width="0.8" opacity="0.95" />
                <path class="vine-leaf" d="M 116.0 302.0 C 125.6 290.8, 134.0 301.2, 140.0 306.0 C 134.0 310.8, 125.6 313.2, 116.0 302.0 Z" fill="url(#lf1)" stroke="#166534" stroke-width="0.8" opacity="0.95" />
                <path class="vine-leaf" d="M 91.3 345.0 C 81.7 333.8, 73.3 340.2, 67.3 345.0 C 73.3 349.8, 81.7 356.2, 91.3 345.0 Z" fill="url(#lf2)" stroke="#166534" stroke-width="0.8" opacity="0.95" />
                <path class="vine-leaf" d="M 134.0 387.0 C 143.6 375.8, 152.0 380.2, 158.0 385.0 C 152.0 389.8, 143.6 398.2, 134.0 387.0 Z" fill="url(#lf3)" stroke="#166534" stroke-width="0.8" opacity="0.95" />
                <path class="vine-leaf" d="M 103.3 434.0 C 112.9 422.8, 121.3 429.2, 127.3 434.0 C 121.3 438.8, 112.9 445.2, 103.3 434.0 Z" fill="url(#lf1)" stroke="#166534" stroke-width="0.8" opacity="0.95" />
                <path class="vine-leaf" d="M 104.0 483.0 C 94.4 471.8, 86.0 479.2, 80.0 484.0 C 86.0 488.8, 94.4 494.2, 104.0 483.0 Z" fill="url(#lf2)" stroke="#166534" stroke-width="0.8" opacity="0.95" />
                <path class="vine-leaf" d="M 116.7 525.0 C 107.1 513.8, 98.7 517.2, 92.7 522.0 C 98.7 526.8, 107.1 536.2, 116.7 525.0 Z" fill="url(#lf3)" stroke="#166534" stroke-width="0.8" opacity="0.95" />
                <path class="vine-leaf" d="M 86.0 569.0 C 76.4 557.8, 68.0 564.2, 62.0 569.0 C 68.0 573.8, 76.4 580.2, 86.0 569.0 Z" fill="url(#lf1)" stroke="#166534" stroke-width="0.8" opacity="0.95" />
                <path class="vine-leaf" d="M 128.7 617.0 C 138.3 605.8, 146.7 615.2, 152.7 620.0 C 146.7 624.8, 138.3 628.2, 128.7 617.0 Z" fill="url(#lf2)" stroke="#166534" stroke-width="0.8" opacity="0.95" />
                <path class="vine-leaf" d="M 104.0 660.0 C 94.4 648.8, 86.0 652.2, 80.0 657.0 C 86.0 661.8, 94.4 671.2, 104.0 660.0 Z" fill="url(#lf3)" stroke="#166534" stroke-width="0.8" opacity="0.95" />
                <path class="vine-leaf" d="M 103.3 708.0 C 112.9 696.8, 121.3 704.2, 127.3 709.0 C 121.3 713.8, 112.9 719.2, 103.3 708.0 Z" fill="url(#lf1)" stroke="#166534" stroke-width="0.8" opacity="0.95" />
                <path class="vine-leaf" d="M 134.0 752.0 C 143.6 740.8, 152.0 744.2, 158.0 749.0 C 152.0 753.8, 143.6 763.2, 134.0 752.0 Z" fill="url(#lf2)" stroke="#166534" stroke-width="0.8" opacity="0.95" />
                <path class="vine-leaf" d="M 91.3 793.0 C 81.7 781.8, 73.3 788.2, 67.3 793.0 C 73.3 797.8, 81.7 804.2, 91.3 793.0 Z" fill="url(#lf3)" stroke="#166534" stroke-width="0.8" opacity="0.95" />
                <path class="vine-leaf" d="M 116.0 843.0 C 125.6 831.8, 134.0 837.2, 140.0 842.0 C 134.0 846.8, 125.6 854.2, 116.0 843.0 Z" fill="url(#lf1)" stroke="#166534" stroke-width="0.8" opacity="0.95" />
                <path class="vine-leaf" d="M 128.7 885.0 C 138.3 873.8, 146.7 880.2, 152.7 885.0 C 146.7 889.8, 138.3 896.2, 128.7 885.0 Z" fill="url(#lf2)" stroke="#166534" stroke-width="0.8" opacity="0.95" />
                <path class="vine-leaf" d="M 86.0 933.0 C 76.4 921.8, 68.0 929.2, 62.0 934.0 C 68.0 938.8, 76.4 944.2, 86.0 933.0 Z" fill="url(#lf3)" stroke="#166534" stroke-width="0.8" opacity="0.95" />
            </svg>
        </div>
    `;

    document.body.insertAdjacentHTML("beforeend", vineHTML);
}

function initFallbackRoutes() {
    document.querySelectorAll("a[href]").forEach(link => {
        const href = link.getAttribute("href");
        if (href && href !== "#" && !href.startsWith("javascript:") && !href.startsWith("http")) {
            link.addEventListener("click", (e) => {
                if (href.includes("undefined") || href.includes("null")) {
                    e.preventDefault();
                    window.location.href = href.startsWith("../") ? "../construction.html" : "construction.html";
                }
            });
        }
    });
}
