'use client';

import { useState } from 'react';
import { AuthProvider } from '../../lib/auth-context';
import { AdminGuard } from '../../components/admin/AdminGuard';
import { Sidebar } from '../../components/admin/Sidebar';
import { Topbar } from '../../components/admin/Topbar';
import { SessionRecording } from '../../components/admin/SessionRecording';
import { usePathname } from 'next/navigation';
import { ThemeProvider } from 'next-themes';
import { MotionConfig } from 'framer-motion';

/**
 * Theme scope.
 *
 * Deliberately here rather than the root layout: the class it sets drives the
 * panel's tokens, and putting it on <html> would let a dark preference reach
 * the public pages, which have their own fixed light design.
 *
 * defaultTheme is system so a first visit matches the machine; anyone who
 * picks explicitly overrides it from then on.
 */
function PanelTheme({ children }: { children: React.ReactNode }) {
  return (
    // disableTransitionOnChange: the panel has no colour transitions worth
    // preserving mid-switch, and leaving them on makes the change look like a
    // slow repaint rather than a toggle.
    <MotionConfig reducedMotion="user">
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      storageKey="lsn-admin-theme"
      disableTransitionOnChange
    >
      {children}
    </ThemeProvider>
    </MotionConfig>
  );
}

/**
 * Routes whose content must never reach a session recording.
 *
 * These list children's names against their dates of birth, and parents'
 * email addresses and phone numbers. Prefix match, so detail pages under each
 * are covered too.
 *
 * Add to this list when a page starts showing family records — the default
 * for a new admin page is to be recorded, and that default is only safe for
 * pages about the site rather than about the families using it.
 */
const NO_RECORDING = ['/admin/registrations', '/admin/bookings', '/admin/chatbot'];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const suppressed = NO_RECORDING.some((route) => (pathname ?? '').startsWith(route));

  // Login page has no shell
  if (pathname === '/admin/login') {
    return <PanelTheme><AuthProvider>{children}</AuthProvider></PanelTheme>;
  }

  return (
    <PanelTheme>
      <AuthProvider>
        <AdminGuard>
        <div className="admin-scroll min-h-screen bg-panel-base text-panel-strong">
          <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
          <div className={`transition-all duration-300 ${collapsed ? 'ml-[68px]' : 'ml-[260px]'}`}>
            <Topbar />
            <SessionRecording />
            {/* data-hj-suppress blanks this subtree in any recording. It is
                applied to the whole page rather than to the table inside it,
                because the same records also appear in toasts, modals and
                confirmation dialogs on these routes. */}
            <main className="p-6" {...(suppressed ? { 'data-hj-suppress': true } : {})}>
              {children}
            </main>
          </div>
        </div>
        </AdminGuard>
      </AuthProvider>
    </PanelTheme>
  );
}
