'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { Button, Select } from './shared';

/**
 * Date range, page size and saved presets for an admin table.
 *
 * Sits alongside the search and status controls each screen already has rather
 * than replacing them: those work, and swapping in a second filtering mechanism
 * would leave two places to change when a filter is added.
 *
 * Filtering happens on the server, which is what makes it correct — filtering
 * an already-paginated page would only ever narrow the twenty rows on screen.
 */

export interface Preset {
  id: string;
  screen: string;
  name: string;
  filters: Record<string, string>;
}

export function FilterBar({
  screen,
  filters,
  onChange,
  pageSize,
  onPageSizeChange,
  onError,
}: {
  /** Which table these presets belong to. */
  screen: string;
  /** The current filter values, so a preset can be saved from them. */
  filters: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  pageSize: number;
  onPageSizeChange: (size: number) => void;
  onError: (message: string) => void;
}) {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');

  const load = useCallback(async () => {
    try {
      setPresets(await api<Preset[]>('/admin/filter-presets', { params: { screen } }));
    } catch {
      // Presets are a shortcut; the table works without them.
    }
  }, [screen]);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!name.trim()) { onError('Give the preset a name'); return; }
    try {
      await api('/admin/filter-presets', {
        method: 'POST',
        body: JSON.stringify({ screen, name: name.trim(), filters }),
      });
      setNaming(false);
      setName('');
      await load();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not save the preset');
    }
  };

  const remove = async (preset: Preset) => {
    try {
      await api(`/admin/filter-presets/${preset.id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not delete the preset');
    }
  };

  const set = (key: string, value: string) => onChange({ ...filters, [key]: value });

  const active = Object.entries(filters).filter(([, v]) => v).length;

  return (
    <div className="space-y-3 rounded-xl border border-zinc-800/50 bg-[#111119] p-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">From</span>
          <input
            type="date"
            value={filters.dateFrom ?? ''}
            // A range whose end precedes its start returns nothing and looks
            // broken, so each bound limits the other.
            max={filters.dateTo || undefined}
            onChange={(e) => set('dateFrom', e.target.value)}
            className="min-h-12 rounded-lg border border-zinc-800 bg-[#0c0c14] px-3 text-sm text-zinc-200 focus:border-emerald-500/50 focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">To</span>
          <input
            type="date"
            value={filters.dateTo ?? ''}
            min={filters.dateFrom || undefined}
            onChange={(e) => set('dateTo', e.target.value)}
            className="min-h-12 rounded-lg border border-zinc-800 bg-[#0c0c14] px-3 text-sm text-zinc-200 focus:border-emerald-500/50 focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Rows</span>
          <Select
            value={String(pageSize)}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            options={[
              { value: '10', label: '10 per page' },
              { value: '25', label: '25 per page' },
              { value: '50', label: '50 per page' },
              { value: '100', label: '100 per page' },
            ]}
          />
        </label>

        {presets.length > 0 && (
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Saved</span>
            <Select
              value=""
              onChange={(e) => {
                const preset = presets.find((p) => p.id === e.target.value);
                if (preset) onChange(preset.filters);
              }}
              options={[
                { value: '', label: 'Load a saved filter…' },
                ...presets.map((p) => ({ value: p.id, label: p.name })),
              ]}
            />
          </label>
        )}

        <div className="ml-auto flex gap-2">
          {active > 0 && (
            <>
              <Button size="sm" variant="secondary" onClick={() => setNaming((v) => !v)}>
                Save filter
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onChange({})}>
                Clear ({active})
              </Button>
            </>
          )}
        </div>
      </div>

      {naming && (
        <div className="flex flex-wrap items-center gap-2 border-t border-zinc-800/50 pt-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void save(); }}
            placeholder="e.g. Pending this week"
            maxLength={80}
            className="min-h-12 flex-1 rounded-lg border border-zinc-800 bg-[#0c0c14] px-3 text-sm text-zinc-200 focus:border-emerald-500/50 focus:outline-none"
          />
          <Button size="sm" onClick={() => void save()}>Save</Button>
          <Button size="sm" variant="secondary" onClick={() => setNaming(false)}>Cancel</Button>
        </div>
      )}

      {presets.length > 0 && (
        <div className="flex flex-wrap gap-1 border-t border-zinc-800/50 pt-3">
          {presets.map((preset) => (
            <span
              key={preset.id}
              className="inline-flex items-center gap-1 rounded-full border border-zinc-800 bg-zinc-800/40 py-0.5 pl-3 pr-1 text-xs text-zinc-300"
            >
              <button type="button" onClick={() => onChange(preset.filters)} className="hover:text-zinc-100">
                {preset.name}
              </button>
              <button
                type="button"
                onClick={() => void remove(preset)}
                aria-label={`Delete preset ${preset.name}`}
                className="flex h-6 w-6 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-700 hover:text-zinc-200"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
