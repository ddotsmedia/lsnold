'use client';

import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { Button, FormField, Input, Textarea, Toast } from '../../../components/admin/shared';

interface SettingsMap {
  [key: string]: { value: Record<string, unknown>; updated_at: string };
}

export default function SeoSettingsPage() {
  const [settings, setSettings] = useState<SettingsMap>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [activeTab, setActiveTab] = useState<'seo' | 'analytics' | 'robots' | 'sitemap'>('seo');

  useEffect(() => {
    api<SettingsMap>('/admin/seo/settings')
      .then(setSettings)
      .catch(() => setToast({ message: 'Failed to load settings', type: 'error' }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); } }, [toast]);

  const getVal = (key: string, field: string): string => {
    return String((settings[key]?.value as Record<string, unknown>)?.[field] ?? '');
  };

  const setVal = (key: string, field: string, value: string) => {
    setSettings((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        value: { ...(prev[key]?.value || {}), [field]: value },
        updated_at: prev[key]?.updated_at || '',
      },
    }));
  };

  const save = async (key: string) => {
    setSaving(true);
    try {
      await api('/admin/seo/settings', { method: 'PUT', body: JSON.stringify({ key, value: settings[key]?.value || {} }) });
      setToast({ message: 'Settings saved', type: 'success' });
    } catch { setToast({ message: 'Failed to save', type: 'error' }); }
    finally { setSaving(false); }
  };

  if (loading) {
    return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" /></div>;
  }

  const tabs = [
    { key: 'seo' as const, label: 'SEO Defaults' },
    { key: 'analytics' as const, label: 'Analytics' },
    { key: 'robots' as const, label: 'Robots.txt' },
    { key: 'sitemap' as const, label: 'Sitemap' },
  ];

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-1 border-b border-panel-line/50 pb-px">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === tab.key
                ? 'bg-panel-surface text-emerald-400 border border-panel-line/50 border-b-transparent -mb-px'
                : 'text-panel-muted hover:text-panel-body'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* SEO Defaults */}
      {activeTab === 'seo' && (
        <div className="bg-panel-surface rounded-xl border border-panel-line/50 p-6 space-y-5">
          <p className="text-xs text-panel-muted uppercase tracking-wider">Default meta tags for pages without custom SEO</p>
          <FormField label="Default Meta Title">
            <Input value={getVal('seo_defaults', 'meta_title')} onChange={(e) => setVal('seo_defaults', 'meta_title', e.target.value)} />
          </FormField>
          <FormField label="Default Meta Description">
            <Textarea value={getVal('seo_defaults', 'meta_description')} onChange={(e) => setVal('seo_defaults', 'meta_description', e.target.value)} rows={3} />
          </FormField>
          <FormField label="Default Meta Keywords">
            <Input value={getVal('seo_defaults', 'meta_keywords')} onChange={(e) => setVal('seo_defaults', 'meta_keywords', e.target.value)} placeholder="comma, separated, keywords" />
          </FormField>
          <div className="flex justify-end"><Button onClick={() => save('seo_defaults')} disabled={saving}>Save SEO Defaults</Button></div>
        </div>
      )}

      {/* Analytics */}
      {activeTab === 'analytics' && (
        <div className="bg-panel-surface rounded-xl border border-panel-line/50 p-6 space-y-5">
          <p className="text-xs text-panel-muted uppercase tracking-wider">Tracking code configuration</p>
          <FormField label="Google Analytics Tracking ID">
            <Input value={getVal('analytics', 'ga_tracking_id')} onChange={(e) => setVal('analytics', 'ga_tracking_id', e.target.value)} placeholder="G-XXXXXXXXXX" />
          </FormField>
          <FormField label="Google Tag Manager ID">
            <Input value={getVal('analytics', 'gtm_id')} onChange={(e) => setVal('analytics', 'gtm_id', e.target.value)} placeholder="GTM-XXXXXXX" />
          </FormField>
          <FormField label="Server-Side Analytics">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={getVal('analytics', 'enable_server_analytics') === 'true'}
                onChange={(e) => setVal('analytics', 'enable_server_analytics', String(e.target.checked))}
                className="w-4 h-4 rounded bg-panel-raised border-panel-line-2"
              />
              <span className="text-sm text-panel-body">Enable built-in page view tracking</span>
            </div>
          </FormField>
          <div className="flex justify-end"><Button onClick={() => save('analytics')} disabled={saving}>Save Analytics</Button></div>
        </div>
      )}

      {/* Robots.txt */}
      {activeTab === 'robots' && (
        <div className="bg-panel-surface rounded-xl border border-panel-line/50 p-6 space-y-5">
          <p className="text-xs text-panel-muted uppercase tracking-wider">Custom robots.txt content</p>
          <FormField label="Robots.txt Content">
            <Textarea
              value={getVal('robots_txt', 'content')}
              onChange={(e) => setVal('robots_txt', 'content', e.target.value)}
              rows={8}
              className="font-mono text-xs"
            />
          </FormField>
          <div className="flex justify-end"><Button onClick={() => save('robots_txt')} disabled={saving}>Save Robots.txt</Button></div>
        </div>
      )}

      {/* Sitemap */}
      {activeTab === 'sitemap' && (
        <div className="bg-panel-surface rounded-xl border border-panel-line/50 p-6 space-y-5">
          <p className="text-xs text-panel-muted uppercase tracking-wider">Sitemap generation settings</p>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Change Frequency">
              <select value={getVal('sitemap', 'change_frequency')} onChange={(e) => setVal('sitemap', 'change_frequency', e.target.value)} className="w-full bg-panel-sunken border border-panel-line rounded-lg px-4 py-2.5 text-sm text-panel-strong">
                <option value="always">Always</option><option value="hourly">Hourly</option><option value="daily">Daily</option>
                <option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option>
              </select>
            </FormField>
            <FormField label="Homepage Priority">
              <Input type="number" step="0.1" min="0" max="1" value={getVal('sitemap', 'priority_home')} onChange={(e) => setVal('sitemap', 'priority_home', e.target.value)} />
            </FormField>
          </div>
          <FormField label="Pages Priority">
            <Input type="number" step="0.1" min="0" max="1" value={getVal('sitemap', 'priority_pages')} onChange={(e) => setVal('sitemap', 'priority_pages', e.target.value)} />
          </FormField>
          <div className="flex justify-end"><Button onClick={() => save('sitemap')} disabled={saving}>Save Sitemap Settings</Button></div>
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  );
}
