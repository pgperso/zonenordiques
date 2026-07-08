import { GA_MEASUREMENT_ID } from '@arena/shared';

// Google Analytics 4. Reuses the gtag/dataLayer and Consent Mode v2 defaults
// established by AdSenseLoader, so it MUST render after AdSenseLoader in the
// document head (the 'denied' consent defaults have to be set before the GA
// config call). Under denied consent, GA4 sends cookieless pings (Consent
// Mode v2 modeled data) — compliant with Law 25 / GDPR — and upgrades to full
// measurement once CookieConsent grants analytics_storage.
//
// Native <script> tags (not next/script) so they render literally into the
// SSR HTML. gtag.js is nonce'd, so it loads under the strict-dynamic CSP.
// The injected markup is fully static (only the compile-time GA_MEASUREMENT_ID
// constant is interpolated — no user input), matching AdSenseLoader.
const gaConfigScript = `
window.dataLayer = window.dataLayer || [];
window.gtag = window.gtag || function(){window.dataLayer.push(arguments);};
window.gtag('js', new Date());
window.gtag('config', '${GA_MEASUREMENT_ID}');
`.trim();

export function GoogleAnalytics({ nonce }: { nonce: string }) {
  return (
    <>
      <script
        async
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
        nonce={nonce}
      />
      <script nonce={nonce} dangerouslySetInnerHTML={{ __html: gaConfigScript }} />
    </>
  );
}
