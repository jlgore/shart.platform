import { readFile } from 'node:fs/promises';

// ─── XML escape ────────────────────────────────────────────────────────────
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

// ─── Text helpers ──────────────────────────────────────────────────────────
function wrapToWidth(text: string, maxPx: number, fontSize: number, ratio = 0.58): string[] {
  const maxChars = Math.max(1, Math.floor(maxPx / (fontSize * ratio)));
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current) { lines.push(current); current = word; }
    else current = candidate;
  }
  if (current) lines.push(current);
  return lines;
}

function truncateToWidth(text: string, maxPx: number, fontSize: number, ratio = 0.58): string {
  const maxChars = Math.max(1, Math.floor(maxPx / (fontSize * ratio)));
  return text.length > maxChars ? text.slice(0, maxChars - 1).trimEnd() + '…' : text;
}

// ─── SVG primitives ────────────────────────────────────────────────────────
function raisedRect(x: number, y: number, w: number, h: number, fill: string): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>` +
    `<line x1="${x}" y1="${y}" x2="${x+w}" y2="${y}" stroke="#ffffff" stroke-width="1"/>` +
    `<line x1="${x}" y1="${y}" x2="${x}" y2="${y+h}" stroke="#ffffff" stroke-width="1"/>` +
    `<line x1="${x}" y1="${y+h}" x2="${x+w}" y2="${y+h}" stroke="#000000" stroke-width="1"/>` +
    `<line x1="${x+w}" y1="${y}" x2="${x+w}" y2="${y+h}" stroke="#000000" stroke-width="1"/>`;
}

function sunkenRect(x: number, y: number, w: number, h: number, fill = '#ffffff'): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>` +
    `<line x1="${x}" y1="${y}" x2="${x+w}" y2="${y}" stroke="#808080" stroke-width="1"/>` +
    `<line x1="${x}" y1="${y}" x2="${x}" y2="${y+h}" stroke="#808080" stroke-width="1"/>` +
    `<line x1="${x}" y1="${y+h}" x2="${x+w}" y2="${y+h}" stroke="#ffffff" stroke-width="1"/>` +
    `<line x1="${x+w}" y1="${y}" x2="${x+w}" y2="${y+h}" stroke="#ffffff" stroke-width="1"/>`;
}

function svgText(
  x: number, y: number, text: string,
  opts: { fontSize?: number; fontWeight?: string; fill?: string; anchor?: string } = {}
): string {
  const { fontSize = 14, fontWeight = '400', fill = '#000000', anchor = 'start' } = opts;
  const fam = `'Pixelify Sans', Tahoma, sans-serif`;
  return `<text x="${x}" y="${y}" font-family="${fam}" font-size="${fontSize}" font-weight="${fontWeight}" fill="${fill}" text-anchor="${anchor}">${escapeXml(text)}</text>`;
}

function badgeChip(x: number, y: number, label: string, bg = '#000080', h = 24): string {
  const fs = 13;
  const w = Math.round(label.length * fs * 0.62 + 28);
  const ty = y + Math.round(h * 0.70);
  return raisedRect(x, y, w, h, bg) + svgText(x + w / 2, ty, label, { fontSize: fs, fontWeight: '700', fill: '#ffffff', anchor: 'middle' });
}

function badgeWidth(label: string): number {
  return Math.round(label.length * 13 * 0.62 + 28);
}

type OgTheme = {
  categoryBg: string;
  labelBg: string;
  brandBg: string;
  titleColor: string;
  bulletIconColor: string;
};

function getTheme(category: string): OgTheme {
  const key = category.trim().toUpperCase();
  if (key === 'BLOG') {
    return {
      categoryBg: '#6b2f8a',
      labelBg: '#8a3fb3',
      brandBg: '#5b2e73',
      titleColor: '#4d2468',
      bulletIconColor: '#6b2f8a',
    };
  }
  if (key === 'CTF') {
    return {
      categoryBg: '#7a0000',
      labelBg: '#a21818',
      brandBg: '#8c1010',
      titleColor: '#730000',
      bulletIconColor: '#7a0000',
    };
  }
  if (key === 'LABS') {
    return {
      categoryBg: '#0f5f8f',
      labelBg: '#1375b0',
      brandBg: '#0b6ba8',
      titleColor: '#0a4f78',
      bulletIconColor: '#0f5f8f',
    };
  }
  return {
    categoryBg: '#000080',
    labelBg: '#006400',
    brandBg: '#1084d0',
    titleColor: '#000080',
    bulletIconColor: '#000080',
  };
}

function brandPanel(x: number, y: number, width: number, siteHostname: string, bg: string): string {
  const h = 24;
  const host = truncateToWidth(siteHostname.toUpperCase(), width - 28, 14, 0.62);
  return (
    raisedRect(x, y, width, h, bg) +
    svgText(x + 10, y + 15, 'ONLINE:', { fontSize: 10, fontWeight: '700', fill: '#d8ecff' }) +
    svgText(x + 64, y + 16, host, { fontSize: 14, fontWeight: '700', fill: '#ffffff' })
  );
}

function bulletRow(x: number, y: number, w: number, h: number, text: string, iconColor: string): string {
  const ty = y + Math.round(h * 0.65);
  return sunkenRect(x, y, w, h) +
    svgText(x + 18, ty, '▶', { fontSize: 20, fill: iconColor }) +
    svgText(x + 46, ty, text, { fontSize: 20 });
}

// ─── Site URL helper ───────────────────────────────────────────────────────
export function hostnameFromSite(site: string): string {
  try { return new URL(site).hostname; } catch { return site; }
}

// ─── OgParams ──────────────────────────────────────────────────────────────
export type OgParams = {
  title: string;
  description?: string;
  bullets?: [string?, string?, string?];
  category?: string;
  label?: string;
  windowTitle?: string;
  siteHostname?: string;
};

// ─── Layout constants ──────────────────────────────────────────────────────
// Window body runs from y=52 (below titlebar) to y=520 (above status bar).
// Content is inset 20px from the window left edge (window at x=88 → content at x=108).
const CX          = 108;   // content left
const CW          = 1060;  // content width
const BODY_TOP    = 52;
const BODY_BOT    = 518;
const BADGE_H     = 24;
const BADGE_TOP   = BODY_TOP + 16;        // y=68
const BADGE_BOT   = BADGE_TOP + BADGE_H;  // y=92
const BULLET_H    = 50;
const BULLET_GAP  = 8;
const DESC_FS     = 21;
const DESC_H      = 30;   // single-line description reserved height
const DESC_GAP    = 10;   // space between description and bullet block
const BRAND_PANEL_W = 340;

// ─── Main builder ──────────────────────────────────────────────────────────
export async function buildOgSvg(params: OgParams, templatePath: string): Promise<string> {
  const {
    title,
    description,
    bullets = [],
    category = 'SHART',
    label,
    siteHostname = 'shart.platform',
    windowTitle = siteHostname,
  } = params;

  const base = await readFile(templatePath, 'utf8');
  const theme = getTheme(category);

  const activeBullets = (bullets as string[])
    .filter((b): b is string => typeof b === 'string' && b.trim().length > 0)
    .slice(0, 3);
  const hasBullets = activeBullets.length > 0;
  const hasDesc    = typeof description === 'string' && description.trim().length > 0;

  // ── Bullet block anchored to bottom of body ──────────────
  const bulletBlockH = hasBullets ? activeBullets.length * (BULLET_H + BULLET_GAP) - BULLET_GAP : 0;
  const bulletTop    = hasBullets ? BODY_BOT - bulletBlockH - 14 : BODY_BOT;

  // ── Available vertical space for title ───────────────────
  // Title runs from BADGE_BOT + margin → above (desc + bullets).
  const TITLE_MARGIN_TOP = 14;
  const TITLE_MARGIN_BOT = 10;
  const descSlotH    = hasDesc ? DESC_H + DESC_GAP : 0;
  const titleStartY  = BADGE_BOT + TITLE_MARGIN_TOP;           // y=106
  const titleEndY    = bulletTop - descSlotH - TITLE_MARGIN_BOT;
  const availForTitle = titleEndY - titleStartY;

  // ── Fit font so title block height ≤ availForTitle ───────
  let bestLines: string[] = [title];
  let bestFs = 28;
  let bestLh = Math.round(28 * 1.22);
  for (let fs = 68; fs >= 28; fs -= 2) {
    const lh    = Math.round(fs * 1.22);
    const lines = wrapToWidth(title, CW, fs);
    if (lines.length * lh <= availForTitle) {
      bestLines = lines; bestFs = fs; bestLh = lh;
      break;
    }
  }

  // ── Compute baselines ─────────────────────────────────────
  let titleY: number;
  if (hasBullets) {
    // Top-align within the title zone
    titleY = titleStartY + bestLh;
  } else {
    // Vertically centre the whole content block in the body
    const totalContentH = BADGE_H + TITLE_MARGIN_TOP + bestLines.length * bestLh + descSlotH;
    const topPad = Math.max(0, Math.floor((BODY_BOT - BODY_TOP - totalContentH) / 2));
    titleY = BODY_TOP + topPad + BADGE_H + TITLE_MARGIN_TOP + bestLh;
  }

  const lastTitleBaseline = titleY + (bestLines.length - 1) * bestLh;
  const descY = lastTitleBaseline + TITLE_MARGIN_BOT + DESC_H;

  // ── Build SVG fragments ───────────────────────────────────
  // Badges
  let badgeX = CX;
  let badgeSvg = badgeChip(badgeX, BADGE_TOP, category, theme.categoryBg);
  badgeX += badgeWidth(category) + 8;
  if (label) badgeSvg += badgeChip(badgeX, BADGE_TOP, label, theme.labelBg);

  // Brand panel (top-right)
  const brandX = CX + CW - BRAND_PANEL_W;
  const brandSvg = brandPanel(brandX, BADGE_TOP, BRAND_PANEL_W, siteHostname, theme.brandBg);

  // Title
  const titleSvg = bestLines
    .map((line, i) => svgText(CX, titleY + i * bestLh, line, { fontSize: bestFs, fontWeight: '700', fill: theme.titleColor }))
    .join('');

  // Description
  let descSvg = '';
  if (hasDesc) {
    const dt = truncateToWidth(description!.replace(/\s+/g, ' ').trim(), CW - 16, DESC_FS);
    descSvg = svgText(CX, descY, dt, { fontSize: DESC_FS, fill: '#505050' });
  }

  // Bullets
  const bulletsSvg = activeBullets
    .map((text, i) => bulletRow(CX, bulletTop + i * (BULLET_H + BULLET_GAP), CW, BULLET_H, text, theme.bulletIconColor))
    .join('');

  const patched = base
    .replaceAll('{{SITE_HOSTNAME}}', escapeXml(siteHostname))
    .replaceAll('{{WINDOW_TITLE}}', escapeXml(windowTitle));

  // ── Compose final SVG ─────────────────────────────────────
  const overlay = `<g id="og-content">${badgeSvg}${brandSvg}${titleSvg}${descSvg}${bulletsSvg}</g>`;
  return patched.replace(/<\/svg>\s*$/i, `${overlay}\n</svg>`);
}
