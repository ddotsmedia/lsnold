'use client';

import { useState } from 'react';
import { api } from '../../lib/api';
import { Button, ConfirmDialog } from './shared';

/**
 * Acting on several selected rows at once.
 *
 * Only appears once something is selected, so it never sits empty above a
 * table. Every action confirms first: these change or remove somebody's
 * enquiry, and the count is what makes the confirmation meaningful — "reject 14
 * registrations" is a very different sentence from "reject 1".
 */

export interface BulkAction {
  key: string;
  label: string;
  /** Path under the table's base, e.g. bulk/approve */
  path: string;
  /** Reads back in the confirmation: "Approve 5 registrations?" */
  verb: string;
  destructive?: boolean;
}

export function BulkActionsBar({
  basePath,
  actions,
  selected,
  noun,
  onDone,
  onClear,
  onError,
}: {
  /** e.g. /admin/registrations */
  basePath: string;
  actions: BulkAction[];
  selected: Set<string>;
  /** Singular noun, e.g. 'registration'. */
  noun: string;
  onDone: (message: string) => void;
  onClear: () => void;
  onError: (message: string) => void;
}) {
  const [pending, setPending] = useState<BulkAction | null>(null);
  const [busy, setBusy] = useState(false);

  if (selected.size === 0) return null;

  const count = selected.size;
  const plural = `${count} ${noun}${count === 1 ? '' : 's'}`;

  const run = async (action: BulkAction) => {
    setBusy(true);
    try {
      const res = await api<{ updated?: number; deleted?: number; requested: number }>(
        `${basePath}/${action.path}`,
        { method: 'POST', body: JSON.stringify({ ids: [...selected] }) }
      );
      const changed = res.updated ?? res.deleted ?? 0;

      // The server reports what it actually touched. Saying so when it differs
      // beats a cheerful message about rows that did not move.
      onDone(
        changed === res.requested
          ? `${changed} ${noun}${changed === 1 ? '' : 's'} ${action.verb}`
          : `${changed} of ${res.requested} ${noun}s ${action.verb} — the rest were already gone`
      );
      onClear();
    } catch (err) {
      onError(err instanceof Error ? err.message : `Could not ${action.label.toLowerCase()}`);
    } finally {
      setBusy(false);
      setPending(null);
    }
  };

  return (
    <>
      <div className="flex flex-col gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 sm:flex-row sm:items-center">
        <p className="text-sm text-zinc-200">{plural} selected</p>
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          {actions.map((action) => (
            <Button
              key={action.key}
              size="sm"
              variant={action.destructive ? 'danger' : 'secondary'}
              disabled={busy}
              onClick={() => setPending(action)}
            >
              {action.label}
            </Button>
          ))}
          <Button size="sm" variant="ghost" disabled={busy} onClick={onClear}>Clear</Button>
        </div>
      </div>

      <ConfirmDialog
        open={pending !== null}
        onClose={() => setPending(null)}
        onConfirm={() => { if (pending) void run(pending); }}
        title={pending ? `${pending.label}` : ''}
        message={
          pending
            ? `${pending.label} ${plural}?`
              + (pending.destructive
                // Soft delete, so this is recoverable — saying "cannot be
                // undone" when it can would be untrue.
                ? ' They will be hidden from the list and can be restored by an administrator.'
                : '')
            : ''
        }
        confirmLabel={pending?.label ?? 'Confirm'}
        destructive={pending?.destructive}
      />
    </>
  );
}
