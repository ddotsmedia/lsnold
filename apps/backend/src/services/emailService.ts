import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

/**
 * Transactional email.
 *
 * This file previously only wrote to the console, so every confirmation the
 * site promised a family was never actually sent. It now sends for real when
 * credentials are present, and says plainly that it is not sending when they
 * are not — the old stub looked like a working integration, which is the worst
 * of both.
 *
 * Configure with either:
 *   SENDGRID_API_KEY                 (relayed over SendGrid's SMTP)
 *   SMTP_HOST, SMTP_USER, SMTP_PASS  (any other provider)
 * plus MAIL_FROM, which must be an address the provider has verified.
 *
 * Nothing here throws. A registration is already saved by the time we try to
 * email about it, and a mail outage must not turn a successful submission into
 * an error the family sees.
 */

const FROM = process.env.MAIL_FROM ?? 'Little Smarties Nursery <info@lsn.ae>';
const ADMIN_TO = process.env.MAIL_ADMIN ?? process.env.MAIL_FROM ?? '';

let transporter: Transporter | null = null;
let warned = false;

function build(): Transporter | null {
  if (transporter) return transporter;

  const { SENDGRID_API_KEY, SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_PORT } = process.env;

  if (SENDGRID_API_KEY) {
    // SendGrid's SMTP relay: the username is the literal word "apikey".
    transporter = nodemailer.createTransport({
      host: 'smtp.sendgrid.net',
      port: 587,
      secure: false,
      auth: { user: 'apikey', pass: SENDGRID_API_KEY },
    });
    return transporter;
  }

  if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
    const port = Number(SMTP_PORT ?? 587);
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port,
      // 465 is implicit TLS; 587 upgrades with STARTTLS.
      secure: port === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
    return transporter;
  }

  if (!warned) {
    console.warn(
      'Email is not configured — set SENDGRID_API_KEY, or SMTP_HOST/SMTP_USER/SMTP_PASS, '
      + 'plus MAIL_FROM. Messages will be logged instead of sent.'
    );
    warned = true;
  }
  return null;
}

export function isEmailConfigured(): boolean {
  return build() !== null;
}

interface Message { to: string; subject: string; text: string; html: string }

async function deliver(message: Message): Promise<boolean> {
  const mailer = build();
  if (!mailer) {
    // Subject and recipient only. The body carries a child's name and a
    // parent's contact details, which have no business in a log file.
    console.log(`[email not sent — unconfigured] to=${message.to} subject="${message.subject}"`);
    return false;
  }

  try {
    await mailer.sendMail({ from: FROM, ...message });
    return true;
  } catch (error) {
    console.error(`email to ${message.to} failed:`, error);
    return false;
  }
}

/* ----------------------------------------------------------------- layout */

const BRAND = '#dc2626';

/** One frame for every message, so they are recognisably from the nursery. */
function layout(heading: string, body: string): string {
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f4f4f5;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#1f2937">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08)">
    <div style="background:${BRAND};padding:20px 24px">
      <h1 style="margin:0;font-size:18px;color:#ffffff">Little Smarties Nursery</h1>
    </div>
    <div style="padding:24px">
      <h2 style="margin:0 0 12px;font-size:16px;color:#1f2937">${heading}</h2>
      ${body}
    </div>
    <div style="padding:16px 24px;background:#fafafa;font-size:12px;color:#6b7280">
      Ministry of Justice Building, Khalifa City (A), Abu Dhabi<br>
      <a href="tel:+971562677747" style="color:${BRAND}">+971 56 267 7747</a>
      &nbsp;·&nbsp;
      <a href="mailto:info@lsn.ae" style="color:${BRAND}">info@lsn.ae</a>
    </div>
  </div>
</body></html>`;
}

const p = (text: string) => `<p style="margin:0 0 12px;line-height:1.6">${text}</p>`;

/** Escapes anything a visitor typed before it goes into an HTML email. */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* ---------------------------------------------------------------- senders */

export async function sendRegistrationEmail(email: string, childName: string): Promise<void> {
  const name = esc(childName);
  await deliver({
    to: email,
    subject: `We have your registration for ${childName}`,
    text: `Thank you for registering ${childName} with Little Smarties Nursery.\n\n`
      + 'We have your details and will be in touch shortly to arrange the next step. '
      + 'If you need us before then, call +971 56 267 7747.',
    html: layout('Registration received', [
      p(`Thank you for registering <strong>${name}</strong> with Little Smarties Nursery.`),
      p('We have your details and will be in touch shortly to arrange the next step.'),
      p('If you need us before then, call <a href="tel:+971562677747">+971 56 267 7747</a>.'),
    ].join('')),
  });
}

export async function sendBookingConfirmation(
  email: string,
  date: string,
  timeSlot: string
): Promise<void> {
  const when = new Date(date);
  const readable = Number.isNaN(when.getTime())
    ? date
    : when.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  await deliver({
    to: email,
    subject: `Your tour is booked — ${readable}`,
    text: `Your visit to Little Smarties Nursery is booked for ${readable} at ${timeSlot}.\n\n`
      + 'We are on the ground floor of the Ministry of Justice building, Khalifa City (A), Abu Dhabi. '
      + 'To change or cancel, call +971 56 267 7747.',
    html: layout('Your tour is booked', [
      p(`We look forward to seeing you on <strong>${esc(readable)}</strong> at <strong>${esc(timeSlot)}</strong>.`),
      p('We are on the ground floor of the Ministry of Justice building, Khalifa City (A), Abu Dhabi.'),
      p('To change or cancel, call <a href="tel:+971562677747">+971 56 267 7747</a>.'),
    ].join('')),
  });
}

/** Tells the nursery something arrived. Never sent to a family. */
export async function sendAdminAlert(subject: string, lines: string[]): Promise<void> {
  if (!ADMIN_TO) {
    console.warn('MAIL_ADMIN is not set — admin alerts have nowhere to go.');
    return;
  }
  await deliver({
    to: ADMIN_TO,
    subject,
    text: lines.join('\n'),
    html: layout(subject, lines.map((line) => p(esc(line))).join('')),
  });
}
