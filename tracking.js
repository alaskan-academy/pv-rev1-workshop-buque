(function () {
  var CONFIG = window.TRACKING_CONFIG || {};
  var PIXEL_ID = CONFIG.pixelId || '';
  var SENT_EVENTS = {};

  // ── Utilitários ──────────────────────────────────────────────

  function getCookie(name) {
    var match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? match[2] : null;
  }

  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  function getFbc() {
    var fbc = getCookie('_fbc');
    if (!fbc) {
      var params = new URLSearchParams(window.location.search);
      var fbclid = params.get('fbclid');
      if (fbclid) {
        fbc = 'fb.1.' + Date.now() + '.' + fbclid;
        document.cookie = '_fbc=' + fbc + '; max-age=' + (90 * 24 * 60 * 60) + '; path=/; SameSite=Lax';
      }
    }
    return fbc;
  }

  function saveUtms() {
    var keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
    var params = new URLSearchParams(window.location.search);
    keys.forEach(function (k) {
      if (params.get(k)) sessionStorage.setItem(k, params.get(k));
    });
  }

  // ── Disparo de eventos ───────────────────────────────────────

  function fireEvent(eventName, eventId, customData) {
    if (SENT_EVENTS[eventName]) return;
    SENT_EVENTS[eventName] = true;

    var fbpVal = getCookie('_fbp');
    var fbcVal = getFbc();

    // Browser pixel
    if (window.fbq) {
      fbq('track', eventName, customData || {}, { eventID: eventId });
    }

    // CAPI server-side
    var body = JSON.stringify({
      eventName: eventName,
      eventId: eventId,
      fbp: fbpVal,
      fbc: fbcVal,
      pageUrl: window.location.href,
    });

    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/track', new Blob([body], { type: 'application/json' }));
    } else {
      fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: true });
    }
  }

  // ── Inicialização do Pixel ───────────────────────────────────

  function initPixel() {
    if (!PIXEL_ID) return;

    // Base code do Meta Pixel
    !function (f, b, e, v, n, t, s) {
      if (f.fbq) return;
      n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
      if (!f._fbq) f._fbq = n;
      n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
      t = b.createElement(e); t.async = !0;
      t.src = v; s = b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t, s);
    }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');

    fbq('init', PIXEL_ID);

    // PageView com deduplicação
    var pvId = generateId();
    fbq('track', 'PageView', {}, { eventID: pvId });

    var fbpVal = getCookie('_fbp');
    var fbcVal = getFbc();
    var body = JSON.stringify({ eventName: 'PageView', eventId: pvId, fbp: fbpVal, fbc: fbcVal, pageUrl: window.location.href });

    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/track', new Blob([body], { type: 'application/json' }));
    } else {
      fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: true });
    }

    SENT_EVENTS['PageView'] = true;
  }

  // ── ViewContent após 5 segundos ──────────────────────────────

  function initViewContent() {
    setTimeout(function () {
      fireEvent('ViewContent', generateId(), {
        content_ids: [CONFIG.productId],
        content_name: CONFIG.productName,
        value: CONFIG.productValue,
        currency: 'BRL',
      });
    }, 5000);
  }

  // ── Scroll depth ─────────────────────────────────────────────

  function initScrollTracking() {
    var fired50 = false, fired75 = false;

    function onScroll() {
      var scrolled = window.scrollY + window.innerHeight;
      var total = document.documentElement.scrollHeight;
      var pct = (scrolled / total) * 100;

      if (!fired50 && pct >= 50) {
        fired50 = true;
        fireEvent('ScrollDepth50', generateId());
      }
      if (!fired75 && pct >= 75) {
        fired75 = true;
        fireEvent('ScrollDepth75', generateId());
        window.removeEventListener('scroll', onScroll);
      }
    }

    window.addEventListener('scroll', onScroll, { passive: true });
  }

  // ── InitiateCheckout ─────────────────────────────────────────

  function initCheckoutTracking() {
    document.addEventListener('click', function (e) {
      var el = e.target.closest('a[href]');
      if (!el) return;
      if (!el.href.includes('checkout.payt.com.br')) return;

      fireEvent('InitiateCheckout', generateId(), {
        content_ids: [CONFIG.productId],
        content_name: CONFIG.productName,
        value: CONFIG.productValue,
        currency: 'BRL',
        num_items: 1,
      });
    });
  }

  // ── Bootstrap ────────────────────────────────────────────────

  saveUtms();
  initPixel();
  initViewContent();
  initScrollTracking();
  initCheckoutTracking();

})();
