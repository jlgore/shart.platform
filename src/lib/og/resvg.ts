import path from 'node:path';
import { readFile } from 'node:fs/promises';

let initialized = false;
let ResvgCtor: any;

export async function getResvg(): Promise<typeof import('@resvg/resvg-wasm')['Resvg']> {
  if (initialized && ResvgCtor) return ResvgCtor;
  const wasmPath = path.join(process.cwd(), 'node_modules', '@resvg', 'resvg-wasm', 'index_bg.wasm');
  const wasm = await readFile(wasmPath);
  const mod = await import('@resvg/resvg-wasm');
  if (!initialized) {
    await mod.initWasm(wasm);
    initialized = true;
  }
  ResvgCtor = mod.Resvg;
  return ResvgCtor;
}

export async function getFontOptions() {
  // Load a couple of weights for title/body rendering
  const orbitron700 = await readFile(
    path.join(process.cwd(), 'node_modules', '@fontsource', 'orbitron', 'files', 'orbitron-latin-700-normal.woff2')
  );
  const jbMono400 = await readFile(
    path.join(
      process.cwd(),
      'node_modules',
      '@fontsource',
      'jetbrains-mono',
      'files',
      'jetbrains-mono-latin-400-normal.woff2'
    )
  );
  const jbMono700 = await readFile(
    path.join(
      process.cwd(),
      'node_modules',
      '@fontsource',
      'jetbrains-mono',
      'files',
      'jetbrains-mono-latin-700-normal.woff2'
    )
  );

  return {
    font: {
      fontBuffers: [orbitron700, jbMono400, jbMono700] as unknown as Uint8Array[],
      defaultFontFamily: 'Orbitron',
      monospaceFamily: 'JetBrains Mono',
      sansSerifFamily: 'Orbitron',
    },
  } as const;
}
