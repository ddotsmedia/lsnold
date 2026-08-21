import express from 'express';
import type { Pool } from 'pg';
import { createAdminRegistrationsRouter } from './registrations.js';
import { createAdminBookingsRouter } from './bookings.js';
import { createAdminGalleryRouter } from './gallery.js';
import { createAdminContentRouter, createAdminEventsRouter } from './content.js';
import { createAdminFacilitiesRouter } from './facilities.js';
import { createAdminNewsRouter } from './news.js';
import { createAdminDashboardRouter } from './dashboard.js';
import { createAdminMediaRouter } from './media.js';
import { createAdminPartnersRouter } from './partners.js';
import { createAdminAgeGroupImagesRouter } from './ageGroupImages.js';
import { createAdminTestimonialsRouter } from './testimonials.js';
import { createAdminPagesRouter } from './pages.js';
import { createAdminSeoRouter } from './seo.js';
import { createAdminAnalyticsRouter } from './analytics.js';
import { createAdminRolesRouter } from './roles.js';
import { createAdminNotificationsRouter, createAdminNotificationFeedRouter } from './notifications.js';
import { createAdminPreferencesRouter } from './preferences.js';
import { createAdminFilterPresetsRouter } from './filterPresets.js';
import { createAdminSearchRouter } from './search.js';
import { createAdminAssistantRouter } from './assistant.js';
import { createAdminAnomaliesRouter } from './anomalies.js';
import { createAdminUsersRouter } from './users.js';
import { createAdminChatbotRouter } from './chatbot.js';
import { createAdminSocialLinksRouter } from './socialLinks.js';
import { createBrandingRouter } from './branding.js';
import { createFooterRouter } from './footer.js';
import { createAdminFaqsRouter } from './faqs.js';
import { createAdminStaffRouter } from './staff.js';
import { createAdminYoutubeVideosRouter } from './youtubeVideos.js';

/**
 * Aggregates every admin sub-router under /api/v1/admin.
 * Each sub-router applies its own authenticate → resolveAdmin → requireAdmin guard.
 */
export function createAdminRouter(db: Pool): express.Router {
  const router = express.Router();

  router.use('/registrations', createAdminRegistrationsRouter(db));
  router.use('/tour-bookings', createAdminBookingsRouter(db));
  router.use('/gallery', createAdminGalleryRouter(db));
  router.use('/content', createAdminContentRouter(db));
  router.use('/news', createAdminNewsRouter(db));
  router.use('/dashboard', createAdminDashboardRouter(db));
  router.use('/media', createAdminMediaRouter(db));
  router.use('/partners', createAdminPartnersRouter(db));
  // Same handlers as /content/facilities, at the shorter path.
  router.use('/facilities', createAdminFacilitiesRouter(db));
  // Programme images. The age_groups CRUD stays at /content/age-groups.
  router.use('/age-groups', createAdminAgeGroupImagesRouter(db));
  router.use('/testimonials', createAdminTestimonialsRouter(db));
  // Same handlers as /content/events, at the path the admin Events tab uses.
  router.use('/events', createAdminEventsRouter(db));
  router.use('/pages', createAdminPagesRouter(db));
  router.use('/seo', createAdminSeoRouter(db));
  router.use('/analytics', createAdminAnalyticsRouter(db));
  router.use('/users', createAdminUsersRouter(db));
  // Roles and the permission matrix behind them.
  router.use('/roles', createAdminRolesRouter(db));
  router.use('/notification-settings', createAdminNotificationsRouter(db));
  // A caller's own dashboard arrangement; no permission beyond panel access.
  router.use('/dashboard-preferences', createAdminPreferencesRouter(db));
  router.use('/filter-presets', createAdminFilterPresetsRouter(db));
  router.use('/search', createAdminSearchRouter(db));
  router.use('/assistant', createAdminAssistantRouter(db));
  router.use('/anomalies', createAdminAnomaliesRouter(db));
  // The bell feed. /notification-settings above decides what is emailed.
  router.use('/notifications', createAdminNotificationFeedRouter(db));
  router.use('/chatbot', createAdminChatbotRouter(db));
  router.use('/social-links', createAdminSocialLinksRouter(db));
  // Typography is edited through /admin/branding — the font_family and
  // base_font_size columns live on the same site_branding row, and both admin
  // pages (Branding and Typography) call that one endpoint. There is no
  // separate typography router.
  router.use('/branding', createBrandingRouter(db));
  router.use('/footer', createFooterRouter(db));
  router.use('/faqs', createAdminFaqsRouter(db));
  router.use('/staff', createAdminStaffRouter(db));

  return router;
}
