import React from 'react';
import type { QueryColumn, QueryResultRow } from '../../lib/types/logs';

export interface LogViewerProps {
  columns: QueryColumn[];
  rows: QueryResultRow[];
  loading?: boolean;
  error?: string | null;
}

export default function LogViewer({ columns, rows, loading, error }: LogViewerProps) {
  if (loading) return <p className="text-sm text-green-300/70">Loading…</p>;
  if (error) return <p className="text-sm text-red-400">{error}</p>;
  if (!rows || rows.length === 0) return <p className="text-sm text-green-300/60">No results.</p>;

  return (
    <div className="w-full overflow-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.name} className="text-left border-b border-green-600/30 px-2 py-1 font-medium">
                {c.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="odd:bg-white/0 even:bg-white/5">
              {columns.map((c) => (
                <td key={c.name} className="px-2 py-1 align-top">
                  {String(r[c.name])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

