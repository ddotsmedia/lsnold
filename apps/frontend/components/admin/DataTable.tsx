'use client';

import { useState } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';

export interface SortTerm {
  key: string;
  dir: 'asc' | 'desc';
}

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
  /** Single-column callback, kept for tables that have not moved over. */
  onSort?: (key: string, dir: 'asc' | 'desc') => void;
  /** Every sort level, in priority order. */
  onSortChange?: (sort: SortTerm[]) => void;
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
  onSortChange,
  onRowClick,
  emptyMessage = 'No data found',
  rowProps,
  selected,
  onSelectedChange,
  rowId = (row) => String((row as { id?: unknown })?.id ?? ''),
}: DataTableProps<T>) {
  const [sort, setSort] = useState<SortTerm[]>([]);

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

  /**
   * Click sorts by one column; shift-click adds a column to the existing sort.
   *
   * Clicking a column already in a multi-sort cycles its own direction and
   * leaves the rest alone, so a reader can flip one level without rebuilding
   * the whole order. Plain clicking anything collapses back to one column,
   * which is the way out of a sort that has grown confusing.
   */
  const handleSort = (key: string, additive: boolean) => {
    setSort((current) => {
      const existing = current.find((t) => t.key === key);
      const flipped: SortTerm = {
        key,
        dir: existing?.dir === 'desc' ? 'asc' : 'desc',
      };

      const next = additive
        ? existing
          ? current.map((t) => (t.key === key ? flipped : t))
          // Four levels is past the point where another tiebreaker changes
          // anything a reader would notice.
          : [...current, flipped].slice(-4)
        : [flipped];

      onSortChange?.(next);
      // Kept so tables still using the single-column callback keep working.
      onSort?.(key, flipped.dir);
      return next;
    });
  };

  return (
    <div className="bg-panel-surface rounded-xl border border-panel-line/50 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-panel-line/50">
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
                  className={`px-4 py-3 text-left text-xs font-medium text-panel-muted uppercase tracking-wider ${
                    col.sortable ? 'cursor-pointer hover:text-panel-body select-none' : ''
                  } ${col.className || ''}`}
                  onClick={col.sortable ? (e) => handleSort(col.key, e.shiftKey) : undefined}
                  title={col.sortable ? 'Click to sort. Shift-click to add a level.' : undefined}
                >
                  <span className="flex items-center gap-1">
                    {col.header}
                    {col.sortable && (() => {
                      const at = sort.findIndex((t) => t.key === col.key);
                      if (at === -1) return null;
                      return (
                        <span className="flex items-center gap-0.5 text-emerald-400">
                          {sort[at]!.dir === 'asc' ? '↑' : '↓'}
                          {/* Rank only when more than one column is sorted. */}
                          {sort.length > 1 && (
                            <span className="text-[10px] text-panel-muted">{at + 1}</span>
                          )}
                        </span>
                      );
                    })()}
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
                <td colSpan={columns.length + (selectable ? 1 : 0)} className="px-4 py-12 text-center text-panel-muted">
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
                  className={`border-b border-panel-line/30 transition-colors ${
                    onRowClick ? 'cursor-pointer hover:bg-panel-raised/30' : ''
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
                    <td key={col.key} className={`px-4 py-3 text-panel-body ${col.className || ''}`}>
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
        <div className="flex items-center justify-between px-4 py-3 border-t border-panel-line/50">
          <p className="text-xs text-panel-muted">
            {pagination.total} total · Page {pagination.page} of {pagination.totalPages}
          </p>
          <div className="flex gap-1">
            <button
              onClick={() => onPageChange?.(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="px-3 py-1.5 text-xs rounded-md border border-panel-line text-panel-body hover:text-panel-strong hover:border-panel-line-2 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              ‹ Prev
            </button>
            <button
              onClick={() => onPageChange?.(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages}
              className="px-3 py-1.5 text-xs rounded-md border border-panel-line text-panel-body hover:text-panel-strong hover:border-panel-line-2 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Next ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
