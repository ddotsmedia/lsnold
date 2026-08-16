'use client';

import { useEffect, useState, useCallback } from 'react';
import { api } from '../../../lib/api';
import { useRealtimeEvent } from '../../../lib/realtime';
import { ExportMenu } from '../../../components/admin/ExportMenu';
import type { PaginatedResponse } from '../../../lib/api';
import { DataTable } from '../../../components/admin/DataTable';
import type { Column } from '../../../components/admin/DataTable';
import { StatusBadge, SearchBar, FilterSelect, Button, ConfirmDialog, Toast } from '../../../components/admin/shared';

interface Booking {
  id: string;
  visitor_name: string;
  email: string;
  phone: string;
  preferred_date: string;
  time_slot: string;
  status: string;
  created_at: string;
}

export default function BookingsPage() {
  const [data, setData] = useState<Booking[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [confirm, setConfirm] = useState<{ id: string } | null>(null);

  const fetchData = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const res = await api<PaginatedResponse<Booking>>('/admin/tour-bookings', {
        params: { page, limit: 20, search, status: statusFilter },
      });
      setData(res.data);
      setPagination(res.pagination);
    } catch { setToast({ message: 'Failed to load bookings', type: 'error' }); }
    finally { setLoading(false); }
  }, [search, statusFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // A new tour booking arrives without a refresh. Only prepended when the
  // first page is showing and no search is active, so it cannot appear
  // above rows it does not belong with or fight a filter.
  const live = useRealtimeEvent<Booking>('booking:created', (incoming) => {
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
      await api(`/admin/tour-bookings/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
      setToast({ message: `Booking ${status}`, type: 'success' });
      fetchData(pagination.page);
    } catch { setToast({ message: 'Failed to update status', type: 'error' }); }
  };

  const deleteBooking = async (id: string) => {
    try {
      await api(`/admin/tour-bookings/${id}`, { method: 'DELETE' });
      setToast({ message: 'Booking deleted', type: 'success' });
      fetchData(pagination.page);
    } catch { setToast({ message: 'Failed to delete', type: 'error' }); }
  };

  const columns: Column<Booking>[] = [
    { key: 'visitor_name', header: 'Visitor', sortable: true, render: (r) => <span className="font-medium">{r.visitor_name}</span> },
    { key: 'email', header: 'Email', sortable: true },
    { key: 'phone', header: 'Phone' },
    { key: 'preferred_date', header: 'Date', sortable: true, render: (r) => <span>{new Date(r.preferred_date).toLocaleDateString()}</span> },
    { key: 'time_slot', header: 'Time' },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
    {
      key: 'actions', header: '', className: 'w-[180px]',
      render: (r) => (
        <div className="flex gap-1">
          {r.status === 'pending' && (
            <>
              <Button size="sm" variant="primary" onClick={(e) => { e.stopPropagation(); updateStatus(r.id, 'confirmed'); }}>Confirm</Button>
              <Button size="sm" variant="danger" onClick={(e) => { e.stopPropagation(); updateStatus(r.id, 'cancelled'); }}>Cancel</Button>
            </>
          )}
          <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setConfirm({ id: r.id }); }}>×</Button>
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
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
        <div className="flex flex-1 gap-3">
          <div className="max-w-xs flex-1">
            <SearchBar value={search} onChange={setSearch} placeholder="Search visitor or email..." />
          </div>
          <FilterSelect
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: 'pending', label: 'Pending' },
              { value: 'confirmed', label: 'Confirmed' },
              { value: 'cancelled', label: 'Cancelled' },
            ]}
            allLabel="All Status"
          />
        </div>
        <ExportMenu
          path="/admin/tour-bookings/export"
          params={{ status: statusFilter }}
          title="Tour bookings"
          subtitle={statusFilter ? `Status: ${statusFilter}` : 'All statuses'}
          onError={(message) => setToast({ message, type: 'error' })}
        />
      </div>

      <DataTable
        columns={columns}
        data={data}
        loading={loading}
        pagination={pagination}
        onPageChange={(p) => fetchData(p)}
        emptyMessage="No bookings found"
      />

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={() => { if (confirm) deleteBooking(confirm.id); }}
        title="Delete Booking"
        message="Are you sure you want to delete this booking?"
        confirmLabel="Delete"
        destructive
      />

      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  );
}
