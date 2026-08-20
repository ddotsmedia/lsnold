'use client';

import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { api } from '../../../lib/api';
import {
  FONT_OPTIONS, FONT_STACKS, MIN_FONT_SIZE, MAX_FONT_SIZE, DEFAULT_FONT_SIZE,
  isFontToken, type FontToken,
} from '../../../lib/typography';
import { Button, FormField, Select, Toast } from '../../../components/admin/shared';

/**
 * The site's font and base text size.
 *
 * Stored alongside the name and colour in site_branding, and saved through the
 * same endpoint — the save sends all five fields, so this page loads the
 * current name and colour and passes them back untouched. Sending only the two
 * it edits would blank the other three.
 */
interface BrandingRow {
  site_name: string;
  tagline: string | null;
  primary_color: string;
  font_family: FontToken;
  base_font_size: number;
}

const FALLBACK: BrandingRow = {
  site_name: 'Little Smarties',
  tagline: null,
  primary_color: '#1e40af',
  font_family: 'default',
  base_font_size: DEFAULT_FONT_SIZE,
};

export default function TypographyPage() {
  const [row, setRow] = useState<BrandingRow>(FALLBACK);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api<Partial<BrandingRow>>('/admin/branding');
      setRow({
        site_name: res.site_name ?? FALLBACK.site_name,
        tagline: res.tagline ?? null,
        primary_color: res.primary_color ?? FALLBACK.primary_color,
        font_family: isFontToken(res.font_family) ? res.font_family : 'default',
        base_font_size: Number(res.base_font_size) || DEFAULT_FONT_SIZE,
      });
    } catch {
      setToast({ message: 'Could not load current typography', type: 'error' });
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

  const save = async () => {
    setSaving(true);
    try {
      await api('/admin/branding', {
        method: 'PUT',
        body: JSON.stringify(row),
      });
      setToast({ message: 'Typography saved', type: 'success' });
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'Could not save typography',
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
        <h1 className="text-xl font-semibold text-panel-strong">Typography</h1>
        <p className="mt-1 text-sm text-panel-muted">
          The font and text size of the public site. The admin panel keeps its own,
          so changing these will not resize this page.
        </p>
      </div>

      <section className="space-y-5 rounded-xl border border-panel-line/50 bg-panel-surface p-6">
        <FormField label="Font">
          <Select
            value={row.font_family}
            onChange={(e) =>
              setRow({
                ...row,
                font_family: isFontToken(e.target.value) ? e.target.value : 'default',
              })
            }
            options={FONT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          />
        </FormField>

        <FormField label={`Base text size — ${row.base_font_size}px`}>
          <input
            type="range"
            min={MIN_FONT_SIZE}
            max={MAX_FONT_SIZE}
            step={1}
            value={row.base_font_size}
            aria-label="Base text size in pixels"
            onChange={(e) => setRow({ ...row, base_font_size: Number(e.target.value) })}
            className="w-full accent-emerald-500"
          />
          <div className="flex justify-between text-xs text-panel-muted">
            <span>{MIN_FONT_SIZE}px</span>
            <span>16px is the browser default</span>
            <span>{MAX_FONT_SIZE}px</span>
          </div>
        </FormField>

        {/* Rendered at the real size against a white ground, because that is
            what the site is. Judging 20px type inside a 16px dark panel tells
            you very little about how the page will read. */}
        <div className="rounded-lg border border-panel-line bg-white p-5 text-gray-900">
          <p className="mb-3 text-xs uppercase tracking-wider text-gray-500">Preview</p>
          <div style={{ fontFamily: FONT_STACKS[row.font_family], fontSize: `${row.base_font_size}px` }}>
            <p className="font-semibold">Welcome to Little Smarties Nursery</p>
            <p className="mt-2">
              We have cared for children in Abu Dhabi since 2007, with a warm start
              for the tiniest learners and a confident finish before primary school.
            </p>
            <p className="mt-2 text-[0.875em] text-gray-600">
              Smaller text, at the same scale — captions and helper lines move with it.
            </p>
          </div>
        </div>

        <p className="text-xs text-panel-muted">
          Headings keep their handwritten font. Only body text changes.
        </p>

        <div className="flex justify-end">
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? 'Saving…' : 'Save typography'}
          </Button>
        </div>
      </section>

      <AnimatePresence>
        {toast && <Toast message={toast.message} type={toast.type} />}
      </AnimatePresence>
    </div>
  );
}
