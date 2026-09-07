/**
 * Global 3D Effects — Jal Suraksha GMC Portal
 * ===========================================
 * Loaded from base.html on EVERY page:
 *   - Cursor-following 3D tilt on cards / badges / stat boxes
 *   - Staggered 3D entrance as sections scroll into view
 *   - Gentle parallax tilt on hero banners
 *   - Auto re-binding for dynamically rendered content (live widgets)
 *
 * Honours prefers-reduced-motion; animates transform/opacity only.
 */
(function () {
    'use strict';
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    var TILT_SELECTORS = [
        '.info-card', '.disaster-card', '.step-item', '.guideline-card',
        '.category-card', '.stat-box', '.step-card', '.landslide-badge',
        '.flood-badge'
    ].join(', ');

    var RISE_SELECTORS = [
        '.info-card', '.disaster-card', '.step-item', '.guideline-card',
        '.category-card', '.stat-box', '.step-card'
    ].join(', ');

    var HERO_SELECTORS = '.detail-hero, .disaster-hero, .reporting-hero, .hero-section';

    /* ---------------- Cursor-following 3D tilt ---------------- */
    function attachTilt(root) {
        root.querySelectorAll(TILT_SELECTORS).forEach(function (el) {
            if (el.dataset.fxTiltBound) return;
            el.dataset.fxTiltBound = '1';
            el.classList.add('fx-tilt');
            el.addEventListener('pointermove', function (e) {
                if (e.pointerType === 'touch') return;
                var r = el.getBoundingClientRect();
                var px = (e.clientX - r.left) / r.width - 0.5;
                var py = (e.clientY - r.top) / r.height - 0.5;
                el.style.transform = 'perspective(700px) rotateX(' +
                    (-py * 7).toFixed(2) + 'deg) rotateY(' + (px * 9).toFixed(2) +
                    'deg) translateZ(6px)';
            });
            el.addEventListener('pointerleave', function () {
                el.style.transform = '';
            });
        });
    }

    /* ------------- Staggered entrance on scroll --------------- */
    function bindRise(root) {
        var els = Array.prototype.slice.call(root.querySelectorAll(RISE_SELECTORS));
        if (!('IntersectionObserver' in window)) {
            els.forEach(function (el) { el.classList.add('fx-rise-in'); });
            return;
        }
        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) return;
                var el = entry.target;
                io.unobserve(el);
                if (el.dataset.fxBound) return;
                el.dataset.fxBound = '1';
                var idx = Array.prototype.indexOf.call(el.parentNode.children, el);
                el.style.animationDelay = Math.min(idx * 90, 540) + 'ms';
                el.classList.add('fx-rise-in');
            });
        }, { threshold: 0.12 });
        els.forEach(function (el) {
            if (!el.dataset.fxBound && !el.classList.contains('fx-rise-in')) io.observe(el);
        });
    }

    /* ---------------- Hero parallax tilt ---------------------- */
    function attachHeroParallax(root) {
        root.querySelectorAll(HERO_SELECTORS).forEach(function (hero) {
            if (hero.dataset.fxHeroBound) return;
            hero.dataset.fxHeroBound = '1';
            hero.style.perspective = hero.style.perspective || '1000px';
            var content = hero.querySelector(':scope > div') || hero.firstElementChild;
            if (!content) return;
            content.style.transition = 'transform 0.25s ease-out';
            content.style.transformStyle = 'preserve-3d';
            hero.addEventListener('pointermove', function (e) {
                if (e.pointerType === 'touch') return;
                var r = hero.getBoundingClientRect();
                var dx = (e.clientX - r.left) / r.width - 0.5;
                var dy = (e.clientY - r.top) / r.height - 0.5;
                content.style.transform = 'rotateX(' + (-dy * 4).toFixed(2) +
                    'deg) rotateY(' + (dx * 6).toFixed(2) + 'deg) translateZ(6px)';
            });
            hero.addEventListener('pointerleave', function () {
                content.style.transform = '';
            });
        });
    }

    /* ---------------- Orchestration --------------------------- */
    function runAll(root) {
        try { attachTilt(root); } catch (e) { /* non-fatal */ }
        try { bindRise(root); } catch (e) { /* non-fatal */ }
        try { attachHeroParallax(root); } catch (e) { /* non-fatal */ }
    }

    function init() { runAll(document); }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    /* Re-bind whenever live widgets re-render (60s auto-refresh etc.) */
    if ('MutationObserver' in window && document.body) {
        var mo = new MutationObserver(function () { runAll(document.body); });
        window.addEventListener('load', function () {
            mo.observe(document.body, { childList: true, subtree: true });
        });
    }
})();