'use client';

/**
 * The things the palette can do besides search.
 *
 * Two kinds, both just destinations: a **command** performs something (opens a
 * form, starts an export) and a **page** goes somewhere. They are separated
 * only so the palette can group them, since "go to Bookings" and "add a booking"
 * read very differently to someone scanning a list.
 *
 * Every entry names a route that exists — checked against the twenty-six pages
 * under app/admin — and the permission an account needs to use it. The palette
 * hides what the account cannot reach, so a viewer is not offered a Create link
 * that will refuse them on arrival.
 */

export interface Command {
  id: string;
  label: string;
  /** Extra words that should match, beyond the label. */
  keywords?: string;
  href: string;
  /** Permission required, or undefined when anyone in the panel may use it. */
  permission?: string;
  group: 'Actions' | 'Go to';
}

export const COMMANDS: Command[] = [
  // ---- Actions -----------------------------------------------------------
  {
    id: 'new-registration',
    label: 'Add a registration',
    keywords: 'create child new enrol enroll signup',
    href: '/admin/registrations?new=1',
    permission: 'edit:registrations',
    group: 'Actions',
  },
  {
    id: 'new-booking',
    label: 'Add a tour booking',
    keywords: 'create schedule tour visit new',
    href: '/admin/bookings?new=1',
    permission: 'edit:bookings',
    group: 'Actions',
  },
  {
    id: 'booking-calendar',
    label: 'Open the booking calendar',
    keywords: 'tours diary schedule month week',
    href: '/admin/bookings/calendar',
    permission: 'view:bookings',
    group: 'Actions',
  },
  {
    id: 'upload-media',
    label: 'Upload an image',
    keywords: 'media library photo picture new',
    href: '/admin/media?upload=1',
    permission: 'edit:media',
    group: 'Actions',
  },
  {
    id: 'new-event',
    label: 'Add a news item or event',
    keywords: 'create post announcement',
    href: '/admin/events?new=1',
    permission: 'create:news',
    group: 'Actions',
  },
  {
    id: 'analytics-report',
    label: 'Export an analytics report',
    keywords: 'download pdf figures statistics',
    href: '/admin/analytics',
    permission: 'view:analytics',
    group: 'Actions',
  },
  {
    id: 'ask-assistant',
    label: 'Ask the assistant',
    keywords: 'ai question figures help',
    href: '/admin/assistant',
    permission: 'view:analytics',
    group: 'Actions',
  },

  // ---- Go to -------------------------------------------------------------
  { id: 'go-dashboard', label: 'Dashboard', keywords: 'home overview', href: '/admin/dashboard', group: 'Go to' },
  { id: 'go-registrations', label: 'Registrations', keywords: 'children enrolments', href: '/admin/registrations', permission: 'view:registrations', group: 'Go to' },
  { id: 'go-bookings', label: 'Tour bookings', keywords: 'tours visits', href: '/admin/bookings', permission: 'view:bookings', group: 'Go to' },
  { id: 'go-pages', label: 'Pages', keywords: 'content text website', href: '/admin/pages', permission: 'view:pages', group: 'Go to' },
  { id: 'go-media', label: 'Media library', keywords: 'images photos gallery', href: '/admin/media', permission: 'view:media', group: 'Go to' },
  { id: 'go-events', label: 'News & events', keywords: 'posts announcements', href: '/admin/events', permission: 'view:news', group: 'Go to' },
  { id: 'go-agegroups', label: 'Age groups', keywords: 'classes programmes rooms', href: '/admin/age-groups', permission: 'view:pages', group: 'Go to' },
  { id: 'go-gallery', label: 'Gallery', keywords: 'photos images', href: '/admin/gallery', permission: 'view:media', group: 'Go to' },
  { id: 'go-facilities', label: 'Facilities', keywords: 'rooms spaces', href: '/admin/facilities', permission: 'view:pages', group: 'Go to' },
  { id: 'go-testimonials', label: 'Testimonials', keywords: 'reviews parents quotes', href: '/admin/testimonials', permission: 'view:pages', group: 'Go to' },
  { id: 'go-partners', label: 'Partners', keywords: 'logos sponsors', href: '/admin/partners', permission: 'view:pages', group: 'Go to' },
  { id: 'go-analytics', label: 'Analytics', keywords: 'traffic visitors funnel retention', href: '/admin/analytics', permission: 'view:analytics', group: 'Go to' },
  { id: 'go-chatbot', label: 'Chatbot', keywords: 'conversations messages', href: '/admin/chatbot', permission: 'view:analytics', group: 'Go to' },
  { id: 'go-activity', label: 'Activity log', keywords: 'audit history changes', href: '/admin/activity-log', permission: 'view:users', group: 'Go to' },
  { id: 'go-users', label: 'Users', keywords: 'staff accounts admins', href: '/admin/users', permission: 'view:users', group: 'Go to' },
  { id: 'go-roles', label: 'Roles & permissions', keywords: 'access rights', href: '/admin/roles', permission: 'view:users', group: 'Go to' },
  { id: 'go-notifications', label: 'Notifications', keywords: 'alerts', href: '/admin/notifications', group: 'Go to' },
  { id: 'go-seo', label: 'SEO settings', keywords: 'meta titles descriptions', href: '/admin/seo', permission: 'view:pages', group: 'Go to' },
  { id: 'go-settings-notifications', label: 'Notification settings', keywords: 'email sms alerts config', href: '/admin/settings/notifications', permission: 'manage:settings', group: 'Go to' },
  { id: 'go-settings-social', label: 'Social media settings', keywords: 'facebook instagram links', href: '/admin/settings/social-media', permission: 'manage:settings', group: 'Go to' },
  { id: 'go-recycle', label: 'Recycle bin', keywords: 'deleted restore trash', href: '/admin/recycle-bin', permission: 'view:pages', group: 'Go to' },
];

/** Simple contains-match over the label and its keywords. */
export function matchCommands(query: string, allowed: Set<string>): Command[] {
  const available = COMMANDS.filter((c) => !c.permission || allowed.has(c.permission));
  const q = query.trim().toLowerCase();
  if (!q) return available;
  return available.filter(
    (c) => c.label.toLowerCase().includes(q) || (c.keywords ?? '').includes(q)
  );
}
