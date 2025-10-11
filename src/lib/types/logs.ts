// Types and enums for log packs, queries, and component contracts

export type LogSource =
  | 'vpc_flow'
  | 'cloudtrail'
  | 'alb'
  | 'guardduty'
  | 'cloudwatch'
  | 'azure_activity'
  | 'gcp_audit';

export type QueryCategory =
  | 'overview'
  | 'network'
  | 'iam'
  | 'errors'
  | 'anomalies'
  | 'forensics';

export interface ManifestFileEntry {
  path: string; // path inside tar, e.g., logs/vpc/2024-09-01.csv
  format: 'csv' | 'json' | 'parquet' | 'gz-json';
  source: LogSource;
  schemaHint?: string; // optional name used by site-side ingesters
  timezone?: string; // IANA tz like 'UTC' or 'America/Los_Angeles'
}

export interface LogPackManifest {
  version: '1.0';
  packId: string; // stable id, kebab-case
  title: string;
  description: string;
  createdAt: string; // ISO8601
  sizeBytes: number; // compressed size of tar.gz
  files: ManifestFileEntry[];
  // Optional embedded queries for offline use
  queries?: Query[];
}

export interface QueryColumn {
  name: string;
  type:
    | 'string'
    | 'number'
    | 'integer'
    | 'boolean'
    | 'timestamp'
    | 'ip'
    | 'json'
    | 'unknown';
}

export interface QueryOutputShape {
  columns: QueryColumn[];
}

export interface Query {
  id: string; // stable id, kebab-case
  title: string;
  description?: string;
  sql: string;
  tags?: string[];
  category?: QueryCategory;
  output?: QueryOutputShape;
}

export interface QueryPack {
  id: string; // stable id, kebab-case
  packId: string; // which log pack this applies to (or 'any')
  title: string;
  category: QueryCategory;
  queries: Query[];
}

export type IngestStage = 'download' | 'verify' | 'extract' | 'ingest' | 'ready';

export interface IngestProgress {
  stage: IngestStage;
  loadedBytes?: number;
  totalBytes?: number;
  percent?: number; // 0..100 when determinable
  message?: string;
}

export interface TableSummary {
  name: string;
  rowCount: number;
  source: LogSource;
}

export interface LoadSummary {
  pack: LogPackManifest;
  tables: TableSummary[];
}

export interface QueryResultRow {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export interface QueryResult {
  columns: QueryColumn[];
  rows: QueryResultRow[];
}

export interface AnalyzerHandle {
  runQuery: (sql: string, signal?: AbortSignal) => Promise<QueryResult>;
  cancel: () => void;
  exportCsv: (sql: string) => Promise<Blob>;
  getTables: () => Promise<TableSummary[]>;
}

