/* =====================================================
   URVI – components/translator.js | EN ⇄ TE Language Switcher
   NOTE: Google Translate initialization is handled by drawer.js
   This file only handles the standalone sidebar pill and toggle logic.
   ===================================================== */

const CURRENT_LANG_KEY = "urvi_lang_pref";

document.addEventListener("DOMContentLoaded", () => {
    injectLanguageToggleUI();
});

function injectLanguageToggleUI() {
    const currentLang = localStorage.getItem(CURRENT_LANG_KEY) || "en";

    const toggleHTML = `
        <button class="lang-toggle-btn" id="urvi-lang-toggle-sidebar" title="Switch Language">
            <span>🌐</span>
            <span class="lang-opt ${currentLang === 'en' ? 'active' : ''}" id="lang-opt-en">EN</span>
            <span class="lang-divider">|</span>
            <span class="lang-opt ${currentLang === 'te' ? 'active' : ''}" id="lang-opt-te">తెలుగు</span>
        </button>
    `;

    // Only inject into desktop sidebar nav (not headers — avoids duplication with drawer)
    const desktopSidebarNav = document.querySelector(".sidebar-nav");
    if (desktopSidebarNav && !document.getElementById("urvi-lang-toggle-sidebar")) {
        const wrap = document.createElement("div");
        wrap.className = "sidebar-lang-container px-3 mb-3 d-none d-lg-block";
        wrap.innerHTML = toggleHTML;
        desktopSidebarNav.appendChild(wrap);
    }

    // Attach click listeners
    document.querySelectorAll("#urvi-lang-toggle-sidebar, #urvi-lang-toggle-header, #urvi-lang-toggle-drawer").forEach((btn) => {
        btn.removeEventListener("click", toggleLanguage);
        btn.addEventListener("click", toggleLanguage);
    });
}

function toggleLanguage(e) {
    if (e) e.preventDefault();
    const currentLang = localStorage.getItem(CURRENT_LANG_KEY) || "en";
    const nextLang = currentLang === "en" ? "te" : "en";
    setLanguage(nextLang);
}

export function setLanguage(lang) {
    localStorage.setItem(CURRENT_LANG_KEY, lang);

    document.querySelectorAll("#lang-opt-en, .drawer-lang-en").forEach(el => {
        el.classList.toggle("active", lang === "en");
    });
    document.querySelectorAll("#lang-opt-te, .drawer-lang-te").forEach(el => {
        el.classList.toggle("active", lang === "te");
    });

    const gtCombo = document.querySelector(".goog-te-combo");
    if (gtCombo) {
        gtCombo.value = lang;
        gtCombo.dispatchEvent(new Event("change"));
    }
    // No reload — avoids infinite loop
}
