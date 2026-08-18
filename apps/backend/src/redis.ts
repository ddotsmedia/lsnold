import { createClient, type RedisClientType } from 'redis';

/**
 * Redis, used for one thing: letting several backend instances share their
 * Socket.io broadcasts.
 *
 * Entirely optional. With one instance — which is how this runs today — nothing
 * needs Redis at all, and an unset REDIS_URL simply means the adapter is not
 * installed and every broadcast stays in-process. That is the correct behaviour
 * rather than a degraded one, and it means adding the container is what enables
 * scaling rather than something the app already depends on.
 *
 * Three other projects on this host run their own Redis, one of them bound to
 * every interface. This connects only to the URL it is given, which points at
 * a container on this project's own compose network with no host port, so
 * nothing here can reach or disturb theirs.
 */

export type RedisPair = { publisher: RedisClientType; subscriber: RedisClientType };

let pair: RedisPair | null = null;

export function isRedisConfigured(): boolean {
  return Boolean(process.env.REDIS_URL);
}

/**
 * Opens the two connections the adapter needs.
 *
 * A subscriber connection cannot issue ordinary commands, which is why this is
 * a duplicate rather than one shared client.
 *
 * Returns null instead of throwing when Redis is unreachable: a broker that is
 * down should cost cross-instance delivery, not the whole API. The failure is
 * logged loudly so it does not pass unnoticed.
 */
export async function connectRedis(): Promise<RedisPair | null> {
  if (!isRedisConfigured()) return null;
  if (pair) return pair;

  try {
    const publisher: RedisClientType = createClient({
      url: process.env.REDIS_URL,
      socket: {
        // Give up rather than reconnecting forever; without Redis the single
        // instance still works, so a stuck retry loop would be the worse
        // outcome.
        reconnectStrategy: (retries) => (retries > 10 ? false : Math.min(retries * 200, 3000)),
      },
    });
    const subscriber: RedisClientType = publisher.duplicate();

    publisher.on('error', (err) => console.error('redis publisher error', err));
    subscriber.on('error', (err) => console.error('redis subscriber error', err));

    await Promise.all([publisher.connect(), subscriber.connect()]);

    pair = { publisher, subscriber };
    console.log('redis connected; Socket.io broadcasts will span instances');
    return pair;
  } catch (error) {
    console.error('redis unavailable; running single-instance', error);
    return null;
  }
}

export async function disconnectRedis(): Promise<void> {
  if (!pair) return;
  await Promise.allSettled([pair.publisher.quit(), pair.subscriber.quit()]);
  pair = null;
}
