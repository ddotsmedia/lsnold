import React from 'react';
import type { Metadata } from 'next';
import { Caveat, Nunito } from 'next/font/google';
import './globals.css';
import { ChatbotWidget } from '@/components/ChatbotWidget';
import { WhatsAppContact } from '@/components/WhatsAppContact';
import { SiteMediaProvider } from '@/components/SiteMediaProvider';
import { getSiteMedia } from '@/lib/siteMedia.server';

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

export const metadata: Metadata = {
  title: 'Little Smarties Nursery',
  description: 'Quality early childhood education and care',
};

/**
 * Async so the site-wide images can be read before anything renders. The
 * header is inside {children} on every page and needs the logo on the first
 * paint; fetching it here is the only place that happens before the markup is
 * built.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const siteMedia = await getSiteMedia();

  return (
    <html lang="en" className={`${caveat.variable} ${nunito.variable}`}>
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
