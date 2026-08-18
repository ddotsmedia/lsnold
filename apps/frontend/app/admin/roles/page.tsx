'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { Button, Toast } from '../../../components/admin/shared';

/**
 * What each role may do.
 *
 * The admin row is shown but not editable: an administrator who removed
 * manage:permissions from their own role would have shut the door on the only
 * account that could ever open it again. To restrict someone, change their
 * role on the Users screen rather than weakening admin.
 */

interface Role {
  id: string;
  name: string;
  description: string | null;
  permission_ids: string[];
  user_count: number;
}

interface Permission {
  id: string;
  name: string;
  description: string | null;
}

/** Groups permissions by what they act on, so the table reads in sections. */
function groupOf(permission: string): string {
  const subject = permission.split(':')[1] ?? 'other';
  return subject.charAt(0).toUpperCase() + subject.slice(1);
}

export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [draft, setDraft] = useState<Record<string, Set<string>>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await api<{ roles: Role[]; permissions: Permission[] }>('/admin/roles');
      setRoles(res.roles);
      setPermissions(res.permissions);
      setDraft(Object.fromEntries(res.roles.map((r) => [r.id, new Set(r.permission_ids)])));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load roles');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); }
  }, [toast]);

  const toggle = (roleId: string, permissionId: string) =>
    setDraft((current) => {
      const next = { ...current };
      const set = new Set(next[roleId] ?? []);
      if (set.has(permissionId)) set.delete(permissionId); else set.add(permissionId);
      next[roleId] = set;
      return next;
    });

  const save = async (role: Role) => {
    setSaving(role.id);
    try {
      await api(`/admin/roles/${role.id}/permissions`, {
        method: 'PUT',
        body: JSON.stringify({ permission_ids: [...(draft[role.id] ?? [])] }),
      });
      setToast({ message: `Saved what ${role.name} may do`, type: 'success' });
      await load();
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Failed to save', type: 'error' });
    } finally { setSaving(null); }
  };

  const changed = (role: Role) => {
    const set = draft[role.id];
    if (!set) return false;
    return set.size !== role.permission_ids.length
      || role.permission_ids.some((id) => !set.has(id));
  };

  if (loading) {
    return <div className="h-64 animate-pulse rounded-xl bg-panel-raised/40" />;
  }

  if (loadError) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-center">
        <p className="text-sm text-red-300">Could not load roles</p>
        <p className="mt-1 text-xs text-red-400/80">{loadError}</p>
        <Button variant="secondary" onClick={() => void load()} className="mt-3">Try again</Button>
      </div>
    );
  }

  const groups = [...new Set(permissions.map((p) => groupOf(p.name)))];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium text-panel-strong">Roles &amp; permissions</h2>
        <p className="mt-1 text-xs text-panel-muted">
          Every account has one role, set on the Users screen. This decides what each role may do.
          Admin always keeps everything.
        </p>
      </div>

      {/* Scrolls inside itself rather than pushing the page sideways. */}
      <div className="overflow-x-auto rounded-xl border border-panel-line/50 bg-panel-surface">
        <table className="w-full min-w-150 text-sm">
          <thead>
            <tr className="border-b border-panel-line/50">
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-panel-muted">
                Permission
              </th>
              {roles.map((role) => (
                <th key={role.id} className="px-4 py-3 text-center text-xs font-medium text-panel-body">
                  <span className="block capitalize text-panel-strong">{role.name}</span>
                  <span className="text-[11px] font-normal text-panel-faint">
                    {role.user_count} {role.user_count === 1 ? 'account' : 'accounts'}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <>
                <tr key={`h-${group}`} className="bg-panel-surface/40">
                  <td
                    colSpan={roles.length + 1}
                    className="px-4 py-1.5 text-[11px] font-medium uppercase tracking-wider text-panel-muted"
                  >
                    {group}
                  </td>
                </tr>
                {permissions.filter((p) => groupOf(p.name) === group).map((permission) => (
                  <tr key={permission.id} className="border-b border-panel-line/30">
                    <td className="px-4 py-2">
                      <code className="text-[11px] text-panel-body">{permission.name}</code>
                      {permission.description && (
                        <p className="text-[11px] text-panel-faint">{permission.description}</p>
                      )}
                    </td>
                    {roles.map((role) => {
                      const locked = role.name === 'admin';
                      return (
                        <td key={role.id} className="px-4 py-2 text-center">
                          <label className="inline-flex min-h-12 min-w-12 items-center justify-center">
                            <input
                              type="checkbox"
                              checked={locked || (draft[role.id]?.has(permission.id) ?? false)}
                              disabled={locked}
                              onChange={() => toggle(role.id, permission.id)}
                              aria-label={`${permission.name} for ${role.name}`}
                              className="h-4 w-4 accent-emerald-500 disabled:opacity-40"
                            />
                          </label>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="px-4 py-3" />
              {roles.map((role) => (
                <td key={role.id} className="px-4 py-3 text-center">
                  {role.name === 'admin' ? (
                    <span className="text-[11px] text-panel-faint">Always full access</span>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => void save(role)}
                      disabled={saving === role.id || !changed(role)}
                    >
                      {saving === role.id ? 'Saving…' : 'Save'}
                    </Button>
                  )}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  );
}
