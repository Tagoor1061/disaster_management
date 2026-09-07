/**
 * Language Translation & Multilingual System — Suraksha Kavach
 * ==============================================================
 * Enables seamless multi-language translation across all portal webpages.
 * 
 * Default Language: English (en)
 * Supported Languages:
 *   - English (en) [Default]
 *   - Telugu (te / తెలుగు) — Andhra Pradesh Official State Language
 *   - Hindi (hi / हिन्दी) — National Official Language
 *   - Tamil (ta / தமிழ்)
 *   - Malayalam (ml / മലയാളം)
 *   - Kannada (kn / ಕನ್ನಡ)
 *   - Bengali (bn / বাংলা)
 *   - Marathi (mr / मराठी)
 *   - Gujarati (gu / ગુજરાતી)
 *   - Odia (or / ଓଡ଼ିଆ)
 *   - Punjabi (pa / ਪੰਜਾਬੀ)
 *   - Urdu (ur / اردو)
 *   - Assamese (as / অসমীয়া)
 *   - Sanskrit (sa / संस्कृतम्)
 *   - Nepali (ne / नेपाली)
 *
 * Guntur Municipal Corporation — Suraksha Kavach Portal
 */

(function () {
    const STORAGE_KEY = 'suraksha_user_lang';
    const DEFAULT_LANG = 'en';

    const SUPPORTED_LANGUAGES = [
        { code: 'en', native: 'English', english: 'English', flag: '🇬🇧', category: 'Default' },
        { code: 'te', native: 'తెలుగు', english: 'Telugu', flag: '🇮🇳', category: 'Official State (Andhra Pradesh)', badge: 'AP Official' },
        { code: 'hi', native: 'हिन्दी', english: 'Hindi', flag: '🇮🇳', category: 'National Language', badge: 'National' },
        { code: 'ta', native: 'தமிழ்', english: 'Tamil', flag: '🇮🇳', category: 'South Indian' },
        { code: 'ml', native: 'മലയാളം', english: 'Malayalam', flag: '🇮🇳', category: 'South Indian' },
        { code: 'kn', native: 'ಕನ್ನಡ', english: 'Kannada', flag: '🇮🇳', category: 'South Indian' },
        { code: 'bn', native: 'বাংলা', english: 'Bengali', flag: '🇮🇳', category: 'Major Indian Languages' },
        { code: 'mr', native: 'मराठी', english: 'Marathi', flag: '🇮🇳', category: 'Major Indian Languages' },
        { code: 'gu', native: 'ગુજરાતી', english: 'Gujarati', flag: '🇮🇳', category: 'Major Indian Languages' },
        { code: 'or', native: 'ଓଡ଼ିଆ', english: 'Odia', flag: '🇮🇳', category: 'Major Indian Languages' },
        { code: 'pa', native: 'ਪੰਜਾਬੀ', english: 'Punjabi', flag: '🇮🇳', category: 'Major Indian Languages' },
        { code: 'ur', native: 'اردو', english: 'Urdu', flag: '🇮🇳', category: 'Major Indian Languages' },
        { code: 'as', native: 'অসমীয়া', english: 'Assamese', flag: '🇮🇳', category: 'Other Indian Languages' },
        { code: 'sa', native: 'संस्कृतम्', english: 'Sanskrit', flag: '🇮🇳', category: 'Other Indian Languages' },
        { code: 'ne', native: 'नेपाली', english: 'Nepali', flag: '🇮🇳', category: 'Other Indian Languages' }
    ];

    let currentLang = DEFAULT_LANG;

    /**
     * Get cookie value by name
     */
    function getCookie(name) {
        const v = document.cookie.match('(^|;) ?' + name + '=([^;]*)(;|$)');
        return v ? v[2] : null;
    }

    /**
     * Set translation cookie
     */
    function setTranslateCookie(langCode) {
        const hostname = window.location.hostname;
        const cookieVal = '/en/' + langCode;
        
        if (langCode === 'en') {
            // Delete cookies
            document.cookie = 'googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
            document.cookie = 'googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=' + hostname;
            document.cookie = 'googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=.' + hostname;
        } else {
            document.cookie = 'googtrans=' + cookieVal + '; path=/;';
            document.cookie = 'googtrans=' + cookieVal + '; path=/; domain=' + hostname;
            document.cookie = 'googtrans=' + cookieVal + '; path=/; domain=.' + hostname;
        }
    }

    /**
     * Detect initially saved language
     */
    function getSavedLanguage() {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored && SUPPORTED_LANGUAGES.some(l => l.code === stored)) {
            return stored;
        }
        const cookie = getCookie('googtrans');
        if (cookie) {
            const parts = cookie.split('/');
            const code = parts[parts.length - 1];
            if (SUPPORTED_LANGUAGES.some(l => l.code === code)) {
                return code;
            }
        }
        return DEFAULT_LANG;
    }

    /**
     * Initialize Google Translate Element
     */
    window.googleTranslateElementInit = function () {
        const container = document.getElementById('google_translate_element');
        if (!container) return;

        const langCodes = SUPPORTED_LANGUAGES.map(l => l.code).join(',');

        new google.translate.TranslateElement({
            pageLanguage: 'en',
            includedLanguages: langCodes,
            layout: google.translate.TranslateElement.InlineLayout.SIMPLE,
            autoDisplay: false
        }, 'google_translate_element');

        // Apply saved language once ready
        const saved = getSavedLanguage();
        if (saved && saved !== 'en') {
            setTimeout(() => {
                applyGoogleLanguage(saved, false);
            }, 600);
        }
    };

    /**
     * Apply language to Google combo box
     */
    function applyGoogleLanguage(langCode, reloadIfMissing = true) {
        const combo = document.querySelector('.goog-te-combo');
        if (combo) {
            combo.value = langCode;
            combo.dispatchEvent(new Event('change'));
        } else if (reloadIfMissing) {
            window.location.reload();
        }
    }

    /**
     * Switch language user action
     */
    window.setAppLanguage = function (langCode) {
        if (!SUPPORTED_LANGUAGES.some(l => l.code === langCode)) {
            langCode = DEFAULT_LANG;
        }

        currentLang = langCode;
        localStorage.setItem(STORAGE_KEY, langCode);
        setTranslateCookie(langCode);

        // Update UI
        updateTriggerUI(langCode);
        closeAllDropdowns();

        if (langCode === 'en') {
            // Restore English
            const combo = document.querySelector('.goog-te-combo');
            if (combo) {
                combo.value = 'en';
                combo.dispatchEvent(new Event('change'));
            }
            // Clear iframe translation state
            setTimeout(() => {
                window.location.reload();
            }, 150);
        } else {
            applyGoogleLanguage(langCode, true);
        }
    };

    /**
     * Update trigger button text with active native script
     */
    function updateTriggerUI(langCode) {
        const langObj = SUPPORTED_LANGUAGES.find(l => l.code === langCode) || SUPPORTED_LANGUAGES[0];
        
        document.querySelectorAll('.lang-current-label').forEach(el => {
            el.innerHTML = `<strong>${langObj.native}</strong> <small style="opacity:0.85;">(${langObj.english})</small>`;
        });

        // Update selected state in lists
        document.querySelectorAll('.lang-item-btn').forEach(btn => {
            if (btn.getAttribute('data-lang') === langCode) {
                btn.classList.add('selected');
                const check = btn.querySelector('.lang-check-icon');
                if (check) check.style.display = 'inline-block';
            } else {
                btn.classList.remove('selected');
                const check = btn.querySelector('.lang-check-icon');
                if (check) check.style.display = 'none';
            }
        });
    }

    /**
     * Close dropdowns
     */
    function closeAllDropdowns() {
        document.querySelectorAll('.lang-dropdown-menu').forEach(m => m.classList.remove('show'));
        document.querySelectorAll('.lang-btn-trigger').forEach(b => b.classList.remove('active'));
    }

    /**
     * Inject Google Translate script if not present
     */
    function loadGoogleTranslateScript() {
        if (!document.getElementById('google-translate-script')) {
            // Hidden container for Google Translate
            if (!document.getElementById('google_translate_element')) {
                const el = document.createElement('div');
                el.id = 'google_translate_element';
                el.style.display = 'none';
                document.body.appendChild(el);
            }

            const s = document.createElement('script');
            s.id = 'google-translate-script';
            s.src = '//translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
            s.async = true;
            document.head.appendChild(s);
        }
    }

    /**
     * Build the Language Selector HTML
     */
    function buildLanguageSelectorHTML(isFloating = false) {
        const langObj = SUPPORTED_LANGUAGES.find(l => l.code === currentLang) || SUPPORTED_LANGUAGES[0];

        let listHTML = '';
        let currentCat = '';

        SUPPORTED_LANGUAGES.forEach(lang => {
            if (lang.category !== currentCat) {
                currentCat = lang.category;
                listHTML += `<div class="lang-category-title">${currentCat}</div>`;
            }

            const isSelected = lang.code === currentLang;
            listHTML += `
                <button type="button" class="lang-item-btn ${isSelected ? 'selected' : ''}" data-lang="${lang.code}">
                    <div style="display:flex; align-items:center; gap:0.6rem;">
                        <span style="font-size:1.1rem;">${lang.flag}</span>
                        <div class="lang-item-name-group">
                            <span class="lang-item-native">${lang.native}</span>
                            <span class="lang-item-english">${lang.english}</span>
                        </div>
                    </div>
                    <div style="display:flex; align-items:center; gap:0.4rem;">
                        ${lang.badge ? `<span style="background:#e8f5e9; color:#2e7d32; font-size:0.7rem; padding:2px 8px; border-radius:10px; font-weight:700;">${lang.badge}</span>` : ''}
                        <i class="fas fa-check lang-check-icon text-green" style="font-size:0.85rem; display:${isSelected ? 'inline-block' : 'none'};"></i>
                    </div>
                </button>
            `;
        });

        if (isFloating) {
            return `
                <div class="floating-lang-container" id="floating-lang-wrapper">
                    <button type="button" class="floating-lang-pill" id="floating-lang-btn" title="Choose Language / భాష ఎంచుకోండి">
                        <i class="fas fa-language" style="font-size:1.2rem;"></i>
                        <span class="lang-current-label"><strong>${langObj.native}</strong></span>
                        <i class="fas fa-chevron-up" style="font-size:0.75rem; opacity:0.8;"></i>
                    </button>
                    <div class="lang-dropdown-menu floating-menu" id="floating-lang-dropdown">
                        <div style="padding:0.4rem 0.6rem 0.6rem; border-bottom:1px solid #f0f0f0; margin-bottom:0.6rem; display:flex; justify-content:space-between; align-items:center;">
                            <strong style="color:#2c3e50; font-size:0.95rem;"><i class="fas fa-globe text-green"></i> Select Language / భాష</strong>
                            <button type="button" class="lang-close-btn" style="background:none; border:none; color:#888; font-size:1.1rem; cursor:pointer;">&times;</button>
                        </div>
                        <input type="text" class="lang-search-box" placeholder="🔍 Search language / భాష..." />
                        <div class="lang-scroll-list" style="max-height:300px; overflow-y:auto;">
                            ${listHTML}
                        </div>
                    </div>
                </div>
            `;
        }

        return `
            <div class="lang-selector-wrapper" id="nav-lang-wrapper">
                <button type="button" class="lang-btn-trigger" id="nav-lang-btn" aria-haspopup="true" aria-expanded="false">
                    <i class="fas fa-globe" style="font-size:1.1rem;"></i>
                    <span class="lang-current-label"><strong>${langObj.native}</strong> <small style="opacity:0.85;">(${langObj.english})</small></span>
                    <i class="fas fa-chevron-down" style="font-size:0.75rem; opacity:0.85; transition:transform 0.2s;"></i>
                </button>
                <div class="lang-dropdown-menu" id="nav-lang-dropdown">
                    <div style="padding:0.4rem 0.6rem 0.6rem; border-bottom:1px solid #f0f0f0; margin-bottom:0.6rem; display:flex; justify-content:space-between; align-items:center;">
                        <strong style="color:#2c3e50; font-size:0.95rem;"><i class="fas fa-language text-green"></i> Select Language / భాష</strong>
                        <span style="font-size:0.75rem; color:#888; background:#f1f5f9; padding:2px 8px; border-radius:10px;">Default: English</span>
                    </div>
                    <input type="text" class="lang-search-box" placeholder="🔍 Search language / భాష..." />
                    <div class="lang-scroll-list" style="max-height:320px; overflow-y:auto;">
                        ${listHTML}
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Attach interactive events to language switchers
     */
    function attachLanguageEvents() {
        // Toggle Nav Dropdown
        const navBtn = document.getElementById('nav-lang-btn');
        const navDropdown = document.getElementById('nav-lang-dropdown');
        if (navBtn && navDropdown) {
            navBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                const isShown = navDropdown.classList.contains('show');
                closeAllDropdowns();
                if (!isShown) {
                    navDropdown.classList.add('show');
                    navBtn.classList.add('active');
                    const searchBox = navDropdown.querySelector('.lang-search-box');
                    if (searchBox) searchBox.focus();
                }
            });
        }

        // Toggle Floating Dropdown
        const floatBtn = document.getElementById('floating-lang-btn');
        const floatDropdown = document.getElementById('floating-lang-dropdown');
        if (floatBtn && floatDropdown) {
            floatBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                const isShown = floatDropdown.classList.contains('show');
                closeAllDropdowns();
                if (!isShown) {
                    floatDropdown.classList.add('show');
                    floatBtn.classList.add('active');
                    const searchBox = floatDropdown.querySelector('.lang-search-box');
                    if (searchBox) searchBox.focus();
                }
            });
        }

        // Close buttons inside modals
        document.querySelectorAll('.lang-close-btn').forEach(btn => {
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                closeAllDropdowns();
            });
        });

        // Item click listeners
        document.querySelectorAll('.lang-item-btn').forEach(btn => {
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                const langCode = this.getAttribute('data-lang');
                window.setAppLanguage(langCode);
            });
        });

        // Search filtering inside dropdowns
        document.querySelectorAll('.lang-search-box').forEach(input => {
            input.addEventListener('click', e => e.stopPropagation());
            input.addEventListener('input', function () {
                const q = this.value.toLowerCase().trim();
                const list = this.closest('.lang-dropdown-menu').querySelectorAll('.lang-item-btn');
                list.forEach(item => {
                    const text = item.textContent.toLowerCase();
                    if (!q || text.includes(q)) {
                        item.style.display = 'flex';
                    } else {
                        item.style.display = 'none';
                    }
                });
            });
        });

        // Document click closes dropdowns
        document.addEventListener('click', function () {
            closeAllDropdowns();
        });
    }

    /**
     * Mount language switcher on page load
     */
    function mountLanguageSwitcher() {
        currentLang = getSavedLanguage();

        // 1. Mount into .main-navbar if present
        const mainNavbar = document.querySelector('.main-navbar');
        if (mainNavbar && !document.getElementById('nav-lang-wrapper')) {
            let brandGroup = mainNavbar.querySelector('.brand-left-group');
            if (!brandGroup) {
                brandGroup = document.createElement('div');
                brandGroup.className = 'brand-left-group';
                brandGroup.style.display = 'flex';
                brandGroup.style.alignItems = 'center';
                brandGroup.style.gap = '0.8rem';
                brandGroup.style.flexWrap = 'wrap';

                while (mainNavbar.firstChild) {
                    brandGroup.appendChild(mainNavbar.firstChild);
                }
                mainNavbar.appendChild(brandGroup);
            }

            const wrapper = document.createElement('div');
            wrapper.innerHTML = buildLanguageSelectorHTML(false);
            mainNavbar.appendChild(wrapper.firstElementChild);
        }

        // 2. Mount floating pill on bottom right for instant access anywhere
        if (!document.getElementById('floating-lang-wrapper')) {
            const floatWrap = document.createElement('div');
            floatWrap.innerHTML = buildLanguageSelectorHTML(true);
            document.body.appendChild(floatWrap.firstElementChild);
        }

        // 3. Attach event handlers
        attachLanguageEvents();

        // 4. Update initial label
        updateTriggerUI(currentLang);

        // 5. Load Google Translate script
        loadGoogleTranslateScript();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mountLanguageSwitcher);
    } else {
        mountLanguageSwitcher();
    }
})();
