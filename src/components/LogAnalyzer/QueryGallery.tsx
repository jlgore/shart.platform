import React from 'react';
import type { Query, QueryPack, QueryCategory } from '../../lib/types/logs';

export interface QueryGalleryProps {
  queryPacks: QueryPack[];
  packId?: string;
  filterCategory?: QueryCategory | 'all';
  onRun: (query: Query) => void;
}

export default function QueryGallery({ queryPacks, packId, filterCategory = 'all', onRun }: QueryGalleryProps) {
  const items = queryPacks
    .filter((p) => (packId ? p.packId === packId || p.packId === 'any' : true))
    .flatMap((p) => p.queries)
    .filter((q) => (filterCategory === 'all' ? true : q.category === filterCategory));

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {items.map((q) => (
        <button
          key={q.id}
          onClick={() => onRun(q)}
          className="text-left rounded border border-green-600/30 hover:border-green-400/60 p-3 bg-black/40"
          title={q.description}
        >
          <div className="text-sm font-semibold">{q.title}</div>
          {q.category && <div className="text-xs text-green-300/60">{q.category}</div>}
          {q.tags && q.tags.length > 0 && (
            <div className="mt-1 text-[10px] text-green-300/60">{q.tags.map((t) => `#${t}`).join(' ')}</div>
          )}
        </button>
      ))}
      {items.length === 0 && <p className="text-sm text-green-300/60">No queries available.</p>}
    </div>
  );
}

