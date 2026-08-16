'use client';

import { useEffect, useState, useCallback } from 'react';
import { api } from '../../../lib/api';
import type { PaginatedResponse } from '../../../lib/api';
import { DataTable } from '../../../components/admin/DataTable';
import type { Column } from '../../../components/admin/DataTable';
import { StatusBadge, SearchBar, Button, Modal, FormField, Input, Toast, ConfirmDialog } from '../../../components/admin/shared';

interface User {
  id: string; email: string; name: string; phone: string;
  /** users.role — what actually decides access. */
  role: string | null;
  admin_role: string | null; admin_permissions: string[] | null;
  created_at: string;
}

export default function UsersPage() {
  const [data, setData] = useState<User[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: '', name: '', password: '', role: 'viewer' });
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);

  const fetchData = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const res = await api<PaginatedResponse<User>>('/admin/users', { params: { page, limit: 20, search } });
      setData(res.data);
      setPagination(res.pagination);
    } catch { setToast({ message: 'Failed to load users', type: 'error' }); }
    finally { setLoading(false); }
  }, [search]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); } }, [toast]);

  const invite = async () => {
    try {
      await api('/admin/users/invite', { method: 'POST', body: JSON.stringify(inviteForm) });
      setToast({ message: 'Admin invited', type: 'success' });
      setShowInvite(false);
      setInviteForm({ email: '', name: '', password: '', role: 'viewer' });
      fetchData(pagination.page);
    } catch { setToast({ message: 'Failed to invite', type: 'error' }); }
  };

  const revokeAdmin = async () => {
    if (!confirmRevoke) return;
    try {
      await api(`/admin/users/${confirmRevoke}/admin`, { method: 'DELETE' });
      setToast({ message: 'Admin access revoked', type: 'success' });
      fetchData(pagination.page);
    } catch (e) { setToast({ message: (e as Error).message || 'Failed', type: 'error' }); }
    setConfirmRevoke(null);
  };

  const columns: Column<User>[] = [
    { key: 'name', header: 'Name', render: (r) => <span className="font-medium">{r.name}</span> },
    { key: 'email', header: 'Email' },
    { key: 'role', header: 'Role', render: (r) => r.role ? <StatusBadge status={r.role} /> : <span className="text-xs text-zinc-600">No access</span> },
    { key: 'created_at', header: 'Joined', render: (r) => <span className="text-xs text-zinc-500">{new Date(r.created_at).toLocaleDateString()}</span> },
    { key: 'actions', header: '', className: 'w-[120px]', render: (r) => (
      r.role ? (
        <Button size="sm" variant="danger" onClick={(e) => { e.stopPropagation(); setConfirmRevoke(r.id); }}>Revoke</Button>
      ) : null
    )},
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between gap-3">
        <div className="flex-1 max-w-xs"><SearchBar value={search} onChange={setSearch} placeholder="Search users..." /></div>
        <Button onClick={() => setShowInvite(true)}>+ Invite Admin</Button>
      </div>

      <DataTable columns={columns} data={data} loading={loading} pagination={pagination} onPageChange={(p) => fetchData(p)} />

      <Modal open={showInvite} onClose={() => setShowInvite(false)} title="Invite New Admin">
        <div className="space-y-4">
          <FormField label="Name"><Input value={inviteForm.name} onChange={(e) => setInviteForm({ ...inviteForm, name: e.target.value })} /></FormField>
          <FormField label="Email"><Input type="email" value={inviteForm.email} onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })} /></FormField>
          <FormField label="Password"><Input type="password" value={inviteForm.password} onChange={(e) => setInviteForm({ ...inviteForm, password: e.target.value })} placeholder="Min. 8 characters" /></FormField>
          <FormField label="Role">
            <select value={inviteForm.role} onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })} className="w-full bg-[#0c0c14] border border-zinc-800 rounded-lg px-4 py-2.5 text-sm text-zinc-200">
              <option value="viewer">Viewer — read-only</option>
              <option value="editor">Editor — content and bookings</option>
              <option value="admin">Admin — full access, including users</option>
            </select>
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowInvite(false)}>Cancel</Button>
            <Button onClick={invite}>Invite</Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog open={!!confirmRevoke} onClose={() => setConfirmRevoke(null)} onConfirm={revokeAdmin} title="Revoke Admin" message="Remove admin access for this user?" confirmLabel="Revoke" destructive />
      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  );
}
