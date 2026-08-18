'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../../lib/api';
import { Button, FormField, Select, Toast } from '../../../../components/admin/shared';

/**
 * What the nursery is told about, and how.
 *
 * The screen says plainly when a channel has no credentials behind it, because
 * a switch that silently does nothing is worse than one that is absent.
 */

interface Settings {
  email_parent_registration: boolean;
  email_parent_booking: boolean;
  email_admin_registration: boolean;
  email_admin_booking: boolean;
  sms_admin_registration: boolean;
  sms_admin_booking: boolean;
  digest_frequency: 'immediate' | 'hourly' | 'daily' | 'weekly';
}

interface Channels {
  email: boolean;
  sms: boolean;
  admin_email: boolean;
  admin_sms: boolean;
}

const TOGGLES: Array<{ key: keyof Settings; label: string; hint: string; channel: 'email' | 'sms' }> = [
  { key: 'email_parent_registration', label: 'Email the family when they register', hint: 'The confirmation the form promises them', channel: 'email' },
  { key: 'email_parent_booking', label: 'Email the family when they book a tour', hint: 'Date, time and where to come', channel: 'email' },
  { key: 'email_admin_registration', label: 'Email us on a new registration', hint: "Child's name and the parent's contact details", channel: 'email' },
  { key: 'email_admin_booking', label: 'Email us on a new tour booking', hint: 'Visitor, date and time slot', channel: 'email' },
  { key: 'sms_admin_registration', label: 'Text us on a new registration', hint: 'Costs per message', channel: 'sms' },
  { key: 'sms_admin_booking', label: 'Text us on a new tour booking', hint: 'Costs per message', channel: 'sms' },
];

export default function NotificationSettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [channels, setChannels] = useState<Channels | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await api<{ settings: Settings | null; channels: Channels }>('/admin/notification-settings');
      setSettings(res.settings);
      setChannels(res.channels);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); }
  }, [toast]);

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      await api('/admin/notification-settings', { method: 'PUT', body: JSON.stringify(settings) });
      setToast({ message: 'Notification settings saved', type: 'success' });
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Failed to save', type: 'error' });
    } finally { setSaving(false); }
  };

  if (loading) return <div className="h-96 animate-pulse rounded-xl bg-panel-raised/40" />;

  if (loadError || !settings) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-center">
        <p className="text-sm text-red-300">Could not load notification settings</p>
        {loadError && <p className="mt-1 text-xs text-red-400/80">{loadError}</p>}
        <Button variant="secondary" onClick={() => void load()} className="mt-3">Try again</Button>
      </div>
    );
  }

  const unavailable = (channel: 'email' | 'sms') => !channels?.[channel];

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-lg font-medium text-panel-strong">Notifications</h2>
        <p className="mt-1 text-xs text-panel-muted">
          What we send, and what we are told about.
        </p>
      </div>

      {/* A switch with nothing behind it is worse than no switch, so say so. */}
      {(unavailable('email') || unavailable('sms')) && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-300">
          <p className="font-medium">Not everything below can send yet.</p>
          <ul className="mt-2 space-y-1 text-xs text-amber-300/80">
            {unavailable('email') && (
              <li>
                Email is not configured. Set <code>SENDGRID_API_KEY</code> (or{' '}
                <code>SMTP_HOST</code>, <code>SMTP_USER</code>, <code>SMTP_PASS</code>) and{' '}
                <code>MAIL_FROM</code> on the server. Until then these settings are saved but
                nothing is sent.
              </li>
            )}
            {unavailable('sms') && (
              <li>
                SMS is not configured. Set <code>TWILIO_ACCOUNT_SID</code>,{' '}
                <code>TWILIO_AUTH_TOKEN</code>, <code>TWILIO_FROM</code> and{' '}
                <code>SMS_ADMIN</code>. UAE numbers also need a registered sender ID before
                messages arrive.
              </li>
            )}
          </ul>
        </div>
      )}

      <div className="divide-y divide-panel-line/50 rounded-xl border border-panel-line/50 bg-panel-surface">
        {TOGGLES.map((toggle) => (
          <label
            key={toggle.key}
            className="flex min-h-12 cursor-pointer items-start gap-3 p-4 transition-colors hover:bg-panel-raised/30"
          >
            <input
              type="checkbox"
              checked={Boolean(settings[toggle.key])}
              onChange={(e) =>
                setSettings((s) => (s ? { ...s, [toggle.key]: e.target.checked } : s))
              }
              className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-500"
            />
            <span className="flex-1">
              <span className="block text-sm text-panel-strong">{toggle.label}</span>
              <span className="block text-xs text-panel-muted">{toggle.hint}</span>
              {unavailable(toggle.channel) && (
                <span className="mt-1 block text-[11px] text-amber-400">
                  {toggle.channel === 'email' ? 'Email' : 'SMS'} is not configured — this will not
                  send yet
                </span>
              )}
            </span>
          </label>
        ))}
      </div>

      <FormField label="How often we are told">
        <Select
          value={settings.digest_frequency}
          onChange={(e) =>
            setSettings((s) => (s ? { ...s, digest_frequency: e.target.value as Settings['digest_frequency'] } : s))
          }
          options={[
            { value: 'immediate', label: 'Immediately, as each one arrives' },
            { value: 'hourly', label: 'Hourly summary' },
            { value: 'daily', label: 'Daily summary' },
            { value: 'weekly', label: 'Weekly summary' },
          ]}
        />
        <p className="mt-1 text-xs text-panel-muted">
          Only affects the alerts to us. A family always hears back straight away.
          {settings.digest_frequency !== 'immediate' && (
            <span className="mt-1 block text-amber-400">
              Summaries are not being sent yet — nothing schedules them. Alerts pause until this
              is set back to immediate.
            </span>
          )}
        </p>
      </FormField>

      <div className="flex justify-end">
        <Button onClick={() => void save()} disabled={saving}>
          {saving ? 'Saving…' : 'Save settings'}
        </Button>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  );
}
