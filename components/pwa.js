/* =====================================================
   URVI – components/pwa.js | Global PWA Installation Manager
   ===================================================== */

let deferredPrompt = null;

// Check if app is ALREADY installed or running in Standalone PWA Mode
function isAppInstalled() {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                         window.navigator.standalone === true ||
                         document.referrer.includes('android-app://');

    const isInstalledFlag = localStorage.getItem('urvi_pwa_installed') === 'true';

    return isStandalone || isInstalledFlag;
}

// Register Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        const swPath = window.location.pathname.includes('/index/') ||
                       window.location.pathname.includes('/community/') ||
                       window.location.pathname.includes('/profile/') ||
                       window.location.pathname.includes('/activities/') ||
                       window.location.pathname.includes('/impact/') ||
                       window.location.pathname.includes('/notifications/') ||
                       window.location.pathname.includes('/logins/')
            ? '../sw.js'
            : 'sw.js';

        navigator.serviceWorker.register(swPath).catch(e => console.log('PWA SW Register error:', e));
    });
}

document.addEventListener('DOMContentLoaded', () => {
    initInstallUI();
});

function initInstallUI() {
    // If running as standalone PWA app or marked installed in localStorage, hide all install buttons permanently
    if (isAppInstalled()) {
        hideAllInstallBtns();
        return;
    }

    // Otherwise, ensure desktop sidebar install button is visible
    const sidebarInstallBtn = document.getElementById('nav-install-app');
    if (sidebarInstallBtn) {
        sidebarInstallBtn.style.display = '';
    }

    // Mobile floating button (on mobile view only, except on community feed page)
    const isCommunityPage = window.location.pathname.includes('community.html');
    if (window.innerWidth <= 991 && !isCommunityPage) {
        createOrShowMobileFloatingBtn();
    } else {
        hideMobileFloatingBtn();
    }
}

// Capture PWA Install Prompt
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;

    if (!isAppInstalled()) {
        initInstallUI();
    } else {
        hideAllInstallBtns();
    }
});

// App Installed Event: Hide install buttons permanently across all pages
window.addEventListener('appinstalled', () => {
    localStorage.setItem('urvi_pwa_installed', 'true');
    deferredPrompt = null;
    hideAllInstallBtns();
    showPwaToast('🎉 URVI App installed successfully!');
});

function createOrShowMobileFloatingBtn() {
    let btn = document.getElementById('mobile-floating-install-btn');
    if (!btn) {
        btn = document.createElement('button');
        btn.id = 'mobile-floating-install-btn';
        btn.className = 'mobile-floating-install-btn';
        btn.innerHTML = '<i class="bi bi-download"></i> Install App';
        document.body.appendChild(btn);
    }
    btn.style.display = 'flex';
}

function hideMobileFloatingBtn() {
    const btn = document.getElementById('mobile-floating-install-btn');
    if (btn) {
        btn.style.display = 'none';
    }
}

function hideAllInstallBtns() {
    document.querySelectorAll('#nav-install-app, #mobile-floating-install-btn, .pwa-install-btn').forEach(btn => {
        btn.style.setProperty('display', 'none', 'important');
    });
}

// Global click handler for any Install App button
document.addEventListener('click', async (e) => {
    const btn = e.target.closest('#nav-install-app, #mobile-floating-install-btn, .pwa-install-btn');
    if (!btn) return;

    e.preventDefault();

    if (isAppInstalled()) {
        hideAllInstallBtns();
        showPwaToast('✨ URVI App is already installed!');
        return;
    }

    if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            localStorage.setItem('urvi_pwa_installed', 'true');
            deferredPrompt = null;
            hideAllInstallBtns();
        }
    } else {
        // Fallback info modal/alert for iOS Safari or Chrome when prompt is unavailable
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        if (isIOS) {
            alert("📱 To install URVI on iOS:\n\n1. Tap the Share button in Safari (bottom bar)\n2. Scroll down and tap 'Add to Home Screen' 🌿");
        } else {
            alert("🌿 URVI App Installation:\n\nIf prompt doesn't open automatically:\n1. Click your browser menu (⋮ 3 dots on top right)\n2. Select 'Install URVI' or 'Add to Home screen' 🎉");
        }
    }
});

function showPwaToast(msg) {
    let toast = document.getElementById('pwa-custom-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'pwa-custom-toast';
        toast.style.cssText = 'position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:#14532D;color:#fff;padding:12px 24px;border-radius:50px;font-size:14px;font-weight:600;z-index:99999;box-shadow:0 10px 30px rgba(0,0,0,0.25);';
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.display = 'block';
    setTimeout(() => toast.style.display = 'none', 4000);
}
