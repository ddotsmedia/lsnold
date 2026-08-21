'use client';

import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { api } from '../../../lib/api';
import { DEFAULT_FOOTER, clearFooterCache, lines, type SiteFooter } from '../../../lib/footer';
import { Button, FormField, Input, Textarea, Toast } from '../../../components/admin/shared';

/**
 * The footer's company name, logo and contact details.
 *
 * email, address and hours are one entry per line — that is how the footer
 * already renders them (two mailto links, a three-line address, two lines of
 * opening times), so the editor uses textareas rather than pretending each is
 * a single value.
 *
 * The footer's quick links and social icons are not edited here: the links are
 * route constants in the component, and the icons already come from
 * admin -> Social Media.
 */
export default function FooterPage() {
  const [footer, setFooter] = useState<SiteFooter>(DEFAULT_FOOTER);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api<Partial<SiteFooter>>('/admin/footer');
      setFooter({
        company_name: res.company_name ?? DEFAULT_FOOTER.company_name,
        logo_url: res.logo_url ?? null,
        phone: res.phone ?? null,
        email: res.email ?? null,
        address: res.address ?? null,
        hours: res.hours ?? null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load footer');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const named = footer.company_name.trim().length > 0;
  const logoValid =
    !footer.logo_url?.trim() || /^https?:\/\/\S+$/i.test(footer.logo_url.trim());

  const set = (patch: Partial<SiteFooter>): void => setFooter({ ...footer, ...patch });

  /** Blank textareas are sent as null so the column clears rather than storing ''. */
  const orNull = (v: string | null): string | null => (v?.trim() ? v.trim() : null);

  const save = async (): Promise<void> => {
    setSaving(true);
    try {
      await api('/admin/footer', {
        method: 'PUT',
        body: JSON.stringify({
          company_name: footer.company_name.trim(),
          logo_url: orNull(footer.logo_url),
          phone: orNull(footer.phone),
          email: orNull(footer.email),
          address: orNull(footer.address),
          hours: orNull(footer.hours),
        }),
      });
      // The public hook caches per tab; drop it so a preview in this browser
      // shows the new details without a hard reload.
      clearFooterCache();
      setToast({ message: 'Footer saved', type: 'success' });
    } catch (err) {
      // The server's message rather than a generic one: it explains which
      // field was rejected and why.
      setToast({
        message: err instanceof Error ? err.message : 'Could not save footer',
        type: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-400/30 border-t-emerald-400" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-panel-strong">Footer</h1>
        <p className="mt-1 text-sm text-panel-muted">
          The company name and contact details shown at the bottom of every public page.
        </p>
      </div>

      {error && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </p>
      )}

      <section className="space-y-5 rounded-xl border border-panel-line/50 bg-panel-surface p-6">
        <FormField label="Company name">
          <Input
            value={footer.company_name}
            onChange={(e) => set({ company_name: e.target.value })}
            placeholder="Little Smarties"
            maxLength={200}
          />
        </FormField>

        <FormField
          label="Logo URL (optional)"
          error={logoValid ? undefined : 'Use a full URL starting http:// or https://'}
        >
          <Input
            value={footer.logo_url ?? ''}
            onChange={(e) => set({ logo_url: e.target.value })}
            placeholder="Leave empty to keep the 🐣 badge"
            maxLength={2048}
          />
        </FormField>

        <FormField label="Phone">
          <Input
            value={footer.phone ?? ''}
            onChange={(e) => set({ phone: e.target.value })}
            placeholder="+971 56 267 7747"
            maxLength={50}
          />
        </FormField>

        <FormField label="Email — one per line">
          <Textarea
            rows={2}
            value={footer.email ?? ''}
            onChange={(e) => set({ email: e.target.value })}
            placeholder={'lsnmoj@gmail.com\ninfo@lsn.ae'}
            maxLength={500}
          />
        </FormField>

        <FormField label="Address — one line per row">
          <Textarea
            rows={3}
            value={footer.address ?? ''}
            onChange={(e) => set({ address: e.target.value })}
            maxLength={1000}
          />
        </FormField>

        <FormField label="Opening hours — one per line">
          <Textarea
            rows={2}
            value={footer.hours ?? ''}
            onChange={(e) => set({ hours: e.target.value })}
            placeholder={'Mon – Fri: 7:00 – 18:00\nWeekends: Closed'}
            maxLength={500}
          />
        </FormField>

        {/* The address also drives the embedded map, so it is worth seeing the
            lines split exactly as the footer will join them. */}
        <div className="rounded-lg border border-panel-line bg-blue-700 p-4 text-sm text-blue-100/90">
          <p className="mb-2 text-xs uppercase tracking-wider text-blue-200/70">Preview</p>
          <p className="font-semibold text-white">{footer.company_name || 'Little Smarties'}</p>
          {lines(footer.email).map((l) => <p key={l}>{l}</p>)}
          {footer.phone?.trim() && <p>{footer.phone}</p>}
          {lines(footer.hours).map((l) => <p key={l}>{l}</p>)}
          {lines(footer.address).map((l) => <p key={l}>{l}</p>)}
        </div>

        <div className="flex justify-end">
          <Button onClick={() => void save()} disabled={saving || !named || !logoValid}>
            {saving ? 'Saving…' : 'Save footer'}
          </Button>
        </div>
      </section>

      <AnimatePresence>
        {toast && <Toast message={toast.message} type={toast.type} />}
      </AnimatePresence>
    </div>
  );
}
