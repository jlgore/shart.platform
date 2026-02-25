// Thin client contract for duckdb-wasm integration (implementation stub for planning)
import type { QueryResult } from '../types/logs';

export interface DuckDBClientOptions {
  persistent?: boolean; // use OPFS when available
}

export interface DuckDBClient {
  init: () => Promise<void>;
  registerFile: (path: string, data: ArrayBuffer) => Promise<void>;
  sql: (sql: string, signal?: AbortSignal) => Promise<QueryResult>;
  dispose: () => Promise<void>;
}

export function createDuckDBClient(_opts: DuckDBClientOptions = {}): DuckDBClient {
  return {
    async init() {
      // Implementation will lazy-load duckdb-wasm and spin up a worker
    },
    async registerFile(_path: string, _data: ArrayBuffer) {
      // Implementation will register file with duckdb FS
    },
    async sql(_sql: string, _signal?: AbortSignal) {
      // Implementation will execute query and map to QueryResult
      return { columns: [], rows: [] };
    },
    async dispose() {
      // Tear down worker/connection
    },
  };
}

