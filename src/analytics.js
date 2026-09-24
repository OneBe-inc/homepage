// OneBe LP: production-only GA4. No form values, link URLs or free text are sent.
(() => {
  'use strict';

  const measurementId = 'G-21K44SV7K0';
  const disabledKey = `ga-disable-${measurementId}`;
  const stateKey = '__onebeHomepageAnalytics';
  if (location.protocol !== 'https:' || location.hostname !== 'onebe-inc.github.io' ||
      !location.pathname.startsWith('/homepage/') || window[stateKey]) return;

  const consentKeys = [
    'onebe:analytics-consent', 'onebe-analytics-consent', 'onebe_analytics_consent',
    'analytics-consent', 'analytics_consent', 'cookie-consent', 'cookie_consent',
    disabledKey
  ];
  const deniedValues = new Set(['denied', 'deny', 'rejected', 'reject', 'false', '0', 'off']);
  const isDenied = value => {
    if (value === false || value === 0) return true;
    if (typeof value === 'string') return deniedValues.has(value.trim().toLowerCase());
    if (!value || typeof value !== 'object') return false;
    return ['analytics', 'analytics_storage', 'statistics', 'consent', 'preferences']
      .some(key => Object.prototype.hasOwnProperty.call(value, key) && isDenied(value[key]));
  };
  const hasOptedOut = () => {
    if (window[disabledKey] === true) return true;
    try {
      return consentKeys.some(key => {
        const raw = window.localStorage.getItem(key);
        if (raw === null) return false;
        if (key === disabledKey) return raw === 'true' || raw === '1';
        try { return isDenied(JSON.parse(raw)); }
        catch { return isDenied(raw); }
      });
    } catch {
      // A restricted storage API must never interrupt the LP.
      return false;
    }
  };
  if (hasOptedOut()) return;

  const withoutParameters = value => {
    try {
      const parsed = new URL(value);
      return /^https?:$/.test(parsed.protocol) ? parsed.origin + parsed.pathname : '';
    } catch { return ''; }
  };
  const pageContext = {
    page_location: location.origin + location.pathname,
    page_referrer: withoutParameters(document.referrer),
    page_title: 'OneBe｜定額ホームページサービス'
  };
  const contactLocations = new Set([
    'header', 'hero', 'services', 'pricing-simple', 'pricing-plus',
    'pricing-premium', 'closing', 'mobile', 'sample'
  ]);
  const sampleIds = new Set([
    'sola', 'lumiere', 'kokoro', 'atelier', 'komorebi', 'nagi', 'table', 'luce', 'natura'
  ]);
  const categories = new Set(['cafe', 'salon', 'retail', 'architecture', 'restaurant', 'wellness']);

  window[stateKey] = true;
  window.dataLayer = window.dataLayer || [];
  if (typeof window.gtag !== 'function') {
    window.gtag = function () { window.dataLayer.push(arguments); };
  }
  const tag = (...args) => {
    try { window.gtag(...args); }
    catch { /* Analytics blockers must not affect navigation or sample previews. */ }
  };
  const event = (name, parameters) => {
    if (hasOptedOut()) return;
    tag('event', name, { ...pageContext, ...parameters, send_to: measurementId });
  };

  tag('js', new Date());
  tag('config', measurementId, {
    ...pageContext,
    send_page_view: false,
    allow_google_signals: false,
    allow_ad_personalization_signals: false
  });
  event('page_view', {});

  document.addEventListener('click', click => {
    const target = click.target instanceof Element ? click.target.closest('[data-contact]') : null;
    if (!target || !contactLocations.has(target.dataset.location)) return;
    event('contact_click', { contact_type: 'consultation', cta_location: target.dataset.location });
  });
  document.addEventListener('onebe:sample-detail', sampleEvent => {
    const detail = sampleEvent.detail;
    if (!detail || !sampleIds.has(detail.sampleId) || !categories.has(detail.category)) return;
    event('sample_view', { sample_id: detail.sampleId, category: detail.category });
  });
  window.addEventListener('storage', storageEvent => {
    if ((storageEvent.key === null || consentKeys.includes(storageEvent.key)) && hasOptedOut()) {
      window[disabledKey] = true;
      tag('consent', 'update', { analytics_storage: 'denied' });
    }
  });

  try {
    const alreadyLoaded = Array.from(document.scripts).some(script => {
      try {
        const url = new URL(script.src, location.href);
        return url.hostname === 'www.googletagmanager.com' && url.pathname === '/gtag/js';
      } catch { return false; }
    });
    if (!alreadyLoaded) {
      const script = document.createElement('script');
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
      document.head.appendChild(script);
    }
  } catch { /* The LP remains usable if script loading is restricted. */ }
})();
