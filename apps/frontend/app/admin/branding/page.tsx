'use client';

import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { api } from '../../../lib/api';
import { useSiteMedia } from '../../../lib/media';
import { DEFAULT_BRANDING, type SiteBranding } from '../../../lib/branding';
import { Button, FormField, Input, Toast } from '../../../components/admin/shared';

/**
 * The site's name, tagline and accent colour.
 *
 * The logo is shown here but not edited here. It lives in the Media Library
 * under the "logo" slot, which already handles the upload, the Cloudinary
 * transform and the alt text — duplicating that as a URL box on this page
 * would give the site two places to set a logo and no rule about which wins.
 * So it is previewed with a pointer to where it is changed.
 */
export default function BrandingPage() {
  const [branding, setBranding] = useState<SiteBranding>(DEFAULT_BRANDING);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const siteMedia = useSiteMedia();
  const logo = siteMedia.logo ?? null;

  const load = useCallback(async () => {
    try {
      const res = await api<SiteBranding>('/admin/branding');
      setBranding({
        site_name: res.site_name ?? DEFAULT_BRANDING.site_name,
        tagline: res.tagline ?? null,
        primary_color: res.primary_color ?? DEFAULT_BRANDING.primary_color,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load branding');
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

  const valid = /^#[0-9a-fA-F]{6}$/.test(branding.primary_color);
  const named = branding.site_name.trim().length > 0;

  const save = async () => {
    setSaving(true);
    try {
      await api('/admin/branding', {
        method: 'PUT',
        body: JSON.stringify({
          site_name: branding.site_name.trim(),
          tagline: branding.tagline?.trim() ? branding.tagline.trim() : null,
          primary_color: branding.primary_color,
        }),
      });
      setToast({ message: 'Branding saved', type: 'success' });
    } catch (err) {
      // The server's message rather than a generic one: it explains which
      // field was rejected and why.
      setToast({
        message: err instanceof Error ? err.message : 'Could not save branding',
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
        <h1 className="text-xl font-semibold text-panel-strong">Site branding</h1>
        <p className="mt-1 text-sm text-panel-muted">
          The name and colour shown in the header of the public site.
        </p>
      </div>

      {error && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </p>
      )}

      <section className="space-y-5 rounded-xl border border-panel-line/50 bg-panel-surface p-6">
        <FormField label="Site name">
          <Input
            value={branding.site_name}
            onChange={(e) => setBranding({ ...branding, site_name: e.target.value })}
            placeholder="Little Smarties"
            maxLength={200}
          />
        </FormField>

        <FormField label="Tagline (optional)">
          <Input
            value={branding.tagline ?? ''}
            onChange={(e) => setBranding({ ...branding, tagline: e.target.value })}
            placeholder="Not shown in the header yet"
            maxLength={300}
          />
        </FormField>

        <FormField
          label="Accent colour"
          error={valid ? undefined : 'Use a six-digit hex colour, like #1e40af'}
        >
          <div className="flex items-center gap-3">
            <input
              type="color"
              aria-label="Pick the accent colour"
              value={valid ? branding.primary_color : DEFAULT_BRANDING.primary_color}
              onChange={(e) => setBranding({ ...branding, primary_color: e.target.value })}
              className="h-11 w-16 cursor-pointer rounded-lg border border-panel-line bg-panel-sunken"
            />
            <Input
              value={branding.primary_color}
              onChange={(e) => setBranding({ ...branding, primary_color: e.target.value })}
              placeholder="#1e40af"
              className="flex-1 font-mono"
            />
          </div>
        </FormField>

        {/* What the header will look like. Same weight and size as the real
            one, so the colour can be judged against the type it will sit in
            rather than as a swatch. */}
        <div className="rounded-lg border border-panel-line bg-white p-4">
          <p className="mb-2 text-xs uppercase tracking-wider text-panel-muted">Preview</p>
          <div className="flex items-center gap-2">
            {logo && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={logo.url}
                alt={logo.alt_text || branding.site_name}
                className="h-8 w-auto max-w-35 object-contain"
              />
            )}
            <span
              className="text-lg font-bold md:text-xl"
              style={{ color: valid ? branding.primary_color : DEFAULT_BRANDING.primary_color }}
            >
              {branding.site_name || 'Little Smarties'}
            </span>
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={() => void save()} disabled={saving || !valid || !named}>
            {saving ? 'Saving…' : 'Save branding'}
          </Button>
        </div>
      </section>

      <section className="rounded-xl border border-panel-line/50 bg-panel-surface p-6">
        <h2 className="text-sm font-medium text-panel-strong">Logo</h2>
        <p className="mt-1 text-sm text-panel-muted">
          The logo is managed in the Media Library, under the “logo” slot — that is
          where the upload, the alt text and the favicon already live.
        </p>
        <div className="mt-4 flex items-center gap-4">
          <div className="flex h-16 items-center rounded-lg border border-panel-line bg-white px-4">
            {logo ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={logo.url}
                alt={logo.alt_text || branding.site_name}
                className="h-10 w-auto object-contain"
              />
            ) : (
              <span className="text-sm text-panel-muted">No logo uploaded</span>
            )}
          </div>
          <Button variant="secondary" onClick={() => { window.location.href = '/admin/media'; }}>
            Open Media Library
          </Button>
        </div>
      </section>

      <AnimatePresence>
        {toast && <Toast message={toast.message} type={toast.type} />}
      </AnimatePresence>
    </div>
  );
}
