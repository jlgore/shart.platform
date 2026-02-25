// Message protocol between main thread and the DuckDB worker
import type { IngestStage } from '../types/logs';

export type WorkerInMsg =
  | { type: 'ping' }
  | {
      type: 'ingestPack';
      url?: string; // same-origin API route to proxy tar.gz (fallback)
      expectedSha256?: string; // lowercase hex sha256 of entire tar.gz
      tarData?: ArrayBuffer; // when provided, worker will ingest from this buffer instead of fetching
    }
  | { type: 'runQuery'; id: string; sql: string }
  | { type: 'dispose' };

export type WorkerOutMsg =
  | { type: 'pong' }
  | { type: 'progress'; stage: IngestStage; percent?: number; loadedBytes?: number; totalBytes?: number; message?: string }
  | { type: 'error'; message: string }
  | { type: 'ready'; tables: { name: string; rows: number }[] }
  | { type: 'queryResult'; id: string; columns: { name: string; type: string }[]; rows: any[] };
