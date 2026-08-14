/* =====================================================
   URVI – drawer.js | Unified Navigation, Language Switcher & Full-Size Right Vine
   ===================================================== */
import { db, ref, get, child } from "../config.js";

const CURRENT_LANG_KEY = "urvi_lang_pref";

document.addEventListener("DOMContentLoaded", () => {
    initMobileDrawer();
    initFallbackRoutes();
    syncSidebarProfileBox();
    injectRightVineDecoration();
    ensureTranslatorLoaded();
});

function initMobileDrawer() {
    const path = window.location.pathname;
    const isRoot = path.endsWith("index.html") || path.endsWith("/");
    const basePath = isRoot ? "" : "../";
    const currentLang = localStorage.getItem(CURRENT_LANG_KEY) || "en";

    // Inject Mobile Drawer HTML structure into document body if not present
    if (!document.getElementById("urvi-mobile-drawer")) {
        const drawerHtml = `
            <div id="urvi-drawer-overlay" class="drawer-overlay"></div>
            <aside id="urvi-mobile-drawer" class="mobile-drawer-aside">
                <div class="drawer-header">
                    <div class="d-flex align-items-center gap-2">
                        <img src="${basePath}assets/logo.png" style="width:36px;height:36px;object-fit:contain;" alt="URVI">
                        <div>
                            <h5 class="m-0 fw-bold" style="color:var(--forest-green, #14532D); font-size:16px;">URVI</h5>
                            <small style="font-size:10px; color:#64748B;">Connect • Care • Conserve</small>
                        </div>
                    </div>
                    <button type="button" id="drawer-close-btn" class="drawer-close-btn">&times;</button>
                </div>

                <nav class="drawer-nav flex-grow-1">
                    <a href="${basePath}index.html" class="drawer-link ${path.endsWith('index.html') || path.endsWith('/') ? 'active' : ''}"><i class="bi bi-house-fill"></i> Home</a>
                    <a href="${basePath}activities/activities.html" class="drawer-link ${path.includes('activities') ? 'active' : ''}"><i class="bi bi-bar-chart-line-fill"></i> Activities</a>
                    <a href="${basePath}impact/impact.html" class="drawer-link ${path.includes('impact') ? 'active' : ''}"><i class="bi bi-bullseye"></i> Impact</a>
                    <a href="${basePath}community/community.html" class="drawer-link ${path.includes('community') ? 'active' : ''}"><i class="bi bi-people-fill"></i> Community</a>
                    <a href="${basePath}profile/profile.html" class="drawer-link ${path.endsWith('profile.html') ? 'active' : ''}"><i class="bi bi-person-circle"></i> Profile</a>
                    <a href="${basePath}profile/mycertificates.html" class="drawer-link drawer-sub-link ${path.includes('certificates') ? 'active' : ''}" style="color:#16A34A; font-weight:600;"><i class="bi bi-award-fill"></i> My Certificates</a>
                    <a href="${basePath}profile/my-virtual-tree.html" class="drawer-link drawer-sub-link ${path.includes('virtual-tree') ? 'active' : ''}" style="color:#16A34A; font-weight:600;"><i class="bi bi-tree-fill"></i> My Virtual Tree</a>
                    <a href="${basePath}notifications/notifications.html" class="drawer-link ${path.includes('notifications') ? 'active' : ''}"><i class="bi bi-bell-fill"></i> Notifications</a>
                    <a href="#" class="drawer-link" onclick="if(window.openUrviSupportModal) window.openUrviSupportModal(); return false;"><i class="bi bi-headset"></i> Help & Support</a>
                    <a href="#" class="drawer-link pwa-install-btn" style="color:#22C55E; font-weight:600;"><i class="bi bi-download"></i> Install App</a>

                    <!-- Language Switcher in Drawer -->
                    <div class="px-2 pt-2 pb-1 border-top mt-2">
                        <button type="button" class="lang-toggle-btn w-100 py-2 rounded-pill border d-flex align-items-center justify-content-center gap-2" id="urvi-lang-toggle-drawer" style="background:#F0FDF4; border-color:#BBF7D0 !important; color:#15803D; font-weight:600; font-size:13px;">
                            <span>🌐</span>
                            <span class="lang-opt ${currentLang === 'en' ? 'active' : ''}" id="drawer-lang-opt-en">EN</span>
                            <span class="lang-divider text-muted">|</span>
                            <span class="lang-opt ${currentLang === 'te' ? 'active' : ''}" id="drawer-lang-opt-te">తెలుగు</span>
                        </button>
                    </div>
                </nav>

                <div class="p-3 border-top">
                    <div id="mobile-drawer-profile-container"></div>
                </div>
            </aside>
        `;
        document.body.insertAdjacentHTML("beforeend", drawerHtml);
    }

    // Add styles dynamically
    if (!document.getElementById("drawer-style-block")) {
        const style = document.createElement("style");
        style.id = "drawer-style-block";
        style.textContent = `
            .bottom-nav, #bottom-nav {
                display: none !important;
            }
            .drawer-overlay {
                position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 99998;
                opacity: 0; visibility: hidden; transition: all 0.3s ease;
            }
            .drawer-overlay.active { opacity: 1; visibility: visible; }

            .mobile-drawer-aside {
                position: fixed; top: 0; left: 0; bottom: 0; width: 280px; background: #ffffff;
                z-index: 99999; transform: translateX(-100%); transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                display: flex; flex-direction: column; box-shadow: 4px 0 25px rgba(0,0,0,0.12);
            }
            .mobile-drawer-aside.active { transform: translateX(0); }

            .drawer-header {
                padding: 18px 20px; border-bottom: 1px solid #F1F5F9;
                display: flex; align-items: center; justify-content: space-between;
            }
            .drawer-close-btn {
                background: none; border: none; font-size: 24px; color: #64748B; cursor: pointer;
            }
            .drawer-nav { padding: 16px 12px; display: flex; flex-direction: column; gap: 4px; overflow-y: auto; }
            .drawer-link {
                display: flex; align-items: center; gap: 12px; padding: 12px 16px;
                color: #334155; font-weight: 500; font-size: 14px; text-decoration: none;
                border-radius: 12px; transition: all 0.2s ease;
            }
            .drawer-link:hover, .drawer-link.active {
                background: #F0FDF4; color: #16A34A; font-weight: 600;
            }
            .drawer-sub-group { display: flex; flex-direction: column; gap: 2px; }
            .drawer-sub-link { padding-left: 42px; font-size: 13px; color: #16A34A; }

            .mobile-hamburger-btn {
                background: linear-gradient(135deg, #16A34A 0%, #15803D 100%) !important;
                border: none !important;
                border-radius: 12px !important;
                width: 38px !important;
                height: 38px !important;
                display: inline-flex !important;
                align-items: center !important;
                justify-content: center !important;
                font-size: 20px !important;
                color: #FFFFFF !important;
                cursor: pointer !important;
                box-shadow: 0 4px 14px rgba(22, 163, 74, 0.35) !important;
                transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease !important;
                flex-shrink: 0 !important;
                margin-right: 10px !important;
            }
            .mobile-hamburger-btn:hover {
                transform: translateY(-1px) scale(1.05) !important;
                box-shadow: 0 6px 18px rgba(22, 163, 74, 0.5) !important;
                background: linear-gradient(135deg, #22C55E 0%, #16A34A 100%) !important;
                color: #FFFFFF !important;
            }
            .mobile-hamburger-btn:active {
                transform: scale(0.94) !important;
            }
            html, body {
                overflow-x: clip !important;
            }
            /* Sticky Top App Bar */
            .top-app-bar, header.top-app-bar {
                position: sticky !important;
                top: 0px !important;
                z-index: 1020 !important;
                background: rgba(255, 255, 255, 0.95) !important;
                backdrop-filter: blur(14px) !important;
                -webkit-backdrop-filter: blur(14px) !important;
                box-shadow: 0 4px 18px rgba(0, 0, 0, 0.05) !important;
                padding: 10px 14px !important;
                border-radius: 16px !important;
                margin-bottom: 20px !important;
            }
            [data-theme="dark"] .top-app-bar {
                background: rgba(15, 23, 42, 0.94) !important;
                box-shadow: 0 4px 18px rgba(0, 0, 0, 0.25) !important;
            }

            /* Responsive Top Right Profile Pill & Mobile Header Optimization */
            @media (max-width: 991.98px) {
                .page-title-desktop { display: none !important; }
                .top-app-bar > .d-flex:last-child {
                    gap: 8px !important;
                }
                .header-user-pill {
                    padding: 4px 6px 4px 10px !important;
                    gap: 6px !important;
                    max-width: 155px !important;
                    flex-shrink: 0 !important;
                }
                .header-user-name {
                    max-width: 75px !important;
                    white-space: nowrap !important;
                    overflow: hidden !important;
                    text-overflow: ellipsis !important;
                    font-size: 0.78rem !important;
                }
                .header-user-points {
                    font-size: 0.65rem !important;
                    white-space: nowrap !important;
                }
                .notification-wrapper .notification-btn {
                    padding: 4px !important;
                    font-size: 18px !important;
                }
            }
            @media (max-width: 420px) {
                .header-user-pill {
                    max-width: 135px !important;
                    padding: 3px 5px 3px 8px !important;
                }
                .header-user-name {
                    max-width: 58px !important;
                }
            }

            @media (min-width: 992px) {
                .mobile-hamburger-btn { display: none !important; }
            }

            /* Full size right vine matching index.html */
            .vine-decoration {
                position: fixed !important;
                right: 0 !important;
                top: 0 !important;
                width: 170px !important;
                height: 100vh !important;
                pointer-events: none !important;
                z-index: 0 !important;
                overflow: hidden !important;
            }
            .vine-svg {
                width: 100% !important;
                height: 100% !important;
                opacity: 0.88 !important;
            }
            @media (max-width: 991.98px) {
                .vine-decoration { display: none !important; }
            }
        `;
        document.head.appendChild(style);
    }

    const overlay = document.getElementById("urvi-drawer-overlay");
    const drawer = document.getElementById("urvi-mobile-drawer");
    const closeBtn = document.getElementById("drawer-close-btn");

    function openDrawer() {
        document.body.classList.add("drawer-open");
        overlay.classList.add("active");
        drawer.classList.add("active");
    }
    function closeDrawer() {
        document.body.classList.remove("drawer-open");
        overlay.classList.remove("active");
        drawer.classList.remove("active");
    }

    overlay?.addEventListener("click", closeDrawer);
    closeBtn?.addEventListener("click", closeDrawer);

    attachHamburgerButton(openDrawer);

    document.getElementById("urvi-lang-toggle-drawer")?.addEventListener("click", toggleLanguageState);

    // Sync theme button labels after drawer is created
    if (window.urviSyncThemeButtons) {
        const t = localStorage.getItem("urvi_theme") || "light";
        window.urviSyncThemeButtons(t);
    }
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

function attachHamburgerButton(openDrawerFn) {
    if (document.querySelector(".mobile-hamburger-btn")) return;

    let targetParent = document.querySelector(".top-app-bar .d-flex:first-child") ||
                       document.querySelector(".top-app-bar") ||
                       document.querySelector("header .d-flex:first-child") ||
                       document.querySelector("header") ||
                       document.querySelector(".notif-page-header") ||
                       document.querySelector(".profile-wrapper > div") ||
                       document.querySelector(".community-container > div") ||
                       document.querySelector("main");

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "mobile-hamburger-btn d-lg-none";
    btn.innerHTML = `<i class="bi bi-list"></i>`;
    btn.setAttribute("aria-label", "Open menu");
    btn.setAttribute("title", "Menu");
    btn.addEventListener("click", openDrawerFn);

    if (targetParent) {
        targetParent.insertBefore(btn, targetParent.firstChild);
    } else {
        document.body.appendChild(btn);
    }
}

/** Synchronize Logged-in User Box in Desktop Sidebar & Mobile Drawer */
async function syncSidebarProfileBox() {
    const activeUserId = localStorage.getItem("urvi_logged_user");
    const desktopBox = document.getElementById("sidebar-profile-box");
    const mobileBox = document.getElementById("mobile-drawer-profile-container");

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
        if (mobileBox) mobileBox.innerHTML = guestHTML;
        return;
    }

    let user = null;
    const cachedUserData = localStorage.getItem("urvi_user_data");
    if (cachedUserData) {
        try { user = JSON.parse(cachedUserData); } catch (e) { /* ignore */ }
    }

    if (!user && db) {
        try {
            const uSnap = await get(child(ref(db), `users/${activeUserId}`));
            if (uSnap.exists()) user = uSnap.val();
        } catch (e) { /* ignore */ }
    }

    const fullName = user ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || activeUserId : activeUserId;
    const isGoldAdmin = activeUserId.toLowerCase() === "urvi.earth" || (user && (user.userType === "admin" || user.role === "admin"));
    const isVerified = user && (user.role === "verified" || user.isVerified === true);

    const roleBadge = isGoldAdmin ? "👑 URVI Official Admin" : isVerified ? "⚡ Verified Eco Leader" : "🌿 Eco Member";

    const pic = user ? user.profilePic : null;
    const initial = fullName.charAt(0).toUpperCase();

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
    if (mobileBox) mobileBox.innerHTML = userBoxHTML;

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
