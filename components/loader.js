/**
 * URVI Universal Circular Loader & Progress Animation
 * Automatically handles page load states and provides helper functions
 * for inline data loading animations (posts, feeds, challenges).
 */

(function () {
    const isSubdir = window.location.pathname.includes('/profile/') ||
                     window.location.pathname.includes('/activities/') ||
                     window.location.pathname.includes('/impact/') ||
                     window.location.pathname.includes('/community/') ||
                     window.location.pathname.includes('/admin/') ||
                     window.location.pathname.includes('/notifications/');

    const assetPrefix = isSubdir ? '../' : './';
    const logoSrc = `${assetPrefix}assets/logo.png`;

    function getGradientId(prefix = 'urviGrad') {
        return `${prefix}_${Math.random().toString(36).substr(2, 6)}`;
    }

    /**
     * Generate HTML for a circular URVI spinner
     * @param {Object} options { text, size: 'sm'|'md'|'lg', showBrand }
     */
    window.getUrviSpinnerHTML = function (options = {}) {
        const text = options.text || 'Loading...';
        const sizeClass = options.size === 'sm' ? 'sm' : '';
        const gradId = getGradientId('inlineGrad');

        return `
            <div class="urvi-inline-loader ${sizeClass}">
                <div class="urvi-loader-ring-wrapper">
                    <svg class="urvi-circular-spinner" viewBox="0 0 84 84">
                        <defs>
                            <linearGradient id="${gradId}" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stop-color="#22C55E" />
                                <stop offset="50%" stop-color="#16A34A" />
                                <stop offset="100%" stop-color="#4ADE80" />
                            </linearGradient>
                        </defs>
                        <circle class="urvi-spinner-track" cx="42" cy="42" r="34" fill="none" stroke="rgba(34, 197, 94, 0.16)" stroke-width="6" />
                        <circle class="urvi-spinner-circle" cx="42" cy="42" r="34" fill="none" stroke="url(#${gradId})" stroke-width="6" stroke-linecap="round" />
                    </svg>
                    <div class="urvi-spinner-emblem">
                        <img src="${logoSrc}" alt="URVI" class="urvi-spinner-logo" onerror="this.outerHTML='<span class=\\'urvi-spinner-leaf\\'>🌿</span>'">
                    </div>
                </div>
                ${text ? `<div class="urvi-loader-message">${text} <span class="urvi-loader-dots"><span>.</span><span>.</span><span>.</span></span></div>` : ''}
            </div>
        `;
    };

    /**
     * Create the full-screen universal page loader overlay
     */
    function ensurePageLoaderOverlay() {
        let overlay = document.getElementById('urvi-universal-page-loader');
        if (overlay) return overlay;

        overlay = document.createElement('div');
        overlay.id = 'urvi-universal-page-loader';
        overlay.className = 'urvi-page-loader-overlay';

        const gradId = getGradientId('pageGrad');
        overlay.innerHTML = `
            <div class="urvi-loader-card">
                <div class="urvi-loader-ring-wrapper">
                    <svg class="urvi-circular-spinner" viewBox="0 0 84 84">
                        <defs>
                            <linearGradient id="${gradId}" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stop-color="#22C55E" />
                                <stop offset="50%" stop-color="#16A34A" />
                                <stop offset="100%" stop-color="#4ADE80" />
                            </linearGradient>
                        </defs>
                        <circle class="urvi-spinner-track" cx="42" cy="42" r="34" fill="none" stroke="rgba(34, 197, 94, 0.16)" stroke-width="6" />
                        <circle class="urvi-spinner-circle" cx="42" cy="42" r="34" fill="none" stroke="url(#${gradId})" stroke-width="6" stroke-linecap="round" />
                    </svg>
                    <div class="urvi-spinner-emblem">
                        <img src="${logoSrc}" alt="URVI" class="urvi-spinner-logo" onerror="this.outerHTML='<span class=\\'urvi-spinner-leaf\\'>🌿</span>'">
                    </div>
                </div>
                <div class="urvi-loader-brand">URVI</div>
                <div class="urvi-loader-message" id="urvi-page-loader-text">Loading experience <span class="urvi-loader-dots"><span>.</span><span>.</span><span>.</span></span></div>
            </div>
        `;

        if (document.body) {
            document.body.prepend(overlay);
        } else {
            document.addEventListener('DOMContentLoaded', () => {
                document.body.prepend(overlay);
            });
        }

        return overlay;
    }

    /**
     * Show full-screen page loader
     * @param {string} message
     */
    window.showUrviLoader = function (message) {
        const overlay = ensurePageLoaderOverlay();
        if (message) {
            const msgEl = document.getElementById('urvi-page-loader-text');
            if (msgEl) {
                msgEl.innerHTML = `${message} <span class="urvi-loader-dots"><span>.</span><span>.</span><span>.</span></span>`;
            }
        }
        overlay.classList.remove('hidden');
    };

    /**
     * Hide full-screen page loader smoothly
     */
    window.hideUrviLoader = function () {
        const overlay = document.getElementById('urvi-universal-page-loader');
        if (overlay) {
            overlay.classList.add('hidden');
            setTimeout(() => {
                if (overlay.classList.contains('hidden')) {
                    // keep hidden
                }
            }, 450);
        }
    };

    // Auto-initialize on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            ensurePageLoaderOverlay();
        });
    } else {
        ensurePageLoaderOverlay();
    }

    // Auto-dismiss safety timer so user is never locked out
    window.addEventListener('load', () => {
        setTimeout(() => {
            window.hideUrviLoader();
        }, 350);
    });

    // Fallback maximum safety timeout: 1400ms
    setTimeout(() => {
        window.hideUrviLoader();
    }, 1400);
})();

