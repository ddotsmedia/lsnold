import React from 'react';
import type { Metadata } from 'next';
import { Caveat, Nunito } from 'next/font/google';
import './globals.css';
import { ChatbotWidget } from '@/components/ChatbotWidget';
import { WhatsAppContact } from '@/components/WhatsAppContact';
import { SiteMediaProvider } from '@/components/SiteMediaProvider';
import { getSiteMedia, getSiteBranding } from '@/lib/siteMedia.server';
import { fontStack, clampFontSize } from '@/lib/typography';

const caveat = Caveat({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-heading',
  display: 'swap',
});

const nunito = Nunito({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-body',
  display: 'swap',
});

/**
 * Async because the favicon is an uploaded image like the logo, not a file in
 * the repo. There is no app/favicon.ico and no public/favicon.ico, so until
 * this existed every page load asked for /favicon.ico and got a 404 — setting
 * site_media.favicon alone changed nothing, because nothing read it.
 *
 * Falls back to the logo when no favicon has been uploaded, and emits nothing
 * at all when neither is set, which is the old behaviour rather than a broken
 * <link>.
 */
export async function generateMetadata(): Promise<Metadata> {
  const siteMedia = await getSiteMedia();
  const icon = siteMedia.favicon?.url ?? siteMedia.logo?.url;

  return {
    title: 'Little Smarties Nursery',
    description: 'Quality early childhood education and care',
    ...(icon ? { icons: { icon, shortcut: icon, apple: icon } } : {}),
  };
}

/**
 * Async so the site-wide images can be read before anything renders. The
 * header is inside {children} on every page and needs the logo on the first
 * paint; fetching it here is the only place that happens before the markup is
 * built.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [siteMedia, branding] = await Promise.all([getSiteMedia(), getSiteBranding()]);

  return (
    /*
     * Typography is set here as custom properties rather than as a plain
     * font-family, because globals.css styles `body`, and a rule on body beats
     * an inherited value from html. body reads these two variables instead.
     *
     * fontSize goes on <html> because every size on the site is in rem, and rem
     * resolves against the root element — setting it on body would leave every
     * Tailwind text- class exactly where it was and make the slider do nothing.
     *
     * Server-rendered, so the page arrives already in the chosen font. A client
     * effect would repaint the whole site a moment after it appeared, which is
     * a far worse version of the logo flicker.
     */
    <html
      lang="en"
      className={`${caveat.variable} ${nunito.variable}`}
      style={{
        ['--site-font' as string]: fontStack(branding.font_family),
        fontSize: `${clampFontSize(branding.base_font_size)}px`,
      }}
    >
      <body className="bg-white text-gray-900">
        <SiteMediaProvider value={siteMedia}>{children}</SiteMediaProvider>
        {/*
          Both are client components. The WhatsApp button previously lived
          inline here with onMouseEnter/onMouseLeave handlers, which this file
          cannot carry: layout.tsx is a server component and event handlers are
          not allowed in one. Hover styling now comes from Tailwind instead.
        */}
        <WhatsAppContact />
        <ChatbotWidget />
      </body>
    </html>
  );
}
