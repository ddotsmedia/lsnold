'use client';

import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { exportReportToPDF, type Report } from '../../lib/export';
import { Button, Select, Toast } from './shared';

/**
 * Downloads the dashboard's figures as a PDF.
 *
 * The report is fetched in one request rather than reusing what the widgets
 * already hold: those load independently and a report assembled from them
 * could mix figures gathered minutes apart.
 */
export function AnalyticsReportButton() {
  const [days, setDays] = useState('30');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); }
  }, [toast]);

  const run = async () => {
    setBusy(true);
    try {
      const report = await api<Report>('/admin/analytics/report', { params: { days } });
      await exportReportToPDF(report, 'Little Smarties — analytics report');
      setToast({ message: 'Report downloaded', type: 'success' });
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'Could not build the report',
        type: 'error',
      });
    } finally { setBusy(false); }
  };

  return (
    <div className="flex items-end gap-2">
      <Select
        value={days}
        onChange={(e) => setDays(e.target.value)}
        options={[
          { value: '7', label: 'Last 7 days' },
          { value: '30', label: 'Last 30 days' },
          { value: '90', label: 'Last 90 days' },
          { value: '365', label: 'Last year' },
        ]}
      />
      <Button variant="secondary" onClick={() => void run()} disabled={busy}>
        {busy ? 'Preparing…' : 'Export report'}
      </Button>
      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  );
}
