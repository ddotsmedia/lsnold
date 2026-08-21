'use client';

import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { api, type PaginatedResponse } from '../../../lib/api';
import { clearStaffCache } from '../../../lib/staff';
import {
  Button,
  ConfirmDialog,
  FormField,
  Input,
  Modal,
  Textarea,
  Toast,
} from '../../../components/admin/shared';
import { ImageUploader, MediaLibrary, type MediaItem } from '../../../components/admin/MediaKit';

interface AdminStaff {
  id: string;
  name: string;
  role: string | null;
  bio: string | null;
  photo_url: string | null;
  display_order: number;
  published: boolean;
}

interface Draft {
  name: string;
  role: string;
  bio: string;
  photo_url: string;
  published: boolean;
}

const EMPTY: Draft = { name: '', role: '', bio: '', photo_url: '', published: true };

const toDraft = (s: AdminStaff): Draft => ({
  name: s.name,
  role: s.role ?? '',
  bio: s.bio ?? '',
  photo_url: s.photo_url ?? '',
  published: s.published,
});

const dirty = (a: Draft, b: Draft): boolean =>
  a.name.trim() !== b.name.trim() ||
  a.role.trim() !== b.role.trim() ||
  a.bio.trim() !== b.bio.trim() ||
  a.photo_url.trim() !== b.photo_url.trim() ||
  a.published !== b.published;

const photoValid = (url: string): boolean => !url.trim() || /^https?:\/\/\S+$/i.test(url.trim());

/** Initials shown where a member has no photo, matching TeamMemberCard. */
const initials = (name: string): string =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0] ?? '').join('').toUpperCase() || '?';

/**
 * The team shown on the About page.
 *
 * Photos are chosen from the Media Library, the same picker the footer logo
 * uses, so a photo is uploaded once and reused rather than pasted as a URL.
 */
export default function StaffPage() {
  const [staff, setStaff] = useState<AdminStaff[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<AdminStaff | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newMember, setNewMember] = useState<Draft>(EMPTY);
  const [adding, setAdding] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Media picker. `pickerFor` is the row id being edited, or 'new'.
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [library, setLibrary] = useState<MediaItem[]>([]);
  const [libLoading, setLibLoading] = useState(false);

  const fail = (err: unknown, fallback: string): void =>
    setToast({ message: err instanceof Error ? err.message : fallback, type: 'error' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await api<AdminStaff[]>('/admin/staff');
      setStaff(rows);
      setDrafts(Object.fromEntries(rows.map((r) => [r.id, toDraft(r)])));
    } catch (err) {
      fail(err, 'Failed to load staff');
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

  const loadLibrary = useCallback(async () => {
    setLibLoading(true);
    try {
      const res = await api<PaginatedResponse<MediaItem>>('/admin/media', { params: { limit: 60 } });
      setLibrary(res.data);
    } catch {
      setToast({ message: 'Could not load the media library', type: 'error' });
    } finally {
      setLibLoading(false);
    }
  }, []);

  const openPicker = (id: string): void => {
    setPickerFor(id);
    if (library.length === 0) void loadLibrary();
  };

  const setPhoto = (url: string): void => {
    if (pickerFor === 'new') setNewMember((m) => ({ ...m, photo_url: url }));
    else if (pickerFor) {
      const id = pickerFor;
      setDrafts((p) => {
        const current = p[id];
        return current ? { ...p, [id]: { ...current, photo_url: url } } : p;
      });
    }
    setPickerFor(null);
  };

  const save = async (member: AdminStaff): Promise<void> => {
    const draft = drafts[member.id];
    if (!draft) return;
    if (!draft.name.trim()) {
      setToast({ message: 'A name is required', type: 'error' });
      return;
    }

    setSavingId(member.id);
    try {
      const saved = await api<AdminStaff>(`/admin/staff/${member.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: draft.name.trim(),
          role: draft.role.trim() || null,
          bio: draft.bio.trim() || null,
          photo_url: draft.photo_url.trim() || null,
          published: draft.published,
        }),
      });
      setStaff((prev) => prev.map((s) => (s.id === member.id ? saved : s)));
      setDrafts((prev) => ({ ...prev, [member.id]: toDraft(saved) }));
      clearStaffCache();
      setToast({ message: 'Saved', type: 'success' });
    } catch (err) {
      fail(err, 'Failed to save');
    } finally {
      setSavingId(null);
    }
  };

  const add = async (): Promise<void> => {
    if (!newMember.name.trim()) {
      setToast({ message: 'A name is required', type: 'error' });
      return;
    }
    setAdding(true);
    try {
      const created = await api<AdminStaff>('/admin/staff', {
        method: 'POST',
        body: JSON.stringify({
          name: newMember.name.trim(),
          role: newMember.role.trim() || null,
          bio: newMember.bio.trim() || null,
          photo_url: newMember.photo_url.trim() || null,
          published: newMember.published,
        }),
      });
      setStaff((prev) => [...prev, created]);
      setDrafts((prev) => ({ ...prev, [created.id]: toDraft(created) }));
      clearStaffCache();
      setAddOpen(false);
      setNewMember(EMPTY);
      setToast({ message: 'Added', type: 'success' });
    } catch (err) {
      fail(err, 'Failed to add');
    } finally {
      setAdding(false);
    }
  };

  const remove = async (member: AdminStaff): Promise<void> => {
    try {
      await api(`/admin/staff/${member.id}`, { method: 'DELETE' });
      setStaff((prev) => prev.filter((s) => s.id !== member.id));
      clearStaffCache();
      setToast({ message: 'Removed', type: 'success' });
    } catch (err) {
      fail(err, 'Failed to remove');
    } finally {
      setConfirm(null);
    }
  };

  const move = async (index: number, delta: number): Promise<void> => {
    const target = index + delta;
    if (target < 0 || target >= staff.length) return;

    const next = [...staff];
    const moved = next[index];
    const other = next[target];
    if (!moved || !other) return;
    next[index] = other;
    next[target] = moved;
    setStaff(next);

    try {
      await api('/admin/staff/reorder', {
        method: 'PUT',
        body: JSON.stringify({ ids: next.map((s) => s.id) }),
      });
      clearStaffCache();
    } catch (err) {
      setStaff(staff);
      fail(err, 'Failed to reorder');
    }
  };

  const photoBox = (url: string, name: string) => (
    <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-panel-line bg-panel-sunken text-sm font-semibold text-panel-muted">
      {url.trim() && photoValid(url) ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        initials(name)
      )}
    </div>
  );

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-panel-strong">Staff</h1>
          <p className="mt-1 text-sm text-panel-muted">
            The team shown on the About page. Members without a photo show their initials.
          </p>
        </div>
        <Button onClick={() => { setNewMember(EMPTY); setAddOpen(true); }}>Add member</Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-400/30 border-t-emerald-400" />
        </div>
      ) : staff.length === 0 ? (
        <div className="rounded-xl border border-panel-line/50 bg-panel-surface p-8 text-center text-sm text-panel-muted">
          Nobody added yet. The About page will show its built-in team until you add someone.
        </div>
      ) : (
        <div className="space-y-4">
          {staff.map((member, index) => {
            const draft = drafts[member.id] ?? toDraft(member);
            const changed = dirty(draft, toDraft(member));
            const validPhoto = photoValid(draft.photo_url);

            return (
              <div
                key={member.id}
                className="space-y-4 rounded-xl border border-panel-line/50 bg-panel-surface p-4 md:p-5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] text-panel-muted">#{index + 1}</span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost" size="sm"
                      aria-label={`Move ${member.name} up`}
                      disabled={index === 0}
                      onClick={() => void move(index, -1)}
                    >↑</Button>
                    <Button
                      variant="ghost" size="sm"
                      aria-label={`Move ${member.name} down`}
                      disabled={index === staff.length - 1}
                      onClick={() => void move(index, 1)}
                    >↓</Button>
                    <Button variant="danger" size="sm" onClick={() => setConfirm(member)}>
                      Delete
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {photoBox(draft.photo_url, draft.name)}
                  <Button variant="secondary" onClick={() => openPicker(member.id)}>
                    Choose photo
                  </Button>
                  {draft.photo_url.trim() && (
                    <Button
                      variant="ghost"
                      onClick={() =>
                        setDrafts((p) => ({ ...p, [member.id]: { ...draft, photo_url: '' } }))
                      }
                    >
                      Remove photo
                    </Button>
                  )}
                  {!validPhoto && (
                    <p className="text-xs text-red-400">Photo must be an http:// or https:// URL</p>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField label="Name">
                    <Input
                      value={draft.name}
                      onChange={(e) =>
                        setDrafts((p) => ({ ...p, [member.id]: { ...draft, name: e.target.value } }))
                      }
                      maxLength={200}
                    />
                  </FormField>
                  <FormField label="Role">
                    <Input
                      value={draft.role}
                      onChange={(e) =>
                        setDrafts((p) => ({ ...p, [member.id]: { ...draft, role: e.target.value } }))
                      }
                      placeholder="Head Teacher - Infants"
                      maxLength={100}
                    />
                  </FormField>
                </div>

                <FormField label="Bio">
                  <Textarea
                    rows={3}
                    value={draft.bio}
                    onChange={(e) =>
                      setDrafts((p) => ({ ...p, [member.id]: { ...draft, bio: e.target.value } }))
                    }
                    maxLength={2000}
                  />
                </FormField>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-panel-muted">
                    <input
                      type="checkbox"
                      checked={draft.published}
                      onChange={(e) =>
                        setDrafts((p) => ({ ...p, [member.id]: { ...draft, published: e.target.checked } }))
                      }
                      className="accent-emerald-500"
                    />
                    Published
                  </label>
                  <Button
                    onClick={() => void save(member)}
                    disabled={!changed || !validPhoto || savingId === member.id}
                  >
                    {savingId === member.id ? 'Saving…' : 'Save'}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add a team member">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            {photoBox(newMember.photo_url, newMember.name)}
            <Button variant="secondary" onClick={() => openPicker('new')}>Choose photo</Button>
          </div>
          <FormField label="Name">
            <Input
              value={newMember.name}
              onChange={(e) => setNewMember({ ...newMember, name: e.target.value })}
              maxLength={200}
            />
          </FormField>
          <FormField label="Role">
            <Input
              value={newMember.role}
              onChange={(e) => setNewMember({ ...newMember, role: e.target.value })}
              maxLength={100}
            />
          </FormField>
          <FormField label="Bio">
            <Textarea
              rows={3}
              value={newMember.bio}
              onChange={(e) => setNewMember({ ...newMember, bio: e.target.value })}
              maxLength={2000}
            />
          </FormField>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={() => void add()} disabled={adding}>
              {adding ? 'Adding…' : 'Add member'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={pickerFor !== null}
        onClose={() => setPickerFor(null)}
        title="Choose a photo"
        maxWidth="max-w-3xl"
      >
        <div className="space-y-5">
          <ImageUploader
            category="site"
            label="Upload a new photo"
            onUpload={(items) => {
              setLibrary((current) => [...items, ...current]);
              const first = items[0];
              if (first) setPhoto(first.url);
            }}
          />
          <div>
            <p className="mb-3 text-xs uppercase tracking-wider text-panel-muted">
              Or pick one already uploaded
            </p>
            <MediaLibrary
              items={library}
              loading={libLoading}
              onSelect={(item) => setPhoto(item.url)}
              emptyMessage="Nothing in the media library yet. Upload a photo above."
            />
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirm !== null}
        title="Remove this team member?"
        message={confirm ? `${confirm.name} will no longer appear on the About page.` : ''}
        confirmLabel="Remove"
        destructive
        onConfirm={() => { if (confirm) void remove(confirm); }}
        onClose={() => setConfirm(null)}
      />

      <AnimatePresence>
        {toast && <Toast message={toast.message} type={toast.type} />}
      </AnimatePresence>
    </div>
  );
}
