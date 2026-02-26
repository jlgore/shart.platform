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

// Try to load a font file, return null if not found (graceful degradation).
async function tryReadFont(filePath: string): Promise<Buffer | null> {
  try {
    return await readFile(filePath);
  } catch {
    return null;
  }
}

export async function getFontOptions() {
  const base = process.cwd();
  const fontsource = path.join(base, 'node_modules', '@fontsource');

  // Orbitron 700 — always present (in package.json)
  const orbitron700 = await readFile(
    path.join(fontsource, 'orbitron', 'files', 'orbitron-latin-700-normal.woff2')
  );

  // JetBrains Mono — always present
  const jbMono400 = await readFile(
    path.join(fontsource, 'jetbrains-mono', 'files', 'jetbrains-mono-latin-400-normal.woff2')
  );
  const jbMono700 = await readFile(
    path.join(fontsource, 'jetbrains-mono', 'files', 'jetbrains-mono-latin-700-normal.woff2')
  );

  // Pixelify Sans — optional, used by Win95 OG template.
  // Install with: npm install @fontsource/pixelify-sans
  const pixelify400 = await tryReadFont(
    path.join(fontsource, 'pixelify-sans', 'files', 'pixelify-sans-latin-400-normal.woff2')
  );
  const pixelify700 = await tryReadFont(
    path.join(fontsource, 'pixelify-sans', 'files', 'pixelify-sans-latin-700-normal.woff2')
  );

  const fontBuffers = [orbitron700, jbMono400, jbMono700, pixelify400, pixelify700].filter(
    (b): b is Buffer => b !== null
  ) as unknown as Uint8Array[];

  return {
    font: {
      fontBuffers,
      // Pixelify Sans is the Win95 template font; fall back to Orbitron if not loaded.
      defaultFontFamily: pixelify400 ? 'Pixelify Sans' : 'Orbitron',
      monospaceFamily: 'JetBrains Mono',
      sansSerifFamily: pixelify400 ? 'Pixelify Sans' : 'Orbitron',
    },
  } as const;
}
