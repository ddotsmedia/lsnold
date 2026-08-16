import twilio from 'twilio';
import type { Twilio } from 'twilio';

/**
 * SMS alerts.
 *
 * Configure with TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM.
 * Without them nothing is sent and the attempt is logged.
 *
 * Worth knowing before enabling this: the UAE requires SMS sender IDs to be
 * registered, and unregistered international traffic to +971 numbers is
 * commonly filtered by the carriers rather than rejected by Twilio — messages
 * are accepted by the API and then never arrive. Budget for the registration
 * step, and test to a real handset before relying on it.
 */

const E164 = /^\+[1-9]\d{7,14}$/;
/** Mobile prefixes in use: 050, 052, 054, 055, 056, 058. */
const UAE_MOBILE = /^\+9715[0245689]\d{7}$/;

let client: Twilio | null = null;
let warned = false;

function build(): Twilio | null {
  if (client) return client;
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = process.env;

  if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
    client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
    return client;
  }

  if (!warned) {
    console.warn(
      'SMS is not configured — set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM. '
      + 'Messages will be logged instead of sent.'
    );
    warned = true;
  }
  return null;
}

export function isSmsConfigured(): boolean {
  return build() !== null && Boolean(process.env.TWILIO_FROM);
}

/**
 * Puts a local UAE number into E.164.
 *
 * Accepts 0561234567, 561234567, 971561234567 and +971 56 123 4567, which is
 * the range of ways the booking and registration forms actually receive them.
 * Returns null when it cannot be made into a valid number rather than guessing.
 */
export function toE164(raw: string): string | null {
  const digits = raw.replace(/[\s()-]/g, '');
  if (E164.test(digits)) return digits;

  const bare = digits.replace(/^\+/, '');
  if (/^971\d{9}$/.test(bare)) return `+${bare}`;
  if (/^0\d{9}$/.test(bare)) return `+971${bare.slice(1)}`;
  if (/^5\d{8}$/.test(bare)) return `+971${bare}`;
  return null;
}

export function isUaeMobile(e164: string): boolean {
  return UAE_MOBILE.test(e164);
}

/**
 * Sends one message. Resolves either way — an SMS failure must never fail the
 * request that prompted it.
 */
export async function sendSms(to: string, body: string): Promise<boolean> {
  const number = toE164(to);
  if (!number) {
    console.warn(`SMS skipped: "${to}" is not a number we can dial.`);
    return false;
  }

  // Deliberately UAE-only for now. An unnoticed loop sending to arbitrary
  // international numbers is an expensive way to find out about a bug.
  if (!isUaeMobile(number)) {
    console.warn(`SMS skipped: ${number} is not a UAE mobile.`);
    return false;
  }

  const from = process.env.TWILIO_FROM;
  const sms = build();
  if (!sms || !from) {
    console.log(`[sms not sent — unconfigured] to=${number}`);
    return false;
  }

  try {
    await sms.messages.create({ to: number, from, body });
    return true;
  } catch (error) {
    console.error(`SMS to ${number} failed:`, error);
    return false;
  }
}

/** The nursery's own number, for alerts about new activity. */
export async function sendAdminSms(body: string): Promise<boolean> {
  const to = process.env.SMS_ADMIN;
  if (!to) return false;
  return sendSms(to, body);
}
