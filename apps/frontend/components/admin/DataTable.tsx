'use client';

import { useState } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
  sortable?: boolean;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  pagination?: {
    page: number;
    totalPages: number;
    total: number;
    limit: number;
  };
  onPageChange?: (page: number) => void;
  onSort?: (key: string, dir: 'asc' | 'desc') => void;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
  /**
   * Extra attributes for each <tr>, by row. Lets a caller make rows draggable
   * without every other table having to know about dragging.
   */
  rowProps?: (row: T, index: number) => HTMLAttributes<HTMLTableRowElement>;
  /**
   * Row selection. Supplying `selected` adds a checkbox column; leaving it out
   * leaves every other table exactly as it was.
   */
  selected?: Set<string>;
  onSelectedChange?: (next: Set<string>) => void;
  /** Reads the id from a row; defaults to `row.id`. */
  rowId?: (row: T) => string;
}

export function DataTable<T = Record<string, unknown>>({
  columns,
  data,
  loading,
  pagination,
  onPageChange,
  onSort,
  onRowClick,
  emptyMessage = 'No data found',
  rowProps,
  selected,
  onSelectedChange,
  rowId = (row) => String((row as { id?: unknown })?.id ?? ''),
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const selectable = Boolean(selected && onSelectedChange);
  const ids = data.map(rowId);
  // "All" means the rows on screen, not every row in the table — selecting
  // pages you have not looked at is not what ticking a visible box implies.
  const allShown = ids.length > 0 && ids.every((id) => selected?.has(id));

  const toggleAll = () => {
    const next = new Set(selected);
    if (allShown) ids.forEach((id) => next.delete(id));
    else ids.forEach((id) => next.add(id));
    onSelectedChange?.(next);
  };

  const toggleOne = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    onSelectedChange?.(next);
  };

  const handleSort = (key: string) => {
    const newDir = sortKey === key && sortDir === 'desc' ? 'asc' : 'desc';
    setSortKey(key);
    setSortDir(newDir);
    onSort?.(key, newDir);
  };

  return (
    <div className="bg-[#111119] rounded-xl border border-zinc-800/50 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800/50">
              {selectable && (
                <th className="w-12 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={allShown}
                    onChange={toggleAll}
                    aria-label={allShown ? 'Clear selection' : 'Select all rows on this page'}
                    className="h-4 w-4 accent-emerald-500"
                  />
                </th>
              )}
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider ${
                    col.sortable ? 'cursor-pointer hover:text-zinc-300 select-none' : ''
                  } ${col.className || ''}`}
                  onClick={col.sortable ? () => handleSort(col.key) : undefined}
                >
                  <span className="flex items-center gap-1">
                    {col.header}
                    {col.sortable && sortKey === col.key && (
                      <span className="text-emerald-400">{sortDir === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns.length + (selectable ? 1 : 0)} className="px-4 py-12 text-center">
                  <div className="flex justify-center">
                    <div className="w-6 h-6 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
                  </div>
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (selectable ? 1 : 0)} className="px-4 py-12 text-center text-zinc-500">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              data.map((row, i) => {
                const extra = rowProps?.(row, i) ?? {};
                return (
                <tr
                  key={String((row as any)?.id ?? i)}
                  {...extra}
                  className={`border-b border-zinc-800/30 transition-colors ${
                    onRowClick ? 'cursor-pointer hover:bg-zinc-800/30' : ''
                  } ${extra.className || ''}`}
                  onClick={onRowClick ? () => onRowClick(row) : extra.onClick}
                >
                  {selectable && (
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected?.has(rowId(row)) ?? false}
                        onChange={() => toggleOne(rowId(row))}
                        onClick={(e) => e.stopPropagation()}
                        aria-label="Select row"
                        className="h-4 w-4 accent-emerald-500"
                      />
                    </td>
                  )}
                  {columns.map((col) => (
                    <td key={col.key} className={`px-4 py-3 text-zinc-300 ${col.className || ''}`}>
                      {col.render ? col.render(row) : ((row as any)[col.key] as ReactNode) ?? '—'}
                    </td>
                  ))}
                </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-800/50">
          <p className="text-xs text-zinc-500">
            {pagination.total} total · Page {pagination.page} of {pagination.totalPages}
          </p>
          <div className="flex gap-1">
            <button
              onClick={() => onPageChange?.(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="px-3 py-1.5 text-xs rounded-md border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              ‹ Prev
            </button>
            <button
              onClick={() => onPageChange?.(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages}
              className="px-3 py-1.5 text-xs rounded-md border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Next ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
