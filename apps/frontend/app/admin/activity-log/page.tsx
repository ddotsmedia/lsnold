'use client';

import { useEffect, useState, useCallback } from 'react';
import { api } from '../../../lib/api';
import type { PaginatedResponse } from '../../../lib/api';
import { DataTable } from '../../../components/admin/DataTable';
import type { Column } from '../../../components/admin/DataTable';
import { StatusBadge, FilterSelect, Modal, SearchBar, Toast } from '../../../components/admin/shared';
import { ExportMenu } from '../../../components/admin/ExportMenu';
import { FilterBar } from '../../../components/admin/FilterBar';

type JsonRecord = Record<string, unknown>;

interface Activity {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details: JsonRecord | null;
  old_values: JsonRecord | null;
  new_values: JsonRecord | null;
  ip_address: string | null;
  user_agent: string | null;
  admin_name: string;
  admin_email: string;
  created_at: string;
}

/** Columns that change on every write and would bury the meaningful diff. */
const NOISY = new Set(['updated_at', 'created_at']);

function render(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** Fields that actually differ between before and after. */
function changedKeys(oldV: JsonRecord | null, newV: JsonRecord | null): string[] {
  const keys = new Set([...Object.keys(oldV ?? {}), ...Object.keys(newV ?? {})]);
  return [...keys]
    .filter((k) => !NOISY.has(k))
    .filter((k) => render(oldV?.[k]) !== render(newV?.[k]))
    .sort();
}

function DiffTable({ log }: { log: Activity }) {
  const keys = changedKeys(log.old_values, log.new_values);

  if (keys.length === 0) {
    return (
      <p className="text-sm text-panel-muted">
        No field-level values were recorded for this action.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-panel-line text-xs uppercase tracking-wide text-panel-muted">
            <th className="py-2 pr-4">Field</th>
            <th className="py-2 pr-4">Before</th>
            <th className="py-2">After</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-panel-line/60">
          {keys.map((k) => (
            <tr key={k} className="align-top">
              <td className="py-2 pr-4 font-medium text-panel-body">{k}</td>
              <td className="py-2 pr-4 text-red-300/80 break-all">{render(log.old_values?.[k])}</td>
              <td className="py-2 text-emerald-300/90 break-all">{render(log.new_values?.[k])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ActivityLogPage() {
  const [data, setData] = useState<Activity[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 30, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [entityType, setEntityType] = useState('');
  const [action, setAction] = useState('');
  const [selected, setSelected] = useState<Activity | null>(null);
  const [search, setSearch] = useState('');
  const [adminId, setAdminId] = useState('');
  const [admins, setAdmins] = useState<Array<{ id: string; name: string; email: string }>>([]);
  const [range, setRange] = useState<Record<string, string>>({});
  const [pageSize, setPageSize] = useState(30);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const fetchData = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const res = await api<PaginatedResponse<Activity>>('/admin/users/activity-log', {
        params: { page, limit: pageSize, entityType, action, adminId, search, ...range },
      });
      setData(res.data);
      setPagination(res.pagination);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [entityType, action, adminId, search, pageSize, range]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Only the accounts that can act, so the dropdown is not a list of every
  // person who ever registered.
  useEffect(() => {
    api<{ data: Array<{ id: string; name: string; email: string; role: string | null }> }>('/admin/users', { params: { limit: 100 } })
      .then((res) => setAdmins(res.data.filter((u) => u.role)))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); }
  }, [toast]);

  const columns: Column<Activity>[] = [
    { key: 'created_at', header: 'Time', render: (r) => (
      <span className="text-xs text-panel-body tabular-nums whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</span>
    )},
    { key: 'admin_name', header: 'User', render: (r) => (
      <div>
        <span className="text-sm text-panel-body">{r.admin_name || 'System'}</span>
        {r.admin_email && <span className="block text-[10px] text-panel-faint">{r.admin_email}</span>}
      </div>
    )},
    { key: 'action', header: 'Action', render: (r) => <StatusBadge status={r.action} /> },
    { key: 'entity_type', header: 'Entity', render: (r) => (
      <span className="text-sm text-panel-body">{r.entity_type}{r.entity_id ? ` #${r.entity_id.slice(0, 8)}` : ''}</span>
    )},
    { key: 'details', header: 'Changes', render: (r) => {
      const count = changedKeys(r.old_values, r.new_values).length;
      const hasAnything = count > 0 || r.details || r.ip_address;
      if (!hasAnything) return <span className="text-panel-faint">—</span>;
      return (
        <button
          type="button"
          onClick={() => setSelected(r)}
          className="min-h-11 text-xs font-semibold text-emerald-400 underline-offset-2 hover:underline"
        >
          {count > 0 ? `${count} field${count === 1 ? '' : 's'}` : 'View'}
        </button>
      );
    }},
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        <FilterSelect
          value={entityType}
          onChange={setEntityType}
          options={[
            { value: 'registration', label: 'Registration' },
            { value: 'tour_booking', label: 'Booking' },
            { value: 'gallery_image', label: 'Gallery' },
            { value: 'gallery_category', label: 'Category' },
            { value: 'news_event', label: 'Event' },
            { value: 'facility', label: 'Facility' },
            { value: 'page', label: 'Page' },
            { value: 'site_settings', label: 'Settings' },
            { value: 'user', label: 'User' },
          ]}
          allLabel="All Entities"
        />
        <FilterSelect
          value={action}
          onChange={setAction}
          options={[
            { value: 'create', label: 'Create' },
            { value: 'update', label: 'Update' },
            { value: 'delete', label: 'Delete' },
            { value: 'restore', label: 'Restore' },
            { value: 'status_change', label: 'Status Change' },
            { value: 'upload', label: 'Upload' },
            { value: 'invite', label: 'Invite' },
          ]}
          allLabel="All Actions"
        />
        <FilterSelect
          value={adminId}
          onChange={setAdminId}
          options={admins.map((a) => ({ value: a.id, label: a.name || a.email }))}
          allLabel="Anyone"
        />
        <div className="max-w-xs flex-1">
          <SearchBar value={search} onChange={setSearch} placeholder="Record id, type or person…" />
        </div>
        <div className="ml-auto">
          <ExportMenu
            path="/admin/users/activity-log/export"
            params={{ entityType, action, adminId, search, ...range }}
            title="Activity log"
            subtitle={[action, entityType].filter(Boolean).join(' · ') || 'All activity'}
            onError={(message) => setToast({ message, type: 'error' })}
          />
        </div>
      </div>

      <FilterBar
        screen="activity-log"
        filters={range}
        onChange={setRange}
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
        onError={(message) => setToast({ message, type: 'error' })}
      />

      <DataTable<Activity>
        columns={columns}
        data={data}
        loading={loading}
        pagination={pagination}
        onPageChange={(p) => fetchData(p)}
        emptyMessage="No activity logged yet"
      />

      {toast && <Toast message={toast.message} type={toast.type} />}

      <Modal
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected ? `${selected.action} · ${selected.entity_type}` : ''}
      >
        {selected && (
          <div className="space-y-5">
            <DiffTable log={selected} />

            {selected.details && Object.keys(selected.details).length > 0 && (
              <div>
                <h3 className="mb-1 text-xs uppercase tracking-wide text-panel-muted">Details</h3>
                <pre className="overflow-x-auto rounded bg-panel-surface p-3 text-xs text-panel-body">
                  {JSON.stringify(selected.details, null, 2)}
                </pre>
              </div>
            )}

            <dl className="grid grid-cols-1 gap-2 border-t border-panel-line pt-4 text-xs sm:grid-cols-2">
              <div>
                <dt className="text-panel-muted">When</dt>
                <dd className="text-panel-body">{new Date(selected.created_at).toLocaleString()}</dd>
              </div>
              <div>
                <dt className="text-panel-muted">By</dt>
                <dd className="text-panel-body">{selected.admin_name || 'System'}</dd>
              </div>
              <div>
                <dt className="text-panel-muted">IP address</dt>
                <dd className="text-panel-body">{selected.ip_address || '—'}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-panel-muted">User agent</dt>
                <dd className="break-all text-panel-body">{selected.user_agent || '—'}</dd>
              </div>
            </dl>
          </div>
        )}
      </Modal>
    </div>
  );
}
