import type { Response } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import { hashPassword, comparePassword } from '../utils/hash.js';
import { generateToken, generateRefreshToken, verifyRefreshToken } from '../utils/jwt.js';
import type { AuthRequest } from '../middleware/auth.js';
import type { User, TokenResponse } from '../types/index.js';
import { recordLogin } from '../services/loginHistory.js';

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const RefreshSchema = z.object({
  refreshToken: z.string(),
});

/** Never leak password_hash to a client. */
function toPublicUser(user: User): Omit<User, 'password_hash'> {
  const { password_hash: _ignored, ...rest } = user;
  return rest;
}

export async function register(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const { email, password, name } = RegisterSchema.parse(req.body);

    const existingUser = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      res.status(409).json({ error: 'Email already registered' });
      return;
    }

    const passwordHash = await hashPassword(password);
    const result = await db.query(
      'INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3) RETURNING id, email, name, phone, created_at, updated_at',
      [email, name, passwordHash]
    );

    const user = result.rows[0] as User;
    const accessToken = generateToken(user.id);
    const refreshToken = generateRefreshToken(user.id);

    await db.query(
      "INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, NOW() + INTERVAL '7 days')",
      [user.id, refreshToken]
    );

    const response: TokenResponse = { accessToken, refreshToken, user };
    res.status(201).json({ ...response, user: toPublicUser(user) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.issues });
    } else {
      console.error('register failed', error);
      res.status(500).json({ error: 'Registration failed' });
    }
  }
}

export async function login(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const { email, password } = LoginSchema.parse(req.body);

    const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const user = result.rows[0] as User;
    const passwordMatch = await comparePassword(password, user.password_hash);
    if (!passwordMatch) {
      await recordLogin(db, user.id, req, 'bad_password');
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    // A deactivated account previously still signed in and received a token. It
    // held no permissions, so the panel was empty, but "disable this account"
    // did not actually stop them authenticating — which is what it has to mean.
    if ((user as User & { is_active?: boolean }).is_active === false) {
      await recordLogin(db, user.id, req, 'inactive');
      // Same wording as a wrong password: whether an account exists but is
      // switched off is not something an unauthenticated caller should learn.
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    await recordLogin(db, user.id, req);

    const accessToken = generateToken(user.id);
    const refreshToken = generateRefreshToken(user.id);

    await db.query(
      "INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, NOW() + INTERVAL '7 days')",
      [user.id, refreshToken]
    );

    const response: TokenResponse = { accessToken, refreshToken, user };
    res.json({ ...response, user: toPublicUser(user) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.issues });
    } else {
      console.error('login failed', error);
      res.status(500).json({ error: 'Login failed' });
    }
  }
}

export async function refresh(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const { refreshToken } = RefreshSchema.parse(req.body);

    const decoded = verifyRefreshToken(refreshToken);
    if (!decoded) {
      res.status(401).json({ error: 'Invalid refresh token' });
      return;
    }

    // The token must still be on record and unexpired — a signature alone is not
    // enough, otherwise logout and rotation can never revoke anything.
    const stored = await db.query(
      'SELECT id FROM refresh_tokens WHERE token = $1 AND user_id = $2 AND expires_at > NOW()',
      [refreshToken, decoded.userId]
    );
    if (stored.rows.length === 0) {
      res.status(401).json({ error: 'Invalid refresh token' });
      return;
    }

    const result = await db.query('SELECT * FROM users WHERE id = $1', [decoded.userId]);
    if (result.rows.length === 0) {
      res.status(401).json({ error: 'User not found' });
      return;
    }

    const user = result.rows[0] as User;
    const accessToken = generateToken(user.id);
    const newRefreshToken = generateRefreshToken(user.id);

    // Rotate: the presented token is single-use.
    await db.query('DELETE FROM refresh_tokens WHERE token = $1', [refreshToken]);
    await db.query(
      "INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, NOW() + INTERVAL '7 days')",
      [user.id, newRefreshToken]
    );

    const response: TokenResponse = { accessToken, refreshToken: newRefreshToken, user };
    res.json({ ...response, user: toPublicUser(user) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.issues });
    } else {
      console.error('refresh failed', error);
      res.status(500).json({ error: 'Refresh failed' });
    }
  }
}

export async function logout(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const { refreshToken } = RefreshSchema.parse(req.body);
    await db.query('DELETE FROM refresh_tokens WHERE token = $1', [refreshToken]);
    res.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.issues });
    } else {
      console.error('logout failed', error);
      res.status(500).json({ error: 'Logout failed' });
    }
  }
}


/**
 * GET /api/v1/auth/me
 *
 * Requires `authenticate` + `resolveAdmin` to have run first (req.userId /
 * req.isAdmin are set by those). Used by the admin panel to decide whether
 * the logged-in user may enter /admin and what role/permissions they have.
 */
export async function me(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    const result = await db.query(
      'SELECT id, email, name, phone, role, is_active, created_at, updated_at FROM users WHERE id = $1',
      [req.userId]
    );
    if (result.rows.length === 0) {
      res.status(401).json({ error: 'User not found' });
      return;
    }
    const user = result.rows[0];
    const role = user.role || null;
    const permissions = (role === 'admin') ? ['read', 'write', 'delete', 'manage_users'] : [];
    const isAdmin = role === 'admin';
    
    res.json({
      user: { id: user.id, email: user.email, name: user.name, phone: user.phone, created_at: user.created_at, updated_at: user.updated_at },
      isAdmin,
      role,
      permissions,
    });
  } catch (error) {
    console.error('me failed', error);
    res.status(500).json({ error: 'Failed to resolve session' });
  }
}
