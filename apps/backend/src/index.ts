import express from 'express';
import { createServer } from 'node:http';
import cors from 'cors';
import { Pool } from 'pg';
import { cloudinary } from './config/cloudinary.js';
import { createAuthRouter } from './routes/auth.js';
import { createGalleryRouter } from './routes/gallery.js';
import { createEventsRouter } from './routes/events.js';
import { createFacilitiesRouter } from './routes/facilities.js';
import { createRegistrationsRouter } from './routes/registrations.js';
import { createBookingsRouter } from './routes/bookings.js';
import { createChatbotRouter } from './routes/chatbot.js';
import { createPublicContentRouter } from './routes/content.js';
import { createVideoUploadRouter } from './routes/videoUpload.js';
import { createAgeGroupsRouter } from './routes/ageGroups.js';
import { createMediaRouter } from './routes/media.js';
import { createPagesRouter } from './routes/pages.js';
import { createAdminRouter } from './routes/admin/index.js';
import { createAnalyticsTracker } from './middleware/analytics.js';
import { initRealtime } from './realtime.js';

const app = express();
const PORT = process.env.PORT || 3011;

if (!cloudinary.config().api_key) {
  console.warn('Cloudinary is not configured — image uploads will fail. Set CLOUDINARY_URL.');
}

const db = new Pool({
  connectionString:
    process.env.DATABASE_URL || 'postgresql://lsn:password@localhost:5432/littlesmarties',
});

// An idle client erroring must not take the process down.
db.on('error', (err) => console.error('Unexpected postgres client error', err));

// Enable CORS for frontend
// One list for HTTP and for the socket handshake, so the two cannot drift.
const CORS_ORIGINS = [
  'http://localhost:3000', 'http://localhost:3010', 'http://127.0.0.1:3010',
  'https://bayrotna.ae', 'https://www.bayrotna.ae',
];

app.use(cors({
  origin: CORS_ORIGINS,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'backend' });
});

// Records public page views. Mounted after /health and before the routers so it
// sees visitor traffic; it skips admin and auth paths itself, and never blocks
// or fails a request.
app.use(createAnalyticsTracker(db));

app.use('/api/v1/auth', createAuthRouter(db));
app.use('/api/v1/gallery', createGalleryRouter(db));
app.use('/api/v1/events', createEventsRouter(db));
app.use('/api/v1/facilities', createFacilitiesRouter(db));
app.use('/api/v1/registrations', createRegistrationsRouter(db));
app.use('/api/v1/tour-bookings', createBookingsRouter(db));
app.use('/api/v1/chatbot', createChatbotRouter(db));
app.use('/api/v1/videos', createVideoUploadRouter(db));
app.use('/api/v1/age-groups', createAgeGroupsRouter(db));
app.use('/api/v1/media', createMediaRouter(db));
app.use('/api/v1/pages', createPagesRouter(db));
app.use('/api/v1', createPublicContentRouter(db));
app.use('/api/v1/admin', createAdminRouter(db));

// Socket.io needs the HTTP server rather than the express app, so it can see
// the Upgrade requests. Express still handles every ordinary request unchanged.
const server = createServer(app);
initRealtime(server, db, CORS_ORIGINS);

server.listen(PORT, () => {
  console.log(`Backend running on port ${PORT} (realtime at /api/v1/socket.io)`);
});

export default app;
