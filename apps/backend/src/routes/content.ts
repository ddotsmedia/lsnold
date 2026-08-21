import express from 'express';
import type { Pool } from 'pg';
import type { AuthRequest } from '../middleware/auth.js';
import { listPublicSocialLinks } from '../controllers/socialLinksController.js';
import { listPublicYoutubeVideos } from '../controllers/youtubeVideosController.js';
import { listPublicNews } from '../controllers/newsController.js';
import { getSiteMedia, getAgeGroupMedia, getPageMedia } from '../controllers/mediaController.js';
import { listPublicPartners } from '../controllers/partnersController.js';
import { listPublicTestimonials } from '../controllers/testimonialsController.js';
import { getBranding } from './admin/branding.js';
import { getFooter } from './admin/footer.js';
import { listPublicFaqs } from './admin/faqs.js';
import { listPublicStaff } from './admin/staff.js';

/**
 * Read-only endpoints the public site needs: the footer's social links and the
 * gallery's YouTube videos. Deliberately unauthenticated — the admin routes
 * under /api/v1/admin handle every mutation.
 */
export function createPublicContentRouter(db: Pool): express.Router {
  const router = express.Router();

  router.get('/social-links', (req, res) => listPublicSocialLinks(db, req as AuthRequest, res));
  router.get('/youtube-videos', (req, res) => listPublicYoutubeVideos(db, req as AuthRequest, res));
  router.get('/news', (req, res) => listPublicNews(db, req as AuthRequest, res));

  // Media the public site renders. Read-only; every mutation stays behind
  // /api/v1/admin/media. These reuse the admin controllers because the shape
  // the admin panel previews and the shape the site renders are the same.
  router.get('/site-media', (req, res) => getSiteMedia(db, req as AuthRequest, res));
  router.get('/age-group-media/:slug', (req, res) => getAgeGroupMedia(db, req as AuthRequest, res));
  router.get('/page-media/:slug', (req, res) => getPageMedia(db, req as AuthRequest, res));
  router.get('/partners', (req, res) => listPublicPartners(db, req as AuthRequest, res));
  router.get('/testimonials', (req, res) => listPublicTestimonials(db, req as AuthRequest, res));

  // The header on every public page renders the site name, so this read is
  // unauthenticated. Writes stay behind /api/v1/admin/branding.
  router.get('/branding', (req, res) => getBranding(db, req as AuthRequest, res));
  // Same reasoning: the footer renders for signed-out visitors on every page.
  router.get('/footer', (req, res) => getFooter(db, req as AuthRequest, res));
  // The contact page's FAQs and the About page's team. Published rows only —
  // the admin endpoints also return drafts, which a visitor must not see.
  router.get('/faqs', (req, res) => listPublicFaqs(db, req as AuthRequest, res));
  router.get('/staff', (req, res) => listPublicStaff(db, req as AuthRequest, res));

  return router;
}
