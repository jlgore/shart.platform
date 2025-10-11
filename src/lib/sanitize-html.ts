// Server-side HTML sanitizer.
// - Tries DOMPurify + JSDOM when available (dynamic import).
// - Falls back to sanitize-html if available.
// - Finally falls back to a conservative regex-based sanitizer.

export async function sanitizeHtml(input: string): Promise<string> {
  if (!input) return '';

  // Attempt DOMPurify with JSDOM (best option)
  try {
    // Avoid static import to keep this optional when deps aren’t installed.
    const dynamicImport = new Function('m', 'return import(m)');
    const jsdomMod: any = await (dynamicImport('jsdom') as Promise<any>);
    const { JSDOM } = jsdomMod;
    const window = new JSDOM('<!doctype html><html><body></body></html>').window as any;

    const dompurifyMod: any = await (dynamicImport('dompurify') as Promise<any>);
    const createDOMPurify = dompurifyMod.default || dompurifyMod;
    const DOMPurify = createDOMPurify(window);

    return DOMPurify.sanitize(input, {
      // Forbid risky elements and attributes; allow GitHub-safe subset.
      FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'style', 'link', 'meta', 'base', 'form'],
      FORBID_ATTR: ['onerror', 'onclick', 'onload', 'srcdoc'],
      ALLOW_UNKNOWN_PROTOCOLS: false,
      ADD_ATTR: [],
      ADD_TAGS: [],
      USE_PROFILES: { html: true },
    });
  } catch (_) {
    // ignore and try next method
  }

  // Attempt sanitize-html if installed
  try {
    const dynamicImport = new Function('m', 'return import(m)');
    const sanitizeHtmlLib: any = await (dynamicImport('sanitize-html') as Promise<any>);
    const sanitize = sanitizeHtmlLib.default || sanitizeHtmlLib;

    return sanitize(input, {
      allowedTags: sanitize.defaults.allowedTags.filter((t: string) => !['iframe', 'object', 'embed', 'style'].includes(t)),
      allowedAttributes: {
        '*': ['id', 'class', 'title', 'aria-*', 'role'],
        a: ['href', 'name', 'target', 'rel'],
        img: ['src', 'alt', 'title', 'width', 'height', 'loading', 'decoding'],
        code: ['class'],
        pre: ['class']
      },
      allowedSchemes: ['http', 'https', 'mailto'],
      allowProtocolRelative: false,
      transformTags: {
        a: (tagName: string, attribs: Record<string, string>) => {
          const href = attribs.href || '';
          if (/^\s*javascript:/i.test(href)) attribs.href = '#';
          attribs.rel = attribs.rel || 'noopener noreferrer nofollow';
          if (attribs.target === '_blank') attribs.rel += ' noopener';
          return { tagName, attribs };
        },
      },
      nonBooleanAttributes: ['download'],
    });
  } catch (_) {
    // ignore, fallback next
  }

  // Conservative regex-based sanitizer (last resort)
  let out = String(input);
  // Remove script blocks completely
  out = out.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
  // Remove dangerous tags (keep inner text)
  out = out.replace(/<\/?\s*(iframe|object|embed|style|link|meta|base|form)[^>]*>/gi, '');
  // Neutralize javascript: URLs
  out = out.replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1="#"');
  out = out.replace(/(href|src)\s*=\s*javascript:[^\s>]+/gi, '$1="#"');
  // Strip inline event handlers and srcdoc
  out = out.replace(/\s+on[a-z]+\s*=\s*(["']).*?\1/gi, '');
  out = out.replace(/\s+on[a-z]+\s*=\s*[^\s>]+/gi, '');
  out = out.replace(/\s+srcdoc\s*=\s*(["']).*?\1/gi, '');
  // Remove inline styles entirely
  out = out.replace(/\s+style\s*=\s*(["']).*?\1/gi, '');
  out = out.replace(/\s+style\s*=\s*[^\s>]+/gi, '');

  return out;
}

