import React, { useEffect, useMemo, useRef, useState } from 'react';
import type {
  AnalyzerHandle,
  IngestProgress,
  LoadSummary,
  LogPackManifest,
  Query,
  QueryPack,
  QueryResult,
} from '../../lib/types/logs';
import type { WorkerOutMsg, WorkerInMsg } from '../../lib/duckdb/protocol';
import Editor from '@monaco-editor/react';

export interface LogAnalyzerProps {
  packId: string;
  packUrl?: string;
  queryPacks: QueryPack[];
  editor?: 'monaco' | 'codemirror' | 'textarea';
  onIngestProgress?: (p: IngestProgress) => void;
  onLoaded?: (s: LoadSummary) => void;
  onReady?: (h: AnalyzerHandle) => void;
}

const placeholderManifest = (packId: string): LogPackManifest => ({
  version: '1.0',
  packId,
  title: 'Loading…',
  description: 'Pack loading placeholder',
  createdAt: new Date().toISOString(),
  sizeBytes: 0,
  files: [],
});

export default function LogAnalyzer({
  packId,
  packUrl,
  queryPacks,
  editor = 'monaco',
  onIngestProgress,
  onLoaded,
  onReady,
}: LogAnalyzerProps) {
  const [manifest, setManifest] = useState<LogPackManifest>(placeholderManifest(packId));
  const [sql, setSql] = useState<string>('SELECT 1 AS ok;');
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [ingestStatus, setIngestStatus] = useState<IngestProgress | null>(null);
  const [dbReady, setDbReady] = useState<boolean>(false);

  const handleRef = useRef<AnalyzerHandle | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const pendingRef = useRef<Map<string, (msg: WorkerOutMsg) => void>>(new Map());
  const idSeq = useRef(0);

  // Create AnalyzerHandle backed by the worker
  useEffect(() => {
    const h: AnalyzerHandle = {
      async runQuery(q: string) {
        const id = `q_${Date.now()}_${idSeq.current++}`;
        const p = new Promise<QueryResult>((resolve, reject) => {
          const timeout = setTimeout(() => {
            pendingRef.current.delete(id);
            reject(new Error('Query timed out'));
          }, 30000);
          pendingRef.current.set(id, (msg: WorkerOutMsg) => {
            clearTimeout(timeout);
            if (msg.type === 'queryResult' && msg.id === id) {
              const columns = msg.columns.map((c) => ({ name: c.name, type: (c.type as any) ?? 'unknown' }));
              const rows = msg.rows as any[];
              resolve({ columns, rows });
            }
          });
        });
        const w = workerRef.current;
        if (!w) throw new Error('Worker not ready');
        const m: WorkerInMsg = { type: 'runQuery', id, sql: q };
        w.postMessage(m);
        return p;
      },
      cancel() {
        // Future: post a cancellation signal via AbortController & worker support
      },
      async exportCsv(q: string) {
        const res = await this.runQuery(q);
        const cols = res.columns.map((c) => c.name);
        const lines = [cols.join(',')];
        for (const row of res.rows) {
          const values = cols.map((c) => {
            const v = row[c];
            if (v == null) return '';
            const s = String(v);
            return s.includes(',') || s.includes('"') || s.includes('\n') ? '"' + s.replace(/"/g, '""') + '"' : s;
          });
          lines.push(values.join(','));
        }
        return new Blob([lines.join('\n')], { type: 'text/csv' });
      },
      async getTables() {
        try {
          const res = await this.runQuery("SELECT table_name FROM duckdb_tables() WHERE database_name = 'memory';");
          return res.rows.map((r) => ({ name: r.table_name as string, rowCount: 0, source: 'vpc_flow' as any }));
        } catch {
          return [];
        }
      },
    };
    handleRef.current = h;
    onReady?.(h);
  }, [onReady]);

  // Load pack metadata and start Worker ingest
  useEffect(() => {
    let disposed = false;
    setDbReady(false);
    (async () => {
      try {
        // fetch metadata
        const metaRes = await fetch(`/api/log-packs/${encodeURIComponent(packId)}/meta`);
        if (!metaRes.ok) throw new Error(`Failed to load pack metadata (${metaRes.status})`);
        const meta = await metaRes.json();
        const m: LogPackManifest = {
          version: '1.0',
          packId: meta.packId,
          title: meta.title,
          description: meta.description,
          createdAt: new Date().toISOString(),
          sizeBytes: meta.sizeBytes,
          files: [],
        };
        setManifest(m);

        // start worker
        const w = new Worker(new URL('../../lib/duckdb/duckdb.worker.ts', import.meta.url), {
          type: 'module',
        });
        workerRef.current = w;
        w.onmessage = (e: MessageEvent<WorkerOutMsg>) => {
          if (disposed) return;
          const msg = e.data;
          if (msg.type === 'progress') {
            const p: IngestProgress = {
              stage: msg.stage,
              percent: msg.percent,
              loadedBytes: msg.loadedBytes,
              totalBytes: msg.totalBytes,
              message: msg.message,
            };
            setIngestStatus(p);
            onIngestProgress?.(p);
          } else if (msg.type === 'error') {
            setError(msg.message);
          } else if (msg.type === 'ready') {
            onLoaded?.({ pack: m, tables: msg.tables.map((t) => ({ name: t.name, rowCount: t.rows, source: 'vpc_flow' as any })) });
            setDbReady(true);
          } else if (msg.type === 'queryResult') {
            const handler = pendingRef.current.get(msg.id);
            if (handler) {
              handler(msg);
              pendingRef.current.delete(msg.id);
            }
          }
        };
        const apiUrl = `/api/log-packs/${encodeURIComponent(packId)}/download`;
        // Fetch tar.gz on main thread (same origin) to avoid cross-origin worker fetch issues
        setIngestStatus({ stage: 'download', percent: 0, message: 'Downloading pack' });
        const res2 = await fetch(apiUrl);
        if (!res2.ok) throw new Error(`Failed to download pack (${res2.status})`);
        const buf = await res2.arrayBuffer();
        setIngestStatus({ stage: 'download', percent: 100, message: 'Download complete' });
        const inMsg: WorkerInMsg = { type: 'ingestPack', expectedSha256: meta.sha256, tarData: buf };
        w.postMessage(inMsg, [buf as unknown as ArrayBuffer]);
      } catch (e) {
        const msg = (e as Error).message;
        setError(msg);
      }
    })();
    return () => {
      disposed = true;
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, [packId, packUrl, onIngestProgress, onLoaded]);

  const packsForThis = useMemo(() => queryPacks.filter((p) => p.packId === packId || p.packId === 'any'), [queryPacks, packId]);

  async function runCurrent() {
    if (!handleRef.current) return;
    setLoading(true);
    setError(null);
    try {
      const r = await handleRef.current.runQuery(sql);
      setResult(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function runPreset(q: Query) {
    setSql(q.sql);
    await runCurrent();
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{manifest.title}</h1>
          <p className="text-sm text-green-300/70">{manifest.description}</p>
        </div>
        <div className="text-xs text-green-300/60">packId: {manifest.packId}</div>
      </header>

      <section className="rounded-md border border-green-600/30 bg-black/30 p-4">
        {ingestStatus && (
          <div className="mb-4 text-xs text-green-300/70">
            Stage: {ingestStatus.stage}
            {typeof ingestStatus.percent === 'number' && <> — {ingestStatus.percent}%</>}
            {ingestStatus.message && <> — {ingestStatus.message}</>}
          </div>
        )}
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium">SQL</span>
          <button
            onClick={runCurrent}
            disabled={!dbReady}
            className={`px-3 py-1 rounded text-black font-semibold ${dbReady ? 'bg-green-700 hover:bg-green-600' : 'bg-green-900/50 cursor-not-allowed'}`}
            title={dbReady ? 'Run query' : 'Loading dataset…'}
          >
            Run
          </button>
        </div>
        {editor === 'textarea' && (
          <textarea
            className="w-full h-40 bg-black text-green-200 border border-green-600/30 rounded p-2 font-mono text-sm"
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            spellCheck={false}
          />
        )}
        {editor === 'monaco' && (
          <div className="w-full h-[26rem]">
            <Editor
              height="26rem"
              defaultLanguage="sql"
              value={sql}
              onChange={(v) => setSql(v ?? '')}
              options={{
                theme: 'shart-dark',
                minimap: { enabled: false },
                fontFamily: 'JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                fontSize: 13,
                cursorStyle: 'block',
                cursorBlinking: 'phase',
                smoothScrolling: true,
                renderWhitespace: 'selection',
                wordWrap: 'on',
                scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
              }}
              beforeMount={(monaco) => {
                monaco.editor.defineTheme('shart-dark', {
                  base: 'vs-dark',
                  inherit: true,
                  rules: [
                    { token: '', foreground: 'A7F3D0' },
                    { token: 'keyword', foreground: '34D399', fontStyle: 'bold' },
                    { token: 'number', foreground: 'F59E0B' },
                    { token: 'string', foreground: '10B981' },
                    { token: 'comment', foreground: '4B5563', fontStyle: 'italic' },
                    { token: 'variable', foreground: '93C5FD' },
                  ],
                  colors: {
                    'editor.background': '#000000',
                    'editor.foreground': '#A7F3D0',
                    'editorLineNumber.foreground': '#16A34A',
                    'editorCursor.foreground': '#22C55E',
                    'editor.lineHighlightBackground': '#064E3B',
                    'editor.selectionBackground': '#065F46',
                    'editor.inactiveSelectionBackground': '#065F4633',
                    'editorBracketMatch.background': '#052e2b',
                    'editorBracketMatch.border': '#10B981',
                    'editorGutter.background': '#000000',
                    'scrollbarSlider.background': '#065F4688',
                    'scrollbarSlider.hoverBackground': '#065F46AA',
                    'scrollbarSlider.activeBackground': '#065F46CC',
                  },
                });
              }}
              onMount={(editor, monaco) => {
                monaco.editor.setTheme('shart-dark');
              }}
            />
          </div>
        )}
        {loading && <p className="mt-2 text-xs text-green-300/70">Running…</p>}
        {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      </section>

      <section className="rounded-md border border-green-600/30 bg-black/30 p-4">
        <h2 className="text-sm font-medium mb-3">Popular Queries</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {packsForThis.flatMap((p) => p.queries.map((q) => (
            <button
              key={q.id}
              onClick={() => runPreset(q)}
              disabled={!dbReady}
              className={`text-left rounded border p-3 bg-black/40 ${dbReady ? 'border-green-600/30 hover:border-green-400/60' : 'border-green-900/30 cursor-not-allowed opacity-60'}`}
              title={dbReady ? (q.description ?? '') : 'Loading dataset…'}
            >
              <div className="text-sm font-semibold">{q.title}</div>
              {q.category && <div className="text-xs text-green-300/60">{q.category}</div>}
            </button>
          )))}
        </div>
      </section>

      <section className="rounded-md border border-green-600/30 bg-black/30 p-4 overflow-auto">
        <h2 className="text-sm font-medium mb-3">Results</h2>
        {!result && <p className="text-sm text-green-300/60">Run a query to see results.</p>}
        {result && (
          <div className="w-full overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  {result.columns.map((c) => (
                    <th key={c.name} className="text-left border-b border-green-600/30 px-2 py-1 font-medium">
                      {c.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((r, i) => (
                  <tr key={i} className="odd:bg-white/0 even:bg-white/5">
                    {result.columns.map((c) => (
                      <td key={c.name} className="px-2 py-1 align-top">
                        {String(r[c.name])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
