'use client';

import { usePathname } from 'next/navigation';
import { NotificationCenter } from './NotificationCenter';
import { GlobalSearch } from './GlobalSearch';
import { ThemeToggle } from './ThemeToggle';

const PAGE_TITLES: Record<string, string> = {
  '/admin/dashboard': 'Dashboard',
  '/admin/registrations': 'Registrations',
  '/admin/bookings': 'Tour Bookings',
  '/admin/pages': 'Page Management',
  '/admin/events': 'News & Events',
  '/admin/gallery': 'Gallery & Media',
  '/admin/facilities': 'Facilities',
  '/admin/age-groups': 'Age Groups',
  '/admin/seo': 'SEO Settings',
  '/admin/analytics': 'Analytics',
  '/admin/users': 'Users & Roles',
  '/admin/activity-log': 'Activity Log',
};

export function Topbar() {
  const pathname = usePathname();
  const title = PAGE_TITLES[pathname] || 'Admin';

  return (
    <header className="h-16 border-b border-panel-line/50 bg-panel-base/80 backdrop-blur-sm flex items-center justify-between px-6 sticky top-0 z-30">
      <div>
        <h1 className="text-lg font-semibold text-panel-strong tracking-tight">{title}</h1>
      </div>
      <div className="flex items-center gap-3">
        <GlobalSearch />
        <ThemeToggle />
        <NotificationCenter />
        <a
          href="/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-panel-muted hover:text-panel-body transition-colors px-3 py-1.5 rounded-md border border-panel-line hover:border-panel-line-2"
        >
          View Site →
        </a>
      </div>
    </header>
  );
}
