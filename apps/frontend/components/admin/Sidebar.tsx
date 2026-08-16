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
  { href: '/admin/media', label: 'Media Library', icon: '▨' },
  { href: '/admin/partners', label: 'Partners', icon: '◈' },
  { href: '/admin/testimonials', label: 'Testimonials', icon: '❝' },
  { href: '/admin/events', label: 'News & Events', icon: '◆' },
  { href: '/admin/gallery', label: 'Gallery', icon: '▣' },
  { href: '/admin/facilities', label: 'Facilities', icon: '▧' },
  { href: '/admin/age-groups', label: 'Age Groups', icon: '▤' },
  { href: '/admin/settings/social-media', label: 'Social Media', icon: '◈' },
  { href: '/admin/seo', label: 'SEO Settings', icon: '◎' },
  { href: '/admin/analytics', label: 'Analytics', icon: '◫' },
  { href: '/admin/users', label: 'Users', icon: '◑' },
  { href: '/admin/roles', label: 'Roles & Permissions', icon: '⚿' },
  { href: '/admin/activity-log', label: 'Activity Log', icon: '◌' },
  { href: '/admin/recycle-bin', label: 'Recycle Bin', icon: '⧉' },
];

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    <aside
      className={`fixed left-0 top-0 h-screen bg-[#0c0c14] border-r border-zinc-800/50 z-40 transition-all duration-300 flex flex-col ${
        collapsed ? 'w-[68px]' : 'w-[260px]'
      }`}
    >
      {/* Logo */}
      <div className="h-16 flex items-center px-4 border-b border-zinc-800/50 gap-3">
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
          LS
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <p className="text-sm font-semibold text-zinc-100 truncate">Little Smarties</p>
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest">Admin Panel</p>
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
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                }`}
                title={collapsed ? item.label : undefined}
              >
                <span className={`text-base shrink-0 ${active ? 'text-emerald-400' : 'text-zinc-500 group-hover:text-zinc-300'}`}>
                  {item.icon}
                </span>
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* User / Collapse */}
      <div className="border-t border-zinc-800/50 p-3 space-y-2">
        {!collapsed && user && (
          <div className="px-2 py-1.5">
            <p className="text-xs text-zinc-300 truncate">{user.name}</p>
            <p className="text-[10px] text-zinc-600 truncate">{user.email}</p>
          </div>
        )}
        <div className="flex items-center gap-1">
          <button
            onClick={onToggle}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 transition-colors"
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
