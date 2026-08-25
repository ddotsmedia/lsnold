'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../../lib/auth-context';

const NAV_ITEMS = [
  { href: '/admin/dashboard', label: 'Dashboard', icon: '◉' },
  { href: '/admin/registrations', label: 'Registrations', icon: '◈' },
  { href: '/admin/bookings', label: 'Tour Bookings', icon: '◇' },
  { href: '/admin/chatbot', label: 'Chatbot', icon: '◍' },
  { href: '/admin/pages', label: 'Pages', icon: '◻' },
  { href: '/admin/calendar', label: 'Content Calendar', icon: '▦' },
  { href: '/admin/media', label: 'Media Library', icon: '▨' },
  { href: '/admin/partners', label: 'Partners', icon: '◈' },
  { href: '/admin/testimonials', label: 'Testimonials', icon: '❝' },
  { href: '/admin/events', label: 'News & Events', icon: '◆' },
  { href: '/admin/gallery', label: 'Gallery', icon: '▣' },
  { href: '/admin/facilities', label: 'Facilities', icon: '▧' },
  { href: '/admin/feature-cards', label: 'Feature Cards', icon: '▥' },
  { href: '/admin/age-groups', label: 'Age Groups', icon: '▤' },
  { href: '/admin/branding', label: 'Branding', icon: '◐' },
  { href: '/admin/typography', label: 'Typography', icon: '◍' },
  { href: '/admin/footer', label: 'Footer', icon: '▁' },
  { href: '/admin/faqs', label: 'FAQs', icon: '⁇' },
  { href: '/admin/staff', label: 'Staff', icon: '☺' },
  { href: '/admin/settings/social-media', label: 'Social Media', icon: '◈' },
  { href: '/admin/seo', label: 'SEO Settings', icon: '◎' },
  { href: '/admin/analytics', label: 'Analytics', icon: '◫' },
  { href: '/admin/assistant', label: 'Assistant', icon: '◇' },
  { href: '/admin/anomalies', label: 'Anomalies', icon: '◬' },
  { href: '/admin/users', label: 'Users', icon: '◑' },
  { href: '/admin/roles', label: 'Roles & Permissions', icon: '⚿' },
  { href: '/admin/notifications', label: 'Notifications', icon: '🔔' },
  { href: '/admin/settings/notifications', label: 'Alert Settings', icon: '✉' },
  { href: '/admin/activity-log', label: 'Activity Log', icon: '◌' },
  { href: '/admin/recycle-bin', label: 'Recycle Bin', icon: '⧉' },
];

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    <aside
      className={`fixed left-0 top-0 h-screen bg-panel-sunken border-r border-panel-line/50 z-40 transition-all duration-300 flex flex-col ${
        collapsed ? 'w-[68px]' : 'w-[260px]'
      }`}
    >
      {/* Logo */}
      <div className="h-16 flex items-center px-4 border-b border-panel-line/50 gap-3">
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
          LS
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <p className="text-sm font-semibold text-panel-strong truncate">Little Smarties</p>
            <p className="text-[10px] text-panel-muted uppercase tracking-widest">Admin Panel</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-2 overflow-y-auto scrollbar-thin">
        <div className="space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all group ${
                  active
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : 'text-panel-body hover:text-panel-strong hover:bg-panel-raised/50'
                }`}
                title={collapsed ? item.label : undefined}
              >
                <span className={`text-base shrink-0 ${active ? 'text-emerald-400' : 'text-panel-muted group-hover:text-panel-body'}`}>
                  {item.icon}
                </span>
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* User / Collapse */}
      <div className="border-t border-panel-line/50 p-3 space-y-2">
        {!collapsed && user && (
          <div className="px-2 py-1.5">
            <p className="text-xs text-panel-body truncate">{user.name}</p>
            <p className="text-[10px] text-panel-faint truncate">{user.email}</p>
          </div>
        )}
        <div className="flex items-center gap-1">
          <button
            onClick={onToggle}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs text-panel-muted hover:text-panel-body hover:bg-panel-raised/50 transition-colors"
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? '▸' : '◂'}
            {!collapsed && <span>Collapse</span>}
          </button>
          {!collapsed && (
            <button
              onClick={logout}
              className="px-3 py-2 rounded-lg text-xs text-red-400/70 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            >
              Logout
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
