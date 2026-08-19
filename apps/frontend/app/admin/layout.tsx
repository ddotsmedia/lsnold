'use client';

import { useState } from 'react';
import { AuthProvider } from '../../lib/auth-context';
import { AdminGuard } from '../../components/admin/AdminGuard';
import { Sidebar } from '../../components/admin/Sidebar';
import { Topbar } from '../../components/admin/Topbar';
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

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

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
            <main className="p-6">{children}</main>
          </div>
        </div>
        </AdminGuard>
      </AuthProvider>
    </PanelTheme>
  );
}
