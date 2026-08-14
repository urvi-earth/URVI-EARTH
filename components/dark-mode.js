/**
 * URVI — dark-mode.js
 * Dark mode temporarily disabled by user request.
 * Enforces strictly "light" theme across the entire platform.
 */
(function () {
    "use strict";

    localStorage.setItem("urvi_theme", "light");
    document.documentElement.setAttribute("data-theme", "light");
    document.documentElement.classList.remove("dark");

    function enforceLightMode() {
        localStorage.setItem("urvi_theme", "light");
        document.documentElement.setAttribute("data-theme", "light");
        document.documentElement.classList.remove("dark");
        var btns = document.querySelectorAll(".theme-toggle-btn, #sidebar-theme-toggle-wrapper");
        for (var i = 0; i < btns.length; i++) {
            btns[i].style.display = "none";
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", enforceLightMode);
    } else {
        enforceLightMode();
    }

    window.urviToggleTheme = function () { enforceLightMode(); };
    window.urviApplyTheme = function () { enforceLightMode(); };
    window.urviSyncThemeButtons = function () { enforceLightMode(); };
})();
