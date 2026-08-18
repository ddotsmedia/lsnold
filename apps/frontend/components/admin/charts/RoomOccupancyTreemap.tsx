'use client';

import { useEffect, useState } from 'react';
import { EChart } from './EChart';
import { api } from '../../../lib/api';

/**
 * Each room as a rectangle, sized by capacity and coloured by how full it is.
 *
 * Only rooms with a recorded capacity are drawn. A room whose capacity nobody
 * has entered is not an empty room — it is an unknown one, and giving it a
 * rectangle would mean inventing the number that sizes it. Those rooms are
 * listed underneath instead, so the chart never quietly shows fewer rooms than
 * the nursery has.
 *
 * Occupancy counts approved registrations only. A pending application is not a
 * child in a room, and counting it would overstate how full the nursery is at
 * exactly the moment that matters.
 */

interface Room {
  id: string;
  name: string;
  slug: string;
  capacity: number;
  enrolled: number;
  pending: number;
  fill_percent: number;
  places_left: number;
}

interface Occupancy {
  rooms: Room[];
  without_capacity: Array<{ id: string; name: string; enrolled: number }>;
}

/** Green with room to spare, amber filling up, red at or over capacity. */
function colourFor(fill: number): string {
  if (fill >= 100) return '#ef4444';
  if (fill >= 85) return '#f59e0b';
  if (fill >= 60) return '#10b981';
  return '#3b82f6';
}

export function RoomOccupancyTreemap() {
  const [data, setData] = useState<Occupancy | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<Occupancy>('/admin/analytics/occupancy')
      .then((res) => { if (!cancelled) setData(res); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Failed'); });
    return () => { cancelled = true; };
  }, []);

  if (error) return <p className="p-6 text-sm text-red-400">{error}</p>;
  if (!data) return <div className="h-75 animate-pulse rounded-xl bg-panel-raised/40" />;

  const missing = data.without_capacity;

  return (
    <div className="space-y-3">
      <p className="text-xs text-panel-muted">
        Rooms sized by how many children they hold, coloured by how full they are.
        Counts approved registrations; pending applications are shown in the tooltip
        but do not fill a place.
      </p>

      {data.rooms.length === 0 ? (
        <div className="rounded-lg border border-panel-line bg-panel-sunken p-6 text-sm text-panel-muted">
          <p className="mb-2 font-medium text-panel-body">No room has a capacity recorded yet.</p>
          <p>
            Set one on each room under Age Groups → Records and this fills in. It is
            deliberately blank rather than guessed: a capacity is a fact about a real
            room, and an invented number here would be trusted.
          </p>
        </div>
      ) : (
        <EChart
          ariaLabel="Treemap of nursery rooms, sized by capacity and coloured by how full each is"
          height={340}
          option={{
            tooltip: {
              formatter: (params: unknown) => {
                const p = params as { data?: { room?: Room } };
                const room = p.data?.room;
                if (!room) return '';
                return `<strong>${room.name}</strong><br/>`
                  + `${room.enrolled} of ${room.capacity} places taken (${room.fill_percent}%)<br/>`
                  + `${room.places_left} free`
                  + (room.pending > 0 ? `<br/>${room.pending} application${room.pending === 1 ? '' : 's'} pending` : '');
              },
            },
            series: [{
              type: 'treemap',
              roam: false,
              breadcrumb: { show: false },
              // Sized by capacity, not by how many are enrolled: with nobody
              // enrolled every rectangle would otherwise collapse to nothing
              // and the chart would look broken rather than empty.
              data: data.rooms.map((room) => ({
                name: room.name,
                value: room.capacity,
                room,
                itemStyle: { color: colourFor(room.fill_percent) },
              })),
              label: {
                show: true,
                formatter: (params: unknown) => {
                  const p = params as { data?: { room?: Room } };
                  const room = p.data?.room;
                  return room ? `${room.name}\n${room.enrolled}/${room.capacity}` : '';
                },
                color: '#0a0a0f',
                fontWeight: 600,
              },
              itemStyle: { borderColor: '#0a0a0f', borderWidth: 3, borderRadius: 4 },
            }],
          }}
        />
      )}

      {missing.length > 0 && (
        <p className="text-xs text-panel-muted">
          Not shown, because no capacity is recorded:{' '}
          <span className="text-panel-body">{missing.map((r) => r.name).join(', ')}</span>.
        </p>
      )}
    </div>
  );
}
