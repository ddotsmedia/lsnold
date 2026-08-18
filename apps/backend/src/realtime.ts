import { Server as SocketServer } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import type { Pool } from 'pg';
import { verifyToken } from './utils/jwt.js';

/**
 * Live updates for the admin panel.
 *
 * Mounted under /api/v1/socket.io so it rides the proxy rule nginx already has
 * for the API, including the Upgrade headers — no change to the shared nginx
 * config on this box.
 *
 * Single instance on purpose. One backend container broadcasts to all of its
 * own clients natively; a Redis adapter only earns its keep once a second
 * instance exists, and would be idle infrastructure until then. Adding it later
 * is `io.adapter(createAdapter(pub, sub))` and nothing else here changes.
 *
 * Everything a client can receive is behind a permission. Registrations carry
 * children's names, dates of birth and parents' contact details, so an
 * unauthenticated or under-privileged socket must never be in that room.
 */

/** Rooms, and the permission each one requires to join. */
const ROOMS: Record<string, string> = {
  registrations: 'view:registrations',
  bookings: 'view:bookings',
  // Every admin action, for the dashboard's live feed. Gated on the same
  // permission as the activity log page it mirrors.
  activity: 'view:users',
};

let io: SocketServer | null = null;

export function initRealtime(server: HttpServer, db: Pool, corsOrigins: string[]): SocketServer {
  io = new SocketServer(server, {
    path: '/api/v1/socket.io',
    cors: { origin: corsOrigins, credentials: true },
    // The panel is a long-lived tab; a slow tab should not be dropped mid-edit.
    pingTimeout: 30_000,
  });

  // Authentication runs once at connection rather than per message: a socket
  // that cannot prove who it is never reaches a room.
  io.use(async (socket, next) => {
    const token =
      (socket.handshake.auth as { token?: string } | undefined)?.token
      ?? socket.handshake.headers.authorization?.split(' ')[1];

    if (!token) { next(new Error('unauthenticated')); return; }

    const decoded = verifyToken(token);
    if (!decoded) { next(new Error('unauthenticated')); return; }

    try {
      // Permissions are read now, from the database, rather than trusted from
      // the token: a role changed or an account deactivated after the token was
      // issued must take effect on the next connection, not at token expiry.
      const result = await db.query(
        `SELECT p.name
           FROM users u
           JOIN roles r ON r.name = u.role
           JOIN role_permissions rp ON rp.role_id = r.id
           JOIN permissions p ON p.id = rp.permission_id
          WHERE u.id = $1 AND u.is_active IS NOT FALSE`,
        [decoded.userId]
      );

      const permissions = new Set(
        (result.rows as Array<{ name: string }>).map((row) => row.name)
      );
      if (permissions.size === 0) { next(new Error('forbidden')); return; }

      socket.data.userId = decoded.userId;
      socket.data.permissions = permissions;
      next();
    } catch (error) {
      console.error('socket auth failed', error);
      next(new Error('unauthenticated'));
    }
  });

  io.on('connection', (socket) => {
    const permissions = socket.data.permissions as Set<string>;

    // Joined server-side from what the user may see. The client never names a
    // room, so it cannot ask for one it has no right to.
    const joined: string[] = [];
    for (const [room, permission] of Object.entries(ROOMS)) {
      if (permissions.has(permission)) { void socket.join(room); joined.push(room); }
    }

    // A private room per account, for notifications addressed to one person.
    // The id comes from the verified token, never from the client.
    const userId = socket.data.userId as string | undefined;
    if (userId) { void socket.join(`user:${userId}`); joined.push('notifications'); }
    socket.emit('ready', { rooms: joined });

    socket.on('error', (error) => console.error('socket error', error));
  });

  return io;
}

/**
 * Sends an event to everyone allowed to see it.
 *
 * Deliberately forgiving: realtime is a convenience on top of a page that still
 * works by reloading, so a failure here must never break the request that
 * triggered it.
 */
export function emitToRoom(room: keyof typeof ROOMS | string, event: string, payload: unknown): void {
  try {
    io?.to(room).emit(event, payload);
  } catch (error) {
    console.error(`failed to emit ${event} to ${room}`, error);
  }
}

/** Exposed for a health check; null until initRealtime has run. */
export function realtimeStatus(): { enabled: boolean; clients: number } {
  return { enabled: io !== null, clients: io?.engine?.clientsCount ?? 0 };
}
