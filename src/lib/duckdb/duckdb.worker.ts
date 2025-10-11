/// <reference lib="webworker" />
import type { WorkerInMsg, WorkerOutMsg } from './protocol';
import * as duckdb from '@duckdb/duckdb-wasm';
import { gunzipSync } from 'fflate';

declare const self: DedicatedWorkerGlobalScope;

async function sha256Hex(stream: ReadableStream<Uint8Array>): Promise<{ hex: string; size: number; buffer: Uint8Array }> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  // We buffer here to compute sha256 easily; we can replace with incremental digest later.
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.byteLength;
    }
  }
  const all = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    all.set(c, offset);
    offset += c.byteLength;
  }
  const digest = await crypto.subtle.digest('SHA-256', all);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return { hex, size: total, buffer: all };
}

function readOctalString(buf: Uint8Array): number {
  // Trim nulls and spaces, parse as octal
  let str = '';
  for (let i = 0; i < buf.length; i++) {
    const c = buf[i];
    if (c === 0) break;
    str += String.fromCharCode(c);
  }
  str = str.trim();
  // Some tars include NUL + space prefix; just strip
  str = str.replace(/[^0-7]/g, '').trim();
  if (!str) return 0;
  return parseInt(str, 8);
}

type TarEntry = { name: string; data: Uint8Array };

function parseTar(tarData: Uint8Array): TarEntry[] {
  const entries: TarEntry[] = [];
  const blockSize = 512;
  let offset = 0;
  while (offset + blockSize <= tarData.length) {
    const header = tarData.subarray(offset, offset + blockSize);
    // End of archive: two consecutive zero blocks
    const isZeroBlock = header.every((b) => b === 0);
    if (isZeroBlock) break;
    // name (0..99)
    const nameBytes = header.subarray(0, 100);
    let name = '';
    for (let i = 0; i < nameBytes.length && nameBytes[i] !== 0; i++) {
      name += String.fromCharCode(nameBytes[i]);
    }
    // size (124..135)
    const size = readOctalString(header.subarray(124, 136));
    // prefix (345..499) optional
    const prefixBytes = header.subarray(345, 500);
    let prefix = '';
    for (let i = 0; i < prefixBytes.length && prefixBytes[i] !== 0; i++) {
      prefix += String.fromCharCode(prefixBytes[i]);
    }
    const fullName = prefix ? `${prefix}/${name}` : name;

    offset += blockSize;
    const fileData = tarData.subarray(offset, offset + size);
    entries.push({ name: fullName, data: fileData.slice() });
    // advance to next 512 boundary
    const padding = (blockSize - (size % blockSize)) % blockSize;
    offset += size + padding;
  }
  return entries;
}

let db: duckdb.AsyncDuckDB | null = null;
let conn: duckdb.AsyncDuckDBConnection | null = null;

self.addEventListener('message', async (evt: MessageEvent<WorkerInMsg>) => {
  const post = (msg: WorkerOutMsg) => self.postMessage(msg);

  try {
    const data = evt.data;
    if (data.type === 'ping') {
      post({ type: 'pong' });
      return;
    }
    if (data.type === 'dispose') {
      try {
        await conn?.close();
      } catch {}
      try {
        await db?.terminate();
      } catch {}
      conn = null;
      db = null;
      return;
    }
    if (data.type === 'ingestPack') {
      let buffer: Uint8Array | null = null;
      let totalBytes = 0;
      if (data.tarData) {
        buffer = new Uint8Array(data.tarData);
        totalBytes = buffer.byteLength;
        post({ type: 'progress', stage: 'download', percent: 100, loadedBytes: totalBytes, totalBytes, message: 'Received pack' });
      } else if (data.url) {
        post({ type: 'progress', stage: 'download', percent: 0, message: 'Starting download' });
        const res = await fetch(data.url, { redirect: 'follow' });
        if (!res.ok || !res.body) {
          post({ type: 'error', message: `Download failed: ${res.status} ${res.statusText}` });
          return;
        }
        totalBytes = Number(res.headers.get('content-length') || 0);
        const { hex, size, buffer: buf } = await sha256Hex(res.body);
        post({ type: 'progress', stage: 'verify', percent: 100, loadedBytes: size, totalBytes: totalBytes || size, message: 'Verifying checksum' });
        if (data.expectedSha256 && data.expectedSha256 !== hex) {
          post({ type: 'error', message: `SHA-256 mismatch. expected=${data.expectedSha256} got=${hex}` });
          return;
        }
        buffer = buf;
      } else {
        post({ type: 'error', message: 'No pack data provided' });
        return;
      }

      // Verify checksum if tarData was provided
      if (data.tarData && data.expectedSha256) {
        const digest = await crypto.subtle.digest('SHA-256', buffer!);
        const hex = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
        if (hex !== data.expectedSha256) {
          post({ type: 'error', message: `SHA-256 mismatch. expected=${data.expectedSha256} got=${hex}` });
          return;
        }
        post({ type: 'progress', stage: 'verify', percent: 100, loadedBytes: buffer!.byteLength, totalBytes: buffer!.byteLength, message: 'Checksum OK' });
      }

      // Decompress tar.gz
      post({ type: 'progress', stage: 'extract', percent: 5, message: 'Decompressing gzip' });
      const tarBytes = gunzipSync(buffer!);
      post({ type: 'progress', stage: 'extract', percent: 25, message: 'Parsing tar' });
      const entries = parseTar(tarBytes);

      // Find and parse manifest.json
      const manifestEntry = entries.find((e) => e.name === 'manifest.json' || e.name.endsWith('/manifest.json'));
      if (!manifestEntry) {
        post({ type: 'error', message: 'manifest.json not found in pack' });
        return;
      }
      const decoder = new TextDecoder();
      const manifest = JSON.parse(decoder.decode(manifestEntry.data));

      // Initialize DuckDB WASM
      post({ type: 'progress', stage: 'ingest', percent: 5, message: 'Initializing DuckDB' });
      // Use vendored bundles served from our CDN/base URL to avoid third-party CDNs
      const base = ((import.meta as any)?.env?.PUBLIC_DUCKDB_ASSETS_BASE || '').toString();
      if (!base) {
        post({ type: 'error', message: 'PUBLIC_DUCKDB_ASSETS_BASE not set; cannot load duckdb-wasm assets' });
        return;
      }
      const join = (b: string, p: string) => (b.endsWith('/') ? b : b + '/') + p.replace(/^\//, '');
      const bundles: duckdb.DuckDBBundles = {
        mvp: {
          mainModule: join(base, 'duckdb-mvp.wasm'),
          mainWorker: join(base, 'duckdb-browser-mvp.worker.js'),
        },
        eh: {
          mainModule: join(base, 'duckdb-eh.wasm'),
          mainWorker: join(base, 'duckdb-browser-eh.worker.js'),
        },
        coi: {
          mainModule: join(base, 'duckdb-coi.wasm'),
          mainWorker: join(base, 'duckdb-browser-coi.worker.js'),
          pthreadWorker: join(base, 'duckdb-browser-coi.pthread.worker.js'),
        },
      };
      const bundle = await duckdb.selectBundle(bundles);
      const mainWorkerUrl = (bundle as any).mainWorker ?? (bundle as any).worker ?? (bundle as any).mainWorkerURL;
      if (!mainWorkerUrl) {
        post({ type: 'error', message: 'Failed to resolve DuckDB worker URL from bundle' });
        return;
      }
      const wasmWorker = new Worker(mainWorkerUrl, { type: 'module' });
      const logger = new duckdb.ConsoleLogger();
      db = new duckdb.AsyncDuckDB(logger, wasmWorker);
      await db.instantiate((bundle as any).mainModule, (bundle as any).pthreadWorker);
      conn = await db.connect();

      // Register files and create tables
      let fileCount = 0;
      const wantedLogs = entries.filter((e) => e.name.startsWith('logs/'));
      const registeredNames: string[] = [];
      for (const e of wantedLogs) {
        let dataBytes = e.data;
        let virtName = e.name;
        if (e.name.endsWith('.gz')) {
          // Decompress gzip entries and strip .gz so DuckDB picks the correct reader
          try {
            dataBytes = gunzipSync(e.data);
            virtName = e.name.replace(/\.gz$/, '');
          } catch {
            // If gunzip fails, keep original
          }
        }
        await db!.registerFileBuffer(virtName, dataBytes);
        registeredNames.push(virtName);
        fileCount++;
      }
      post({ type: 'progress', stage: 'ingest', percent: 35, message: `Registered ${fileCount} files` });

      // Build VPC Flow table from CSV files
      const vpcFiles = registeredNames.filter((n) => n.startsWith('logs/') && n.includes('vpc') && n.toLowerCase().endsWith('.csv'));
      if (vpcFiles.length > 0) {
        await conn!.query(`DROP TABLE IF EXISTS vpc_flow_logs;`);
        // First file creates table
        await conn!.query(`CREATE TABLE vpc_flow_logs AS SELECT * FROM read_csv_auto('${vpcFiles[0]}');`);
        for (let i = 1; i < vpcFiles.length; i++) {
          await conn!.query(`INSERT INTO vpc_flow_logs SELECT * FROM read_csv_auto('${vpcFiles[i]}');`);
        }
        post({ type: 'progress', stage: 'ingest', percent: 65, message: `Ingested VPC Flow (${vpcFiles.length} file${vpcFiles.length > 1 ? 's' : ''})` });
      }

      // Build CloudTrail table from JSON files
      const ctFiles = registeredNames.filter((n) => n.startsWith('logs/') && n.includes('cloudtrail') && (n.toLowerCase().endsWith('.json') || n.toLowerCase().endsWith('.json.gz')));
      if (ctFiles.length > 0) {
        await conn!.query(`DROP TABLE IF EXISTS cloudtrail_events;`);
        await conn!.query(`CREATE TABLE cloudtrail_events AS SELECT * FROM read_json_auto('${ctFiles[0]}');`);
        for (let i = 1; i < ctFiles.length; i++) {
          await conn!.query(`INSERT INTO cloudtrail_events SELECT * FROM read_json_auto('${ctFiles[i]}');`);
        }
        post({ type: 'progress', stage: 'ingest', percent: 85, message: `Ingested CloudTrail (${ctFiles.length} file${ctFiles.length > 1 ? 's' : ''})` });
      }

      // Optionally, create a unified view (not required by presets)
      try {
        await conn!.query(`DROP VIEW IF EXISTS events_unified;`);
        await conn!.query(`
          CREATE VIEW events_unified AS
          SELECT try_cast(NULL as TIMESTAMP) AS timestamp, 'vpc_flow' AS provider, srcaddr AS src_ip, dstaddr AS dst_ip, bytes, packets, action, NULL::VARCHAR AS event_name, NULL::VARCHAR AS user
          FROM vpc_flow_logs
          UNION ALL
          SELECT eventTime AS timestamp, 'cloudtrail' AS provider, sourceIPAddress AS src_ip, NULL::VARCHAR AS dst_ip, NULL::BIGINT AS bytes, NULL::BIGINT AS packets, NULL::VARCHAR AS action, eventName AS event_name, userIdentity.userName AS user
          FROM cloudtrail_events;
        `);
      } catch {}

      // Summarize tables
      const tables: { name: string; rows: number }[] = [];
      try {
        const t1 = await conn!.query(`SELECT COUNT(*) AS c FROM vpc_flow_logs;`);
        const c1 = (t1 as any).toArray ? (t1 as any).toArray()[0].c : 0;
        tables.push({ name: 'vpc_flow_logs', rows: Number(c1 ?? 0) });
      } catch {}
      try {
        const t2 = await conn!.query(`SELECT COUNT(*) AS c FROM cloudtrail_events;`);
        const c2 = (t2 as any).toArray ? (t2 as any).toArray()[0].c : 0;
        tables.push({ name: 'cloudtrail_events', rows: Number(c2 ?? 0) });
      } catch {}

      post({ type: 'ready', tables });
      return;
    }
    if (data.type === 'runQuery') {
      if (!conn) {
        post({ type: 'error', message: 'Database not initialized' });
        return;
      }
      try {
        const res: any = await conn.query(data.sql);
        let rows: any[] = [];
        let columns: { name: string; type: string }[] = [];
        if (res && typeof res === 'object') {
          if (typeof res.toArray === 'function') {
            rows = res.toArray();
          } else if (Array.isArray(res)) {
            rows = res;
          }
          const schema = (res as any).schema;
          if (schema && schema.fields) {
            columns = schema.fields.map((f: any) => ({ name: f.name, type: String(f.type?.toString?.() ?? 'unknown') }));
          } else if (rows.length > 0) {
            columns = Object.keys(rows[0]).map((k) => ({ name: k, type: 'unknown' }));
          }
        }
        post({ type: 'queryResult', id: data.id, columns, rows });
      } catch (e) {
        post({ type: 'queryResult', id: data.id, columns: [], rows: [], /* pass error via columns? better log */ });
        post({ type: 'error', message: (e as Error).message });
      }
      return;
    }
  } catch (e) {
    post({ type: 'error', message: (e as Error).message });
  }
});
