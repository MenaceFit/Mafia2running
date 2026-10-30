/* Mafia Running Premium — theme script (no dependencies, ~6 kB min). */
(() => {
  'use strict';

  const root = document.documentElement;
  const config = window.themeConfig || { routes: {}, strings: {} };
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const animationsOn = !root.classList.contains('no-anim') && !reduceMotion;
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  /* ------------------------------------------------------------------
   * Tracking (consent-aware)
   * Events go to window.dataLayer (GTM) and Shopify Customer Events
   * (custom events visible to custom pixels), only when the visitor has
   * accepted analytics via the Shopify cookie banner.
   * ------------------------------------------------------------------ */
  const Tracking = (() => {
    let privacyReady = false;
    const queue = [];

    const allowed = () => {
      const cp = window.Shopify && window.Shopify.customerPrivacy;
      if (!cp) return false;
      try {
        return cp.analyticsProcessingAllowed ? cp.analyticsProcessingAllowed() : cp.userCanBeTracked();
      } catch (e) {
        return false;
      }
    };

    const send = (name, data) => {
      if (!config.tracking || !allowed()) return;
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push(Object.assign({ event: name }, data));
      try {
        if (window.Shopify && window.Shopify.analytics && window.Shopify.analytics.publish) {
          window.Shopify.analytics.publish(name, data);
        }
      } catch (e) { /* ignore */ }
    };

    const flush = () => { while (queue.length) send(...queue.shift()); };

    if (window.Shopify && window.Shopify.loadFeatures) {
      window.Shopify.loadFeatures([{ name: 'consent-tracking-api', version: '0.1' }], (err) => {
        privacyReady = !err;
        flush();
      });
      document.addEventListener('visitorConsentCollected', flush);
    } else {
      privacyReady = true;
    }

    return {
      track(name, data = {}) {
        if (!config.tracking) return;
        if (privacyReady) send(name, data);
        else queue.push([name, data]);
      }
    };
  })();
  window.themeTrack = Tracking.track;

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-track]');
    if (!el || el.type === 'submit') return; // submits are tracked by the buy form
    Tracking.track(el.dataset.track, { location: el.dataset.trackLabel || '', label: el.textContent.trim().slice(0, 60) });
  });

  /* ------------------------------------------------------------------
   * Sticky header
   * ------------------------------------------------------------------ */
  const onScroll = () => root.classList.toggle('is-scrolled', window.scrollY > 12);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  /* ------------------------------------------------------------------
   * Mobile menu
   * ------------------------------------------------------------------ */
  const toggle = $('[data-menu-toggle]');
  const menu = $('[data-mobile-menu]');
  if (toggle && menu) {
    const setOpen = (open) => {
      root.classList.toggle('menu-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu');
      menu.toggleAttribute('inert', !open);
      if (open) setTimeout(() => { const first = $('a', menu); first && first.focus({ preventScroll: true }); }, 250);
    };
    menu.setAttribute('inert', '');
    toggle.addEventListener('click', () => setOpen(!root.classList.contains('menu-open')));
    $$('[data-menu-link]', menu).forEach((a) => a.addEventListener('click', () => setOpen(false)));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && root.classList.contains('menu-open')) { setOpen(false); toggle.focus(); }
    });
    window.matchMedia('(min-width: 990px)').addEventListener('change', (m) => m.matches && setOpen(false));
  }

  /* ------------------------------------------------------------------
   * Scroll reveal + animated counters
   * ------------------------------------------------------------------ */
  const animateCount = (el) => {
    const target = parseFloat(el.dataset.count);
    if (!animationsOn || !isFinite(target) || target <= 1) { el.textContent = el.dataset.count; return; }
    const duration = 1400;
    const start = performance.now();
    const step = (now) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 4);
      el.textContent = Math.round(target * eased);
      if (p < 1) requestAnimationFrame(step);
    };
    el.textContent = '0';
    requestAnimationFrame(step);
  };

  const revealEls = $$('[data-reveal]');
  const countEls = $$('[data-count]');
  if ('IntersectionObserver' in window && !window.Shopify?.designMode) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0 });
    revealEls.forEach((el) => io.observe(el));

    const countIo = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        animateCount(entry.target);
        countIo.unobserve(entry.target);
      });
    }, { threshold: 0.6 });
    countEls.forEach((el) => countIo.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add('is-visible'));
  }

  /* ------------------------------------------------------------------
   * Hero parallax (pointer devices only)
   * ------------------------------------------------------------------ */
  const parallaxRoot = $('[data-parallax-root]');
  if (parallaxRoot && animationsOn && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    const layers = $$('[data-parallax]', parallaxRoot);
    let raf = null;
    let tx = 0, ty = 0;
    const apply = () => {
      layers.forEach((layer) => {
        const depth = parseFloat(layer.dataset.parallax) || 1;
        layer.style.translate = `${(tx * depth * 10).toFixed(2)}px ${(ty * depth * 10).toFixed(2)}px`;
      });
      raf = null;
    };
    parallaxRoot.closest('section').addEventListener('pointermove', (e) => {
      const r = parallaxRoot.getBoundingClientRect();
      tx = (e.clientX - (r.left + r.width / 2)) / r.width;
      ty = (e.clientY - (r.top + r.height / 2)) / r.height;
      if (!raf) raf = requestAnimationFrame(apply);
    });
    parallaxRoot.closest('section').addEventListener('pointerleave', () => { tx = 0; ty = 0; if (!raf) raf = requestAnimationFrame(apply); });
  }

  /* ------------------------------------------------------------------
   * Resource cards: spotlight follows pointer
   * ------------------------------------------------------------------ */
  $$('[data-spotlight]').forEach((card) => {
    card.addEventListener('pointerenter', (e) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`);
      card.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`);
    });
  });

  /* ------------------------------------------------------------------
   * Button ripple (micro-interaction)
   * ------------------------------------------------------------------ */
  if (animationsOn) {
    document.addEventListener('pointerdown', (e) => {
      const btn = e.target.closest('.btn');
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      const size = Math.max(r.width, r.height);
      const span = document.createElement('span');
      span.className = 'ripple';
      span.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`;
      btn.appendChild(span);
      span.addEventListener('animationend', () => span.remove());
    });
  }

  /* ------------------------------------------------------------------
   * FAQ accordion (animated <details>, still works without JS)
   * ------------------------------------------------------------------ */
  $$('[data-accordion]').forEach((details) => {
    const summary = $('summary', details);
    const content = $('.accordion__content', details);
    if (!summary || !content) return;
    let anim = null;

    summary.addEventListener('click', (e) => {
      if (!animationsOn || !content.animate) return;
      e.preventDefault();
      if (anim) anim.cancel();
      const opening = !details.open;
      if (opening) {
        details.open = true;
        const h = content.scrollHeight;
        anim = content.animate([{ height: '0px', opacity: 0 }, { height: `${h}px`, opacity: 1 }], { duration: 420, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
        Tracking.track('faq_open', { question: summary.textContent.trim().slice(0, 100) });
      } else {
        const h = content.offsetHeight;
        anim = content.animate([{ height: `${h}px`, opacity: 1 }, { height: '0px', opacity: 0 }], { duration: 320, easing: 'cubic-bezier(0.65, 0, 0.35, 1)' });
        anim.onfinish = () => { details.open = false; };
      }
      anim.addEventListener('finish', () => { anim = null; });
    });
  });

  /* ------------------------------------------------------------------
   * Buy form → (clear cart) → add access → checkout
   * ------------------------------------------------------------------ */
  const toast = $('.toast');
  const showToast = (msg) => {
    if (!toast) return;
    toast.textContent = msg;
    toast.hidden = false;
    clearTimeout(showToast.t);
    showToast.t = setTimeout(() => { toast.hidden = true; }, 4000);
  };

  $$('[data-buy-form]').forEach((form) => {
    form.noValidate = true;
    const btn = $('button[type="submit"]', form);
    const errorEl = $('[data-form-error]', form);
    const waiver = $('[data-waiver]', form);
    const waiverInput = waiver && $('input', waiver);
    let product = {};
    try { product = JSON.parse($('[data-product-json]', form).textContent); } catch (e) { /* ignore */ }

    const setError = (msg) => {
      if (!errorEl) return;
      errorEl.textContent = msg || '';
      errorEl.hidden = !msg;
    };

    if (waiverInput) {
      waiverInput.addEventListener('change', () => {
        if (waiverInput.checked) { waiver.classList.remove('is-invalid'); setError(''); }
      });
    }

    form.addEventListener('submit', async (e) => {
      if (waiverInput && !waiverInput.checked) {
        e.preventDefault();
        waiver.classList.remove('is-invalid');
        void waiver.offsetWidth; // restart shake animation
        waiver.classList.add('is-invalid');
        setError(config.strings.waiver);
        waiverInput.focus();
        return;
      }

      const item = { currency: product.currency, value: product.price, items: [{ item_id: String(product.id), item_name: product.title, price: product.price, quantity: 1 }] };
      Tracking.track('cta_click', { location: form.dataset.location || 'buy_form', label: btn ? btn.textContent.trim() : '' });

      if (!window.fetch || !config.routes.cartAdd) return; // native POST fallback
      e.preventDefault();
      btn && btn.setAttribute('aria-busy', 'true');
      setError('');

      try {
        const fd = new FormData(form);
        const properties = {};
        for (const [k, v] of fd.entries()) {
          const m = k.match(/^properties\[(.+)\]$/);
          if (m) properties[m[1]] = v;
        }

        if (config.directCheckout) {
          await fetch(config.routes.cartClear, { method: 'POST', headers: { Accept: 'application/json' } });
        }
        const res = await fetch(config.routes.cartAdd, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ items: [{ id: Number(fd.get('id')), quantity: 1, properties }] })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.description || data.message || config.strings.unavailable);

        Tracking.track('add_to_cart', item);
        if (config.directCheckout) {
          Tracking.track('begin_checkout', item);
          window.location.href = '/checkout';
        } else {
          window.location.href = config.routes.cart;
        }
      } catch (err) {
        btn && btn.removeAttribute('aria-busy');
        const msg = (err && err.message) || config.strings.error;
        setError(msg);
        showToast(msg);
      }
    });
  });

  /* ------------------------------------------------------------------
   * Product page view event
   * ------------------------------------------------------------------ */
  const productView = $('[data-product-view]');
  if (productView) {
    try {
      const p = JSON.parse(productView.textContent);
      Tracking.track('view_item', { currency: p.currency, value: p.price, items: [{ item_id: String(p.id), item_name: p.title, price: p.price }] });
    } catch (e) { /* ignore */ }
  }

  /* ------------------------------------------------------------------
   * Sticky mobile CTA: visible after the hero, hidden over the offer/footer
   * ------------------------------------------------------------------ */
  const sticky = $('[data-sticky-cta]');
  if (sticky && 'IntersectionObserver' in window) {
    const hero = $('.hero') || $('.sh') || $('.page-head');
    const blockers = [$('[data-offer]'), $('.footer')].filter(Boolean);
    const state = { pastHero: !hero, blocked: new Set() };
    const update = () => {
      const show = state.pastHero && state.blocked.size === 0;
      sticky.classList.toggle('is-shown', show);
      sticky.setAttribute('aria-hidden', String(!show));
      const link = $('a', sticky);
      link && (show ? link.removeAttribute('tabindex') : link.setAttribute('tabindex', '-1'));
    };
    if (hero) {
      new IntersectionObserver(([entry]) => {
        state.pastHero = !entry.isIntersecting && entry.boundingClientRect.top < 0;
        update();
      }).observe(hero);
    }
    const blockIo = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) state.blocked.add(entry.target); else state.blocked.delete(entry.target);
      });
      update();
    });
    blockers.forEach((b) => blockIo.observe(b));
    update();
  }

  /* ------------------------------------------------------------------
   * Theme editor: keep things visible & in sync
   * ------------------------------------------------------------------ */
  document.addEventListener('shopify:section:load', (e) => {
    $$('[data-reveal]', e.target).forEach((el) => el.classList.add('is-visible'));
  });
  document.addEventListener('shopify:block:select', (e) => {
    const d = e.target.closest('details');
    if (d) d.open = true;
  });
})();
