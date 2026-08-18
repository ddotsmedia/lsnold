'use client';

import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

/**
 * Live admin updates.
 *
 * One socket per tab, shared by every hook that asks for it, so opening two
 * screens does not open two connections. The server decides which rooms the
 * connection joins from the user's permissions — the client never names one.
 *
 * The panel works without this. If the socket never connects, every screen
 * still loads and refreshes normally; live updates are the bonus, not the
 * mechanism.
 */

const API = process.env.NEXT_PUBLIC_API_URL ?? '/api/v1';

let shared: Socket | null = null;
let refCount = 0;

/** Derives the socket origin and path from the API base, so one env var drives both. */
function endpoint(): { origin: string; path: string } {
  try {
    const url = new URL(API, typeof window === 'undefined' ? 'http://localhost' : window.location.href);
    // API is .../api/v1; the socket lives directly beneath it.
    return { origin: url.origin, path: `${url.pathname.replace(/\/$/, '')}/socket.io` };
  } catch {
    return { origin: '', path: '/api/v1/socket.io' };
  }
}

function acquire(): Socket | null {
  if (typeof window === 'undefined') return null;
  const token = localStorage.getItem('lsn_token');
  // Without a token the handshake would only be rejected; skip it entirely.
  if (!token) return null;

  if (!shared) {
    const { origin, path } = endpoint();
    shared = io(origin, {
      path,
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10_000,
    });
  }
  refCount += 1;
  return shared;
}

function release(): void {
  refCount -= 1;
  if (refCount <= 0 && shared) {
    shared.disconnect();
    shared = null;
    refCount = 0;
  }
}

/**
 * Calls `onEvent` whenever the named event arrives.
 *
 * The handler is held in a ref so a caller can pass an inline function without
 * the subscription tearing down and rebuilding on every render.
 */
export function useRealtimeEvent<T>(event: string, onEvent: (payload: T) => void): boolean {
  const [connected, setConnected] = useState(false);
  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => {
    const socket = acquire();
    if (!socket) return;

    const forward = (payload: T) => handler.current(payload);
    const markUp = () => setConnected(true);
    const markDown = () => setConnected(false);

    socket.on(event, forward);
    socket.on('connect', markUp);
    socket.on('disconnect', markDown);
    if (socket.connected) setConnected(true);

    return () => {
      socket.off(event, forward);
      socket.off('connect', markUp);
      socket.off('disconnect', markDown);
      release();
    };
  }, [event]);

  return connected;
}
