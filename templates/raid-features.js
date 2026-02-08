/**
 * raid-features.js
 * Interactive features for the Ra'd AI legacy UI.
 * Loaded with defer so the DOM is ready.
 *
 * Features:
 *   1. Theme Toggle (Dark/Light)
 *   2. "New Chat" Button
 *   3. Suggestion Persistence
 *   4. Keyboard Shortcut (Ctrl+K / Cmd+K)
 *   5. Onboarding Overlay
 *   6. Enhanced CDN Fallback
 *   7. Data Freshness Indicator
 *   8. Error Boundary for Network
 */

document.addEventListener('DOMContentLoaded', function () {

    // =====================================================================
    // 1. THEME TOGGLE (Dark/Light)
    // =====================================================================

    var LIGHT_THEME = {
        '--bg-dark': '#F5F5F5',
        '--bg-card': '#FFFFFF',
        '--bg-card-hover': '#F0F0F0',
        '--bg-input': '#E8E8E8',
        '--bg-page': '#F5F5F5',
        '--text-primary': '#1A1A1A',
        '--text-secondary': '#555555',
        '--text-muted': '#777777',
        '--gold-border': 'rgba(180, 134, 11, 0.3)'
    };

    // Original dark values (restored when toggling back)
    var DARK_THEME = {
        '--bg-dark': '#0E0E0E',
        '--bg-card': '#1A1A1A',
        '--bg-card-hover': '#252525',
        '--bg-input': '#2A2A2A',
        '--bg-page': 'radial-gradient(ellipse at top, #1a1a1a 0%, #0E0E0E 50%)',
        '--text-primary': '#FFFFFF',
        '--text-secondary': '#B0B0B0',
        '--text-muted': '#707070',
        '--gold-border': 'rgba(212, 168, 75, 0.2)'
    };

    var SUN_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
    var MOON_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';

    function applyThemeProperties(theme) {
        var root = document.documentElement;
        var keys = Object.keys(theme);
        for (var i = 0; i < keys.length; i++) {
            root.style.setProperty(keys[i], theme[keys[i]]);
        }
    }

    function setTheme(mode) {
        var html = document.documentElement;
        if (mode === 'light') {
            html.setAttribute('data-theme', 'light');
            applyThemeProperties(LIGHT_THEME);
        } else {
            html.removeAttribute('data-theme');
            applyThemeProperties(DARK_THEME);
        }
        updateThemeIcon(mode);
        try { localStorage.setItem('raid-theme', mode); } catch (e) { /* ignored */ }
    }

    function updateThemeIcon(mode) {
        var btn = document.getElementById('raid-theme-toggle');
        if (!btn) return;
        // Sun icon in dark mode (click to go light), moon icon in light mode (click to go dark)
        btn.innerHTML = mode === 'dark' ? SUN_SVG : MOON_SVG;
        btn.title = mode === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode';
    }

    function getCurrentTheme() {
        try {
            var stored = localStorage.getItem('raid-theme');
            if (stored === 'light' || stored === 'dark') return stored;
        } catch (e) { /* ignored */ }
        // Fall back to OS preference
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
            return 'light';
        }
        return 'dark';
    }

    // Create theme toggle button
    var themeBtn = document.createElement('button');
    themeBtn.id = 'raid-theme-toggle';
    themeBtn.className = 'header-btn';
    themeBtn.setAttribute('aria-label', 'Toggle theme');
    themeBtn.style.cssText = 'background:none;border:1px solid var(--gold-border);border-radius:8px;color:var(--gold-primary);cursor:pointer;padding:6px 8px;display:inline-flex;align-items:center;justify-content:center;transition:all 0.3s ease;';

    themeBtn.addEventListener('mouseenter', function () {
        this.style.borderColor = 'var(--gold-primary)';
        this.style.boxShadow = '0 0 8px rgba(212,168,75,0.3)';
    });
    themeBtn.addEventListener('mouseleave', function () {
        this.style.borderColor = 'var(--gold-border)';
        this.style.boxShadow = 'none';
    });

    themeBtn.addEventListener('click', function () {
        var current = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
        setTheme(current === 'dark' ? 'light' : 'dark');
    });

    // =====================================================================
    // 2. "NEW CHAT" BUTTON
    // =====================================================================

    var newChatBtn = document.createElement('button');
    newChatBtn.id = 'raid-new-chat';
    newChatBtn.className = 'header-btn';
    newChatBtn.title = 'New Chat';
    newChatBtn.setAttribute('aria-label', 'New Chat');
    newChatBtn.style.cssText = 'background:none;border:1px solid var(--gold-border);border-radius:8px;color:var(--gold-primary);cursor:pointer;padding:6px 8px;display:inline-flex;align-items:center;justify-content:center;transition:all 0.3s ease;';
    newChatBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>';

    newChatBtn.addEventListener('mouseenter', function () {
        this.style.borderColor = 'var(--gold-primary)';
        this.style.boxShadow = '0 0 8px rgba(212,168,75,0.3)';
    });
    newChatBtn.addEventListener('mouseleave', function () {
        this.style.borderColor = 'var(--gold-border)';
        this.style.boxShadow = 'none';
    });

    newChatBtn.addEventListener('click', function () {
        window.location.reload();
    });

    // Insert buttons into .header-status (before status dot)
    var headerStatus = document.querySelector('.header-status');
    if (headerStatus) {
        var statusDot = headerStatus.querySelector('.status-dot');
        // Insert new chat first, then theme toggle, so order is: [New Chat] [Theme] [dot] [label]
        headerStatus.insertBefore(themeBtn, statusDot);
        headerStatus.insertBefore(newChatBtn, themeBtn);
    }

    // Apply saved/preferred theme on load
    var initialTheme = getCurrentTheme();
    setTheme(initialTheme);

    // =====================================================================
    // 3. SUGGESTION PERSISTENCE
    // =====================================================================

    var suggestionsSection = document.querySelector('.suggestions-section');
    var showSuggestionsBtn = null;

    function createShowSuggestionsButton() {
        if (showSuggestionsBtn) return; // already exists
        showSuggestionsBtn = document.createElement('button');
        showSuggestionsBtn.id = 'raid-show-suggestions';
        showSuggestionsBtn.className = 'header-btn';
        showSuggestionsBtn.textContent = 'Show Suggestions';
        showSuggestionsBtn.style.cssText = 'display:block;margin:8px auto;background:var(--bg-card);border:1px solid var(--gold-border);border-radius:9999px;color:var(--gold-primary);cursor:pointer;padding:6px 16px;font-family:Tajawal,sans-serif;font-size:12px;font-weight:500;transition:all 0.3s ease;';

        showSuggestionsBtn.addEventListener('mouseenter', function () {
            this.style.borderColor = 'var(--gold-primary)';
            this.style.background = 'var(--bg-card-hover)';
        });
        showSuggestionsBtn.addEventListener('mouseleave', function () {
            this.style.borderColor = 'var(--gold-border)';
            this.style.background = 'var(--bg-card)';
        });

        showSuggestionsBtn.addEventListener('click', function () {
            if (suggestionsSection) {
                suggestionsSection.style.transition = 'opacity 0.3s ease, max-height 0.4s ease, margin 0.4s ease, padding 0.4s ease';
                suggestionsSection.style.opacity = '1';
                suggestionsSection.style.maxHeight = '500px';
                suggestionsSection.style.overflow = 'visible';
                suggestionsSection.style.margin = '';
                suggestionsSection.style.padding = '';
            }
            // Restore keyboard accessibility
            suggestionsSection.removeAttribute('aria-hidden');
            document.querySelectorAll('.suggestion-chip').forEach(function(chip) {
                chip.removeAttribute('tabindex');
            });
            if (showSuggestionsBtn && showSuggestionsBtn.parentNode) {
                showSuggestionsBtn.parentNode.removeChild(showSuggestionsBtn);
            }
            showSuggestionsBtn = null;
            try { sessionStorage.setItem('raid-suggestions-visible', 'true'); } catch (e) { /* ignored */ }
        });

        // Insert after hero section or before chat container
        var heroSection = document.querySelector('.hero-section');
        if (heroSection && heroSection.parentNode) {
            // Insert after suggestions section (which is collapsed)
            if (suggestionsSection && suggestionsSection.parentNode) {
                suggestionsSection.parentNode.insertBefore(showSuggestionsBtn, suggestionsSection.nextSibling);
            } else {
                heroSection.parentNode.insertBefore(showSuggestionsBtn, heroSection.nextSibling);
            }
        }
    }

    // Use MutationObserver to detect when suggestions get hidden
    if (suggestionsSection) {
        var suggestionsObserver = new MutationObserver(function (mutations) {
            for (var i = 0; i < mutations.length; i++) {
                if (mutations[i].type === 'attributes' && mutations[i].attributeName === 'style') {
                    var opacity = suggestionsSection.style.opacity;
                    var maxHeight = suggestionsSection.style.maxHeight;
                    var isHidden = opacity === '0' || maxHeight === '0' || maxHeight === '0px';
                    if (isHidden && !showSuggestionsBtn) {
                        createShowSuggestionsButton();
                        try { sessionStorage.setItem('raid-suggestions-visible', 'false'); } catch (e) { /* ignored */ }
                    }
                }
            }
        });
        suggestionsObserver.observe(suggestionsSection, { attributes: true, attributeFilter: ['style'] });
    }

    // Restore suggestion state from sessionStorage on load
    try {
        var suggestionsVisible = sessionStorage.getItem('raid-suggestions-visible');
        if (suggestionsVisible === 'false' && suggestionsSection) {
            suggestionsSection.style.opacity = '0';
            suggestionsSection.style.maxHeight = '0';
            suggestionsSection.style.overflow = 'hidden';
            suggestionsSection.style.margin = '0';
            suggestionsSection.style.padding = '0';
            createShowSuggestionsButton();
        }
    } catch (e) { /* ignored */ }

    // =====================================================================
    // 4. KEYBOARD SHORTCUT (Ctrl+K / Cmd+K)
    // =====================================================================

    document.addEventListener('keydown', function (e) {
        var isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
        var modifier = isMac ? e.metaKey : e.ctrlKey;
        if (modifier && e.key === 'k') {
            e.preventDefault();
            e.stopPropagation();
            // Use the same findChatInput() defined in index.html
            if (typeof findChatInput === 'function') {
                var input = findChatInput();
                if (input) {
                    input.focus();
                    return;
                }
            }
            // Fallback: try to find input ourselves via Shadow DOM
            var chat = document.querySelector('vanna-chat');
            if (chat && chat.shadowRoot) {
                var selectors = ['textarea', 'input[type="text"]', 'input:not([type="hidden"])'];
                for (var i = 0; i < selectors.length; i++) {
                    var el = chat.shadowRoot.querySelector(selectors[i]);
                    if (el) {
                        el.focus();
                        return;
                    }
                }
            }
        }
    });

    // =====================================================================
    // 5. ONBOARDING OVERLAY
    // =====================================================================

    var hasOnboarded = false;
    try { hasOnboarded = localStorage.getItem('raid-onboarded') === 'true'; } catch (e) { /* ignored */ }

    if (!hasOnboarded) {
        var steps = [
            {
                target: '.suggestions-section',
                title: 'Example Queries',
                text: 'Try these example queries to get started. Click any chip to instantly ask that question.',
                position: 'bottom'
            },
            {
                target: '.chat-container',
                title: 'Chat Input',
                text: 'Or type your own question here. Ask about any TASI-listed company, sector, or financial metric.',
                position: 'top'
            },
            {
                target: '.stats-bar',
                title: 'Dataset Stats',
                text: 'Key stats about the dataset: ~500 companies, 10 tables, covering the entire TASI market.',
                position: 'bottom'
            }
        ];

        var currentStep = 0;

        // Find or create overlay container
        var overlay = document.getElementById('raid-onboarding-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'raid-onboarding-overlay';
            document.body.appendChild(overlay);
        }

        function showOnboardingStep(stepIndex) {
            if (stepIndex >= steps.length) {
                dismissOnboarding();
                return;
            }
            currentStep = stepIndex;
            var step = steps[stepIndex];
            var targetEl = document.querySelector(step.target);

            // Overlay background
            overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;';

            // Highlight target element
            if (targetEl) {
                targetEl.style.position = 'relative';
                targetEl.style.zIndex = '10000';
                targetEl.style.boxShadow = '0 0 0 4px rgba(212,168,75,0.5), 0 0 20px rgba(212,168,75,0.3)';
                targetEl.style.borderRadius = '12px';
            }

            // Tooltip card
            var isLast = stepIndex === steps.length - 1;
            var stepLabel = 'Step ' + (stepIndex + 1) + ' of ' + steps.length;

            overlay.innerHTML = '<div style="' +
                'background:#1A1A1A;' +
                'border:2px solid var(--gold-primary, #D4A84B);' +
                'border-radius:16px;' +
                'padding:24px 28px;' +
                'max-width:400px;' +
                'width:90%;' +
                'box-shadow:0 8px 32px rgba(0,0,0,0.5);' +
                'font-family:Tajawal,sans-serif;' +
                'color:#FFFFFF;' +
                'text-align:center;' +
                '">' +
                '<p style="font-size:11px;color:#707070;margin-bottom:8px;text-transform:uppercase;letter-spacing:1px;">' + stepLabel + '</p>' +
                '<h3 style="font-size:18px;font-weight:700;color:#D4A84B;margin-bottom:8px;">' + step.title + '</h3>' +
                '<p style="font-size:14px;color:#B0B0B0;line-height:1.6;margin-bottom:20px;">' + step.text + '</p>' +
                '<div style="display:flex;gap:12px;justify-content:center;">' +
                    '<button id="raid-onboard-skip" style="' +
                        'background:none;border:1px solid #555;border-radius:8px;color:#888;' +
                        'padding:8px 20px;cursor:pointer;font-family:Tajawal,sans-serif;font-size:13px;transition:all 0.2s;' +
                    '">Skip</button>' +
                    '<button id="raid-onboard-next" style="' +
                        'background:linear-gradient(135deg,#D4A84B,#B8860B);border:none;border-radius:8px;color:#0E0E0E;' +
                        'padding:8px 24px;cursor:pointer;font-family:Tajawal,sans-serif;font-size:13px;font-weight:700;transition:all 0.2s;' +
                    '">' + (isLast ? 'Got it!' : 'Next') + '</button>' +
                '</div>' +
            '</div>';

            // Bind button events
            var skipBtn = document.getElementById('raid-onboard-skip');
            var nextBtn = document.getElementById('raid-onboard-next');

            if (skipBtn) {
                skipBtn.addEventListener('click', function () { dismissOnboarding(); });
            }
            if (nextBtn) {
                nextBtn.addEventListener('click', function () {
                    clearStepHighlight(stepIndex);
                    showOnboardingStep(stepIndex + 1);
                });
            }

            // Click overlay background to skip
            overlay.addEventListener('click', function (e) {
                if (e.target === overlay) dismissOnboarding();
            });
        }

        function clearStepHighlight(stepIndex) {
            if (stepIndex >= steps.length) return;
            var targetEl = document.querySelector(steps[stepIndex].target);
            if (targetEl) {
                targetEl.style.zIndex = '';
                targetEl.style.boxShadow = '';
                targetEl.style.position = '';
            }
        }

        function dismissOnboarding() {
            // Clear all highlights
            for (var i = 0; i < steps.length; i++) {
                clearStepHighlight(i);
            }
            overlay.style.display = 'none';
            overlay.innerHTML = '';
            try { localStorage.setItem('raid-onboarded', 'true'); } catch (e) { /* ignored */ }
        }

        // Start onboarding after a short delay to let animations finish
        setTimeout(function () { showOnboardingStep(0); }, 800);
    }

    // =====================================================================
    // 6. ENHANCED CDN FALLBACK
    // =====================================================================

    // Show a loading spinner in the chat container while the component loads
    var chatContainer = document.querySelector('.chat-container');
    var vannaChat = document.querySelector('vanna-chat');
    var cdnLoaded = customElements.get('vanna-chat') !== undefined;

    if (!cdnLoaded && chatContainer) {
        // Create spinner overlay (sits behind the vanna-chat element until it loads)
        var spinner = document.createElement('div');
        spinner.id = 'raid-cdn-spinner';
        spinner.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:1;pointer-events:none;';
        spinner.innerHTML =
            '<div style="width:36px;height:36px;border:3px solid rgba(212,168,75,0.2);border-top-color:#D4A84B;border-radius:50%;animation:spin 0.8s linear infinite;"></div>' +
            '<p style="margin-top:12px;font-size:13px;color:var(--text-muted);font-family:Tajawal,sans-serif;">Loading chat component...</p>';

        // Add spin keyframes if not present
        if (!document.getElementById('raid-spin-keyframes')) {
            var styleEl = document.createElement('style');
            styleEl.id = 'raid-spin-keyframes';
            styleEl.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
            document.head.appendChild(styleEl);
        }

        // Ensure chat container is relatively positioned for the absolute spinner
        chatContainer.style.position = 'relative';
        chatContainer.appendChild(spinner);
    }

    // Progressive retry at 3s, 6s, 10s
    var retryDelays = [3000, 6000, 10000];
    var retryIndex = 0;

    function checkCdnLoaded() {
        if (customElements.get('vanna-chat')) {
            // Component loaded successfully - remove spinner
            var spinnerEl = document.getElementById('raid-cdn-spinner');
            if (spinnerEl && spinnerEl.parentNode) spinnerEl.parentNode.removeChild(spinnerEl);
            return;
        }

        if (retryIndex >= retryDelays.length) {
            // Final failure - show error card
            showCdnError();
            return;
        }

        var delay = retryDelays[retryIndex];
        retryIndex++;
        setTimeout(checkCdnLoaded, delay - (retryIndex > 1 ? retryDelays[retryIndex - 2] : 0));
    }

    function showCdnError() {
        var spinnerEl = document.getElementById('raid-cdn-spinner');
        if (spinnerEl && spinnerEl.parentNode) spinnerEl.parentNode.removeChild(spinnerEl);

        if (vannaChat) {
            vannaChat.innerHTML =
                '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;padding:40px;text-align:center;font-family:Tajawal,sans-serif;">' +
                    '<div style="background:#1A1A1A;border:2px solid #D4A84B;border-radius:16px;padding:32px;max-width:400px;width:100%;">' +
                        '<p style="font-size:20px;font-weight:700;color:#D4A84B;margin-bottom:12px;">Connection Issue</p>' +
                        '<p style="font-size:14px;color:#B0B0B0;margin-bottom:8px;">The chat component failed to load after multiple attempts.</p>' +
                        '<p style="font-size:12px;color:#707070;margin-bottom:20px;">Source: https://img.vanna.ai/vanna-components.js</p>' +
                        '<button id="raid-cdn-retry" style="' +
                            'background:linear-gradient(135deg,#D4A84B,#B8860B);border:none;border-radius:8px;color:#0E0E0E;' +
                            'padding:10px 28px;cursor:pointer;font-family:Tajawal,sans-serif;font-size:14px;font-weight:700;transition:all 0.2s;' +
                        '">Retry</button>' +
                    '</div>' +
                '</div>';

            var retryBtn = document.getElementById('raid-cdn-retry');
            if (retryBtn) {
                retryBtn.addEventListener('click', function () {
                    // Reload the script
                    vannaChat.innerHTML = '';
                    retryIndex = 0;
                    var script = document.createElement('script');
                    script.type = 'module';
                    script.src = 'https://img.vanna.ai/vanna-components.js?t=' + Date.now();
                    document.head.appendChild(script);

                    // Re-show spinner
                    var newSpinner = document.createElement('div');
                    newSpinner.id = 'raid-cdn-spinner';
                    newSpinner.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:1;pointer-events:none;';
                    newSpinner.innerHTML =
                        '<div style="width:36px;height:36px;border:3px solid rgba(212,168,75,0.2);border-top-color:#D4A84B;border-radius:50%;animation:spin 0.8s linear infinite;"></div>' +
                        '<p style="margin-top:12px;font-size:13px;color:var(--text-muted);font-family:Tajawal,sans-serif;">Retrying...</p>';
                    chatContainer.appendChild(newSpinner);

                    // Check again with progressive delays
                    setTimeout(checkCdnLoaded, retryDelays[0]);
                });
            }
        }
    }

    // Start the progressive check (first check at 3s from page load)
    if (!cdnLoaded) {
        setTimeout(checkCdnLoaded, retryDelays[0]);
    }

    // =====================================================================
    // 7. DATA FRESHNESS INDICATOR
    // =====================================================================

    var freshnessDate = document.body.dataset.freshness || '';
    if (!freshnessDate) {
        // Use current date as fallback
        var now = new Date();
        var yyyy = now.getFullYear();
        var mm = String(now.getMonth() + 1).padStart(2, '0');
        var dd = String(now.getDate()).padStart(2, '0');
        freshnessDate = yyyy + '-' + mm + '-' + dd;
    }

    var freshnessDisplay = document.getElementById('data-freshness-display');
    if (freshnessDisplay) {
        freshnessDisplay.textContent = 'Data as of: ' + freshnessDate;
        freshnessDisplay.style.cssText = 'font-size:11px;color:var(--text-muted);';
    } else {
        // Append to footer
        var footer = document.querySelector('.app-footer .footer-text');
        if (footer) {
            var divider = document.createElement('span');
            divider.className = 'footer-divider';
            divider.textContent = '|';

            var freshnessSpan = document.createElement('span');
            freshnessSpan.id = 'data-freshness-display';
            freshnessSpan.textContent = 'Data as of: ' + freshnessDate;
            freshnessSpan.style.cssText = 'font-size:12px;color:#8A8A8A;';

            footer.appendChild(divider);
            footer.appendChild(freshnessSpan);
        }
    }

    // =====================================================================
    // 8. ERROR BOUNDARY FOR NETWORK
    // =====================================================================

    var toastContainer = null;
    var toastTimeout = null;

    function getToastContainer() {
        if (toastContainer) return toastContainer;
        toastContainer = document.createElement('div');
        toastContainer.id = 'raid-toast-container';
        toastContainer.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:10001;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none;max-width:90%;width:480px;';
        document.body.appendChild(toastContainer);
        return toastContainer;
    }

    function showNetworkToast(message) {
        var container = getToastContainer();

        // Remove previous toast if any
        container.innerHTML = '';
        if (toastTimeout) clearTimeout(toastTimeout);

        var toast = document.createElement('div');
        toast.style.cssText = 'pointer-events:auto;background:#1A1A1A;border:1px solid #D4A84B;border-radius:12px;padding:14px 20px;display:flex;align-items:center;gap:12px;box-shadow:0 8px 32px rgba(0,0,0,0.5);font-family:Tajawal,sans-serif;animation:fadeInUp 0.3s ease-out;width:100%;';

        var icon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FF6B6B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';

        toast.innerHTML = icon +
            '<span style="flex:1;font-size:13px;color:#E0E0E0;line-height:1.4;">' + escapeHtml(message) + '</span>' +
            '<button id="raid-toast-retry" style="background:none;border:1px solid #D4A84B;border-radius:6px;color:#D4A84B;padding:4px 12px;cursor:pointer;font-family:Tajawal,sans-serif;font-size:12px;font-weight:600;flex-shrink:0;transition:all 0.2s;">Retry</button>' +
            '<button id="raid-toast-dismiss" style="background:none;border:none;color:#707070;cursor:pointer;padding:4px;font-size:18px;line-height:1;flex-shrink:0;">&times;</button>';

        container.appendChild(toast);

        // Bind dismiss
        var dismissBtn = document.getElementById('raid-toast-dismiss');
        if (dismissBtn) {
            dismissBtn.addEventListener('click', function () {
                container.innerHTML = '';
            });
        }

        // Bind retry
        var retryBtn = document.getElementById('raid-toast-retry');
        if (retryBtn) {
            retryBtn.addEventListener('click', function () {
                container.innerHTML = '';
                window.location.reload();
            });
        }

        // Auto-dismiss after 10 seconds
        toastTimeout = setTimeout(function () {
            if (container) container.innerHTML = '';
        }, 10000);
    }

    function escapeHtml(text) {
        var div = document.createElement('div');
        div.appendChild(document.createTextNode(text));
        return div.innerHTML;
    }

    function isNetworkError(error) {
        if (!error) return false;
        var msg = (error.message || error.reason || String(error)).toLowerCase();
        var networkTerms = ['network', 'fetch', 'failed to fetch', 'cors', 'timeout', 'abort', 'net::', 'err_', 'connection', 'offline', 'dns'];
        for (var i = 0; i < networkTerms.length; i++) {
            if (msg.indexOf(networkTerms[i]) !== -1) return true;
        }
        return false;
    }

    window.addEventListener('error', function (e) {
        if (isNetworkError(e)) {
            showNetworkToast('A network error occurred. Please check your connection.');
        }
    });

    window.addEventListener('unhandledrejection', function (e) {
        if (isNetworkError(e.reason)) {
            showNetworkToast('A network request failed. Please check your connection.');
        }
    });

    // =====================================================================
    // 9. SHADOW DOM OVERRIDES (Branding, Admin Messages, Duplicate Inputs)
    // =====================================================================

    /**
     * Wait for vanna-chat Shadow DOM to be available, then apply overrides.
     * Uses polling since MutationObserver can't detect shadowRoot attachment.
     */
    function waitForShadowRoot(callback) {
        var chat = document.querySelector('vanna-chat');
        if (!chat) return;
        if (chat.shadowRoot) {
            callback(chat.shadowRoot);
            return;
        }
        var attempts = 0;
        var maxAttempts = 50; // 10 seconds
        var interval = setInterval(function() {
            attempts++;
            if (chat.shadowRoot) {
                clearInterval(interval);
                callback(chat.shadowRoot);
            } else if (attempts >= maxAttempts) {
                clearInterval(interval);
            }
        }, 200);
    }

    function applyShadowDomOverrides(shadowRoot) {
        // 1. Inject CSS overrides for branding
        var styleEl = document.createElement('style');
        styleEl.textContent = [
            // HIDE the entire inner header bar (VC avatar, title, window controls)
            // We already have our own app header outside the Shadow DOM
            '[class*="chat-header"], [class*="ChatHeader"], [class*="header-bar"], .chat-header, header {',
            '  display: none !important;',
            '  height: 0 !important;',
            '  overflow: hidden !important;',
            '}',
            // Override avatar colors to gold (for bot messages)
            '[class*="avatar"], [class*="Avatar"] {',
            '  background: linear-gradient(135deg, #D4A84B 0%, #E8C872 50%, #B8860B 100%) !important;',
            '  color: #0E0E0E !important;',
            '  font-weight: 700 !important;',
            '}',
            // Override any teal/blue colors
            '[style*="teal"], [style*="#00897B"], [style*="#009688"], [style*="#26A69A"] {',
            '  color: #D4A84B !important;',
            '  border-color: rgba(212, 168, 75, 0.2) !important;',
            '}',
            // Dark theme for message area
            '[class*="message-list"], [class*="MessageList"], [class*="chat-body"], main, .messages {',
            '  background: #1A1A1A !important;',
            '}',
            // Style inputs to match Ra'd theme
            'input, textarea {',
            '  background: #2A2A2A !important;',
            '  color: #FFFFFF !important;',
            '  border-color: rgba(212, 168, 75, 0.2) !important;',
            '  font-family: Tajawal, sans-serif !important;',
            '}',
            'input:focus, textarea:focus {',
            '  border-color: #D4A84B !important;',
            '  outline: none !important;',
            '  box-shadow: 0 0 0 2px rgba(212, 168, 75, 0.2) !important;',
            '}',
            // Send button gold styling
            'button[type="submit"], [class*="send"], [class*="Send"] {',
            '  background: linear-gradient(135deg, #D4A84B, #B8860B) !important;',
            '  color: #0E0E0E !important;',
            '  border: none !important;',
            '}',
            // Status indicators
            '[class*="status"], [class*="Status"] {',
            '  color: #D4A84B !important;',
            '}',
            // Tool completion messages: compact, no overlap
            '[class*="tool"], [class*="Tool"], [class*="execution"], [class*="Execution"] {',
            '  background: rgba(26, 26, 26, 0.95) !important;',
            '  border: 1px solid rgba(212, 168, 75, 0.15) !important;',
            '  border-radius: 8px !important;',
            '  padding: 6px 12px !important;',
            '  margin: 2px 0 !important;',
            '  font-size: 12px !important;',
            '  color: #888 !important;',
            '  max-height: 36px !important;',
            '  overflow: hidden !important;',
            '}',
        ].join('\n');
        shadowRoot.appendChild(styleEl);

        // 2. MutationObserver to hide admin messages as they appear
        var adminObserver = new MutationObserver(function(mutations) {
            hideAdminMessages(shadowRoot);
        });
        adminObserver.observe(shadowRoot, { childList: true, subtree: true });

        // Initial pass
        hideAdminMessages(shadowRoot);

        // 3. Mirror chat responses to aria-live region
        var raidStatus = document.getElementById('raid-status');
        if (raidStatus) {
            var responseObserver = new MutationObserver(function() {
                // Find the latest response text in shadow DOM
                var messages = shadowRoot.querySelectorAll('[class*="message"], [class*="Message"], .message, p');
                if (messages.length > 0) {
                    var lastMsg = messages[messages.length - 1];
                    var text = lastMsg.textContent || '';
                    if (text.length > 10 && text.length < 200) {
                        raidStatus.textContent = text;
                    }
                }
            });
            responseObserver.observe(shadowRoot, { childList: true, subtree: true, characterData: true });
        }
    }

    function hideAdminMessages(shadowRoot) {
        // Find and hide elements containing admin/system diagnostic text.
        // Walk all elements - check text at every level to catch wrappers too.
        var patterns = [
            'Admin: System Ready',
            'Admin View',
            'Setup: SQL',
            'Memory ✗',
            'admin privileges',
            'WARNING',
            'System Ready',
            'Vanna AI is ready',
        ];
        var allElements = shadowRoot.querySelectorAll('*');
        for (var i = 0; i < allElements.length; i++) {
            var el = allElements[i];
            var text = el.textContent || '';
            // Skip very large containers (body/main) to avoid hiding everything
            if (text.length > 500) continue;
            for (var p = 0; p < patterns.length; p++) {
                if (text.indexOf(patterns[p]) !== -1) {
                    // Walk up to find the message-level container (with class containing "message")
                    var target = el;
                    var parent = el.parentElement;
                    while (parent && parent !== shadowRoot) {
                        var cls = parent.className || '';
                        if (typeof cls === 'string' && (cls.indexOf('message') !== -1 || cls.indexOf('Message') !== -1)) {
                            target = parent;
                            break;
                        }
                        parent = parent.parentElement;
                    }
                    target.style.display = 'none';
                    break;
                }
            }
        }
    }

    // Initialize Shadow DOM overrides
    waitForShadowRoot(applyShadowDomOverrides);

    // =====================================================================
    // 10. SUGGESTION KEYBOARD ACCESSIBILITY
    // =====================================================================

    // Enhance the existing MutationObserver for suggestions to manage tabindex
    if (suggestionsSection) {
        var a11yObserver = new MutationObserver(function() {
            var opacity = suggestionsSection.style.opacity;
            var maxHeight = suggestionsSection.style.maxHeight;
            var isHidden = opacity === '0' || maxHeight === '0' || maxHeight === '0px';

            if (isHidden) {
                // Make collapsed chips non-focusable
                suggestionsSection.setAttribute('aria-hidden', 'true');
                document.querySelectorAll('.suggestion-chip').forEach(function(chip) {
                    chip.setAttribute('tabindex', '-1');
                });
            }
        });
        a11yObserver.observe(suggestionsSection, { attributes: true, attributeFilter: ['style'] });
    }

});
