import { readFile } from 'node:fs/promises';

// Utility to base64-encode a file from disk
async function toDataUrl(path: string, mime: string) {
  const buf = await readFile(path);
  return `data:${mime};base64,${buf.toString('base64')}`;
}

// Greedy wrap by approximate width using average glyph width
function wrapToWidth(text: string, maxWidthPx: number, fontSize: number, avgRatio = 0.62) {
  // avgRatio ~ average glyph width in em for Orbitron
  const maxChars = Math.max(1, Math.floor(maxWidthPx / (fontSize * avgRatio)));
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const w of words) {
    const next = (current ? current + ' ' : '') + w;
    if (next.length > maxChars) {
      if (current) lines.push(current);
      current = w;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return { lines, maxChars };
}

function truncateToWidth(text: string, maxWidthPx: number, fontSize: number, avgRatio = 0.62) {
  const maxChars = Math.max(1, Math.floor(maxWidthPx / (fontSize * avgRatio)));
  return text.length > maxChars ? text.slice(0, Math.max(0, maxChars - 1)).trimEnd() + '…' : text;
}

function fitTitleToLines(
  title: string,
  maxLines: number,
  maxWidthPx: number,
  startFont = 72,
  minFont = 42
) {
  let font = startFont;
  for (; font >= minFont; font -= 4) {
    const { lines } = wrapToWidth(title, maxWidthPx, font);
    if (lines.length <= maxLines) {
      const lineHeight = Math.round(font * 1.2);
      return { lines, fontSize: font, lineHeight };
    }
  }
  // If still too many lines, force-truncate to maxLines at min font
  const { lines } = wrapToWidth(title, maxWidthPx, minFont);
  const coerced = lines.slice(0, maxLines);
  if (lines.length > maxLines) {
    const last = coerced[maxLines - 1];
    coerced[maxLines - 1] = truncateToWidth(last, maxWidthPx, minFont);
  }
  return { lines: coerced, fontSize: minFont, lineHeight: Math.round(minFont * 1.2) };
}

export type OgParams = {
  title: string;
  description?: string;
  // Absolute or workspace-relative path to the background SVG template
  templatePath: string; // e.g., 'public/og-blank.svg'
};

// Compose a final SVG by layering text onto the provided background SVG template.
// The output is 1440x810 viewBox (16:9) to match the template and will be scaled by the renderer.
export async function buildOgSvg({ title, description, templatePath }: OgParams): Promise<string> {
  // Load background template and font files
  const bgSvg = await readFile(templatePath, 'utf8');

  // Embed Orbitron as an inline font for consistent rendering
  // Note: Actual font embedding is handled by resvg's font options at render time.
  // We still specify families for style to match loaded fonts.

  // Safe content box inside the "browser window" panel
  const safeX = 120;
  const safeRight = 1320; // 1440 - 120
  const maxWidth = safeRight - safeX; // 1200px

  // Fit title within 3 lines and width
  const { lines, fontSize: titleFontSize, lineHeight: titleLineHeight } = fitTitleToLines(
    title,
    3,
    maxWidth,
    72,
    42
  );

  // Compute Y so content stays inside panel even for 3 lines
  const panelTop = 190;
  const panelBottom = 760;
  const effectiveBlockHeight = lines.length * titleLineHeight + 28 + 36; // lines + gap + desc
  const idealStart = 300;
  const minStart = panelTop + 60;
  const maxStart = panelBottom - effectiveBlockHeight - 40;
  const titleBaseY = Math.max(minStart, Math.min(idealStart, maxStart));

  // Optional subtitle/description (single line, small)
  const showDesc = typeof description === 'string' && description.trim().length > 0;
  const descY = titleBaseY + lines.length * titleLineHeight + 28;
  const descFontSize = 34;
  const descText = showDesc ? truncateToWidth(description!.replace(/\s+/g, ' ').trim(), maxWidth, descFontSize, 0.58) : undefined;

  // Insert text as a top-level <g> appended before closing tag
  const overlay = `
  <style>
    .og-title { font-family: 'Orbitron', system-ui, sans-serif; font-weight: 700; fill: #33ff33; letter-spacing: 0.5px; }
    .og-desc { font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; fill: #9EF01A; }
  </style>
  <g id="og-overlay">
    ${lines
      .map(
        (line, i) =>
          `<text class=\"og-title\" x=\"${safeX}\" y=\"${titleBaseY + i * titleLineHeight}\" font-size=\"${titleFontSize}\">${escapeXml(
            line
          )}</text>`
      )
      .join('\n')}
    ${showDesc ? `<text class=\"og-desc\" x=\"${safeX}\" y=\"${descY}\" font-size=\"${descFontSize}\">${escapeXml(
    descText!
  )}</text>` : ''}
  </g>`;

  // Append overlay before closing tag. If the template already has a closing </svg>, inject before it.
  const finalSvg = bgSvg.replace(/<\/svg>\s*$/i, `${overlay}\n</svg>`);
  return finalSvg;
}

function escapeXml(str: string) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
