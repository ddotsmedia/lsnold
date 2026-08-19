'use client';

import Script from 'next/script';

/**
 * Loads Hotjar in the admin panel, if and only if a site id is configured.
 *
 * Inert by default. With NEXT_PUBLIC_HOTJAR_ID unset this renders nothing and
 * no third party sees anything, which is the state it ships in — turning it on
 * is a decision about sending a nursery's records to an external processor,
 * and that is not a decision a deploy should make silently.
 *
 * Read SUPPRESSION below before enabling it.
 *
 * SUPPRESSION
 * Hotjar masks form inputs by default. It does not mask text that is already
 * on the page: a table of registrations is rendered text, and a recording
 * captures it as drawn. This panel lists children's names alongside their
 * dates of birth, which is precisely the pair that should never leave it.
 *
 * So the recorder is kept away from that content in two places:
 *
 *   1. By route, in app/admin/layout.tsx — the pages built around family
 *      records carry data-hj-suppress on <main>.
 *   2. By component, on the pieces that surface the same names on every page
 *      regardless of route — global search results and the live feed.
 *
 * Route gating alone would not be enough. Hotjar keeps recording across
 * client-side navigation once it has loaded, so an admin who lands on the
 * dashboard and then opens Registrations would be recorded there too. The
 * attributes are what actually holds; the route check just decides where they
 * go.
 */

const HOTJAR_ID = process.env.NEXT_PUBLIC_HOTJAR_ID;

export function SessionRecording() {
  if (!HOTJAR_ID) return null;

  return (
    <Script id="hotjar-init" strategy="afterInteractive">
      {`(function(h,o,t,j,a,r){
        h.hj=h.hj||function(){(h.hj.q=h.hj.q||[]).push(arguments)};
        h._hjSettings={hjid:${JSON.stringify(HOTJAR_ID)},hjsv:6};
        a=o.getElementsByTagName('head')[0];
        r=o.createElement('script');r.async=1;
        r.src=t+h._hjSettings.hjid+j;
        a.appendChild(r);
      })(window,document,'https://static.hotjar.com/c/hotjar-','.js?sv=');`}
    </Script>
  );
}
