'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../../lib/api';
import {
  Button,
  ConfirmDialog,
  FormField,
  Input,
  Modal,
  Toast,
} from '../../../../components/admin/shared';

const PLATFORMS = [
  'facebook',
  'instagram',
  'linkedin',
  'tiktok',
  'snapchat',
  'twitter',
  'youtube',
  'whatsapp',
] as const;

type Platform = (typeof PLATFORMS)[number];

interface SocialLink {
  id: string;
  platform: Platform;
  url: string;
  display_order: number;
  active: boolean;
}

interface FormState {
  platform: Platform;
  url: string;
  display_order: string;
  active: boolean;
}

const EMPTY: FormState = { platform: 'facebook', url: '', display_order: '0', active: true };

export default function SocialMediaSettingsPage() {
  const [links, setLinks] = useState<SocialLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<SocialLink | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<SocialLink | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setLinks(await api<SocialLink[]>('/admin/social-links'));
    } catch {
      setToast({ message: 'Failed to load social links', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const openNew = (): void => {
    setEditing(null);
    setForm(EMPTY);
    setError(null);
    setOpen(true);
  };

  const openEdit = (link: SocialLink): void => {
    setEditing(link);
    setForm({
      platform: link.platform,
      url: link.url,
      display_order: String(link.display_order),
      active: link.active,
    });
    setError(null);
    setOpen(true);
  };

  const save = async (): Promise<void> => {
    const url = form.url.trim();
    if (url !== '#' && !/^https?:\/\//i.test(url)) {
      setError('URL must start with http:// or https:// (or "#" if not set up yet)');
      return;
    }

    setSaving(true);
    setError(null);
    const body = JSON.stringify({
      platform: form.platform,
      url,
      display_order: Number(form.display_order) || 0,
      active: form.active,
    });

    try {
      if (editing) {
        await api(`/admin/social-links/${editing.id}`, { method: 'PUT', body });
      } else {
        await api('/admin/social-links', { method: 'POST', body });
      }
      setOpen(false);
      await load();
      setToast({ message: editing ? 'Link updated' : 'Link added', type: 'success' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the link');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (link: SocialLink): Promise<void> => {
    try {
      await api(`/admin/social-links/${link.id}`, { method: 'DELETE' });
      setConfirm(null);
      await load();
      setToast({ message: 'Link deleted', type: 'success' });
    } catch {
      setToast({ message: 'Failed to delete link', type: 'error' });
    }
  };

  return (
    <div className="p-4 md:p-6">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-panel-strong">Social media</h1>
          <p className="mt-1 text-sm text-panel-muted">
            These links appear in the website footer. A link set to
            <span className="mx-1 font-mono text-panel-body">#</span>
            or marked inactive is hidden from visitors.
          </p>
        </div>
        <Button onClick={openNew}>Add link</Button>
      </div>

      {loading ? (
        <p className="text-sm text-panel-muted">Loading…</p>
      ) : links.length === 0 ? (
        <p className="rounded-xl border border-panel-line/50 bg-panel-sunken p-6 text-sm text-panel-muted">
          No social links yet.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-panel-line/50 bg-panel-sunken">
          {/* Cards on mobile, table from md up */}
          <ul className="divide-y divide-panel-line/50 md:hidden">
            {links.map((l) => (
              <li key={l.id} className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium capitalize text-panel-strong">{l.platform}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] uppercase ${
                      l.active && l.url !== '#'
                        ? 'bg-emerald-500/10 text-emerald-400'
                        : 'bg-panel-raised-2/30 text-panel-body'
                    }`}
                  >
                    {l.url === '#' ? 'not set' : l.active ? 'live' : 'hidden'}
                  </span>
                </div>
                <p className="mt-1 break-all text-xs text-panel-muted">{l.url}</p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => openEdit(l)}
                    className="min-h-11 flex-1 rounded-lg bg-panel-raised text-sm text-panel-strong"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirm(l)}
                    className="min-h-11 flex-1 rounded-lg bg-red-500/10 text-sm text-red-400"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <table className="hidden w-full text-left text-sm md:table">
            <thead className="border-b border-panel-line/50 text-xs uppercase tracking-wide text-panel-muted">
              <tr>
                <th className="px-4 py-3">Platform</th>
                <th className="px-4 py-3">URL</th>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-panel-line/50">
              {links.map((l) => (
                <tr key={l.id}>
                  <td className="px-4 py-3 capitalize text-panel-strong">{l.platform}</td>
                  <td className="max-w-xs truncate px-4 py-3 text-panel-body">{l.url}</td>
                  <td className="px-4 py-3 text-panel-body">{l.display_order}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] uppercase ${
                        l.active && l.url !== '#'
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : 'bg-panel-raised-2/30 text-panel-body'
                      }`}
                    >
                      {l.url === '#' ? 'not set' : l.active ? 'live' : 'hidden'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => openEdit(l)}
                      className="min-h-11 px-3 text-sm text-emerald-400 hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirm(l)}
                      className="min-h-11 px-3 text-sm text-red-400 hover:underline"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Edit social link' : 'Add social link'}
      >
        <div className="space-y-4">
          <FormField label="Platform">
            <select
              value={form.platform}
              onChange={(e) => setForm((f) => ({ ...f, platform: e.target.value as Platform }))}
              className="w-full rounded-lg border border-panel-line-2 bg-panel-surface p-2 text-sm text-panel-strong"
            >
              {PLATFORMS.map((p) => (
                <option key={p} value={p} className="capitalize">
                  {p}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="URL">
            <Input
              value={form.url}
              onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
              placeholder="https://facebook.com/littlesmarties"
            />
          </FormField>

          <FormField label="Display order">
            <Input
              type="number"
              min={0}
              value={form.display_order}
              onChange={(e) => setForm((f) => ({ ...f, display_order: e.target.value }))}
            />
          </FormField>

          <label className="flex min-h-11 items-center gap-3 text-sm text-panel-body">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
              className="h-5 w-5 rounded border-panel-line-2 bg-panel-surface"
            />
            Show in footer
          </label>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirm !== null}
        title="Delete social link"
        message={`Remove the ${confirm?.platform ?? ''} link from the footer? It can be restored from the database if needed.`}
        confirmLabel="Delete"
        destructive
        onConfirm={() => { if (confirm) void remove(confirm); }}
        onClose={() => setConfirm(null)}
      />

      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  );
}
