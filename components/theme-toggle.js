/* =====================================================
   URVI – components/theme-toggle.js
   Dark mode temporarily disabled by user request.
   Enforces light mode on page initialization.
   ===================================================== */

(function () {
    localStorage.setItem("urvi_theme", "light");
    document.documentElement.setAttribute("data-theme", "light");
})();
