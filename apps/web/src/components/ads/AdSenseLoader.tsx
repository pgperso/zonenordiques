import { ADSENSE_CLIENT_ID } from '@arena/shared';

// AdSense script must always load — Google's verifier bot does not accept
// cookies, so a consent-gated load makes the site look like the code is
// not installed and AdSense rejects the application.
//
// Both <script> tags are native HTML (not next/script) so they render
// literally into the SSR HTML and are visible to AdSense crawlers that
// don't execute JavaScript.
//
// Privacy is enforced via Google Consent Mode v2: defaults are 'denied'
// in the inline script below, then upgraded to 'granted' by CookieConsent
// on user acceptance. While denied, AdSense serves non-personalized ads
// with redacted data, which is compliant with Law 25 / GDPR.
const consentDefaultScript = `
window.dataLayer = window.dataLayer || [];
window.gtag = window.gtag || function(){window.dataLayer.push(arguments);};
window.gtag('consent', 'default', {
  'ad_storage': 'denied',
  'ad_user_data': 'denied',
  'ad_personalization': 'denied',
  'analytics_storage': 'denied',
  'wait_for_update': 500
});
window.gtag('set', 'ads_data_redaction', true);
`.trim();

export function AdSenseLoader({ nonce }: { nonce: string }) {
  return (
    <>
      <script
        nonce={nonce}
        dangerouslySetInnerHTML={{ __html: consentDefaultScript }}
      />
      <script
        async
        src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT_ID}`}
        crossOrigin="anonymous"
        nonce={nonce}
      />
    </>
  );
}
