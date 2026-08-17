'use client';

import { usePathname } from 'next/navigation';
import { NotificationCenter } from './NotificationCenter';

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
    <header className="h-16 border-b border-zinc-800/50 bg-[#0a0a0f]/80 backdrop-blur-sm flex items-center justify-between px-6 sticky top-0 z-30">
      <div>
        <h1 className="text-lg font-semibold text-zinc-100 tracking-tight">{title}</h1>
      </div>
      <div className="flex items-center gap-3">
        <NotificationCenter />
        <a
          href="/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors px-3 py-1.5 rounded-md border border-zinc-800 hover:border-zinc-700"
        >
          View Site →
        </a>
      </div>
    </header>
  );
}
