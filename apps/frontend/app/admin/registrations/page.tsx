'use client';

import { useEffect, useState, useCallback } from 'react';
import { api } from '../../../lib/api';
import { useRealtimeEvent } from '../../../lib/realtime';
import type { PaginatedResponse } from '../../../lib/api';
import { DataTable } from '../../../components/admin/DataTable';
import type { Column } from '../../../components/admin/DataTable';
import { StatusBadge, SearchBar, FilterSelect, Button, ConfirmDialog, Toast } from '../../../components/admin/shared';

interface Registration {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  age_group_name: string;
  status: string;
  created_at: string;
}

export default function RegistrationsPage() {
  const [data, setData] = useState<Registration[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [confirm, setConfirm] = useState<{ id: string; action: string } | null>(null);

  const fetchData = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const res = await api<PaginatedResponse<Registration>>('/admin/registrations', {
        params: { page, limit: 20, search, status: statusFilter, sortBy, sortDir },
      });
      setData(res.data);
      setPagination(res.pagination);
    } catch { setToast({ message: 'Failed to load registrations', type: 'error' }); }
    finally { setLoading(false); }
  }, [search, statusFilter, sortBy, sortDir]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // A new registration arrives without a refresh. Only prepended when the
  // first page is showing and no search is active, so it cannot appear
  // above rows it does not belong with or fight a filter.
  const live = useRealtimeEvent<Registration>('registration:created', (incoming) => {
    setData((rows) => {
      if (pagination.page !== 1 || search) return rows;
      if (rows.some((row) => row.id === incoming.id)) return rows;
      return [incoming, ...rows];
    });
    setPagination((p) => ({ ...p, total: p.total + 1 }));
  });
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); } }, [toast]);

  const updateStatus = async (id: string, status: string) => {
    try {
      await api(`/admin/registrations/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
      setToast({ message: `Registration ${status}`, type: 'success' });
      fetchData(pagination.page);
    } catch { setToast({ message: 'Failed to update status', type: 'error' }); }
  };

  const deleteRegistration = async (id: string) => {
    try {
      await api(`/admin/registrations/${id}`, { method: 'DELETE' });
      setToast({ message: 'Registration deleted', type: 'success' });
      fetchData(pagination.page);
    } catch { setToast({ message: 'Failed to delete', type: 'error' }); }
  };

  const exportCSV = () => {
    const token = localStorage.getItem('lsn_token');
    const url = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1'}/admin/registrations/export?status=${statusFilter}`;
    window.open(url + `&token=${token}`, '_blank');
  };

  const columns: Column<Registration>[] = [
    { key: 'first_name', header: 'Name', sortable: true, render: (r) => <span className="font-medium">{r.first_name} {r.last_name}</span> },
    { key: 'email', header: 'Email', sortable: true },
    { key: 'phone', header: 'Phone' },
    { key: 'age_group_name', header: 'Age Group' },
    { key: 'status', header: 'Status', sortable: true, render: (r) => <StatusBadge status={r.status} /> },
    { key: 'created_at', header: 'Date', sortable: true, render: (r) => <span className="text-xs text-zinc-500">{new Date(r.created_at).toLocaleDateString()}</span> },
    {
      key: 'actions', header: '', className: 'w-[180px]',
      render: (r) => (
        <div className="flex gap-1">
          {r.status === 'pending' && (
            <>
              <Button size="sm" variant="primary" onClick={(e) => { e.stopPropagation(); updateStatus(r.id, 'approved'); }}>Approve</Button>
              <Button size="sm" variant="danger" onClick={(e) => { e.stopPropagation(); updateStatus(r.id, 'rejected'); }}>Reject</Button>
            </>
          )}
          <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setConfirm({ id: r.id, action: 'delete' }); }}>×</Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Says whether the list is updating by itself. Without it a quiet
          screen is ambiguous: nothing new, or a dropped connection. */}
      <p className="flex items-center gap-2 text-xs text-zinc-500">
        <span className={`inline-block h-2 w-2 rounded-full ${live ? 'bg-emerald-500' : 'bg-zinc-600'}`} aria-hidden="true" />
        {live ? 'Live — new entries appear here as they arrive' : 'Not live — reload to see new entries'}
      </p>
      <div className="flex flex-col sm:flex-row gap-3 justify-between">
        <div className="flex gap-3 flex-1">
          <div className="flex-1 max-w-xs">
            <SearchBar value={search} onChange={setSearch} placeholder="Search name or email..." />
          </div>
          <FilterSelect
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: 'pending', label: 'Pending' },
              { value: 'approved', label: 'Approved' },
              { value: 'rejected', label: 'Rejected' },
            ]}
            allLabel="All Status"
          />
        </div>
        <Button variant="secondary" onClick={exportCSV}>Export CSV</Button>
      </div>

      <DataTable
        columns={columns}
        data={data}
        loading={loading}
        pagination={pagination}
        onPageChange={(p) => fetchData(p)}
        onSort={(key, dir) => { setSortBy(key); setSortDir(dir); }}
        emptyMessage="No registrations found"
      />

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={() => { if (confirm) deleteRegistration(confirm.id); }}
        title="Delete Registration"
        message="Are you sure you want to delete this registration? This cannot be undone."
        confirmLabel="Delete"
        destructive
      />

      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  );
}
