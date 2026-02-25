import { useEffect } from 'react';

interface Props {
  courseSlug: string;
  docPath: string;
}

// Headless component: post-processes rendered GitHub markdown to make
// GFM task-list checkboxes interactive and highlight checkpoint sections.
export default function CourseDocEnhancer({ courseSlug, docPath }: Props) {
  useEffect(() => {
    const article = document.querySelector<HTMLElement>('article.course-doc__content');
    if (!article) return;

    const storageKey = (idx: number) => `ckpt:${courseSlug}:${docPath}:${idx}`;

    // 1. Detect and style checkpoint sections (may inject new checkboxes)
    enhanceCheckpointSections(article);

    // 2. Make all checkboxes interactive (both GFM task-list and injected)
    const checkboxes = article.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    checkboxes.forEach((cb, idx) => {
      cb.removeAttribute('disabled');

      // Restore saved state
      const saved = localStorage.getItem(storageKey(idx));
      if (saved === '1') cb.checked = true;

      cb.addEventListener('change', () => {
        localStorage.setItem(storageKey(idx), cb.checked ? '1' : '0');
        updateCheckpointStatus(article);
      });
    });

    updateCheckpointStatus(article);
  }, [courseSlug, docPath]);

  return null;
}

function enhanceCheckpointSections(article: HTMLElement) {
  const headings = Array.from(article.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6'));

  for (const heading of headings) {
    if (!heading.textContent?.toLowerCase().includes('checkpoint')) continue;

    // Collect this heading + siblings until the next heading of same/higher level
    const level = parseInt(heading.tagName[1], 10);
    const siblings: Element[] = [heading];
    let next = heading.nextElementSibling;

    while (next) {
      const tag = next.tagName.toUpperCase();
      if (/^H[1-6]$/.test(tag) && parseInt(tag[1], 10) <= level) break;
      siblings.push(next);
      next = next.nextElementSibling;
    }

    // Inject checkboxes for plain bullet lists in this section
    // (GFM task-list checkboxes are handled separately in the useEffect)
    for (const sibling of siblings) {
      const lists = sibling.tagName === 'UL' || sibling.tagName === 'OL'
        ? [sibling as HTMLElement]
        : Array.from(sibling.querySelectorAll<HTMLElement>('ul, ol'));

      for (const list of lists) {
        const items = list.querySelectorAll<HTMLLIElement>('li');
        items.forEach((li) => {
          // Skip if already has a task-list checkbox
          if (li.querySelector('input[type="checkbox"]')) return;
          li.style.listStyle = 'none';
          li.style.display = 'flex';
          li.style.alignItems = 'flex-start';
          li.style.gap = '0.5rem';
          li.style.marginLeft = '-1.25rem';

          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.style.cursor = 'pointer';
          cb.style.marginTop = '0.2rem';
          cb.style.flexShrink = '0';
          cb.style.width = '1rem';
          cb.style.height = '1rem';
          cb.style.accentColor = '#4ade80';
          cb.dataset.injected = '1';
          li.prepend(cb);
        });
      }
    }

    // Wrap in a styled checkpoint block
    const wrapper = document.createElement('div');
    wrapper.className = 'checkpoint-section';
    Object.assign(wrapper.style, {
      border: '1px solid rgba(74, 222, 128, 0.5)',
      borderRadius: '6px',
      padding: '1rem 1.25rem',
      margin: '1.5rem 0',
      background: 'rgba(74, 222, 128, 0.04)',
    } satisfies Partial<CSSStyleDeclaration>);

    // Badge label in the top-right
    const badge = document.createElement('span');
    badge.className = 'checkpoint-badge';
    badge.textContent = 'CHECKPOINT';
    Object.assign(badge.style, {
      float: 'right',
      fontSize: '0.65rem',
      letterSpacing: '0.1em',
      fontFamily: "'JetBrains Mono', monospace",
      color: '#4ade80',
      background: 'rgba(74, 222, 128, 0.1)',
      border: '1px solid rgba(74, 222, 128, 0.3)',
      borderRadius: '3px',
      padding: '0.15rem 0.5rem',
      marginLeft: '0.75rem',
    } satisfies Partial<CSSStyleDeclaration>);
    heading.prepend(badge);

    // Progress line
    const progressEl = document.createElement('div');
    progressEl.className = 'checkpoint-progress';
    Object.assign(progressEl.style, {
      fontSize: '0.75rem',
      fontFamily: "'JetBrains Mono', monospace",
      marginTop: '0.75rem',
      paddingTop: '0.6rem',
      borderTop: '1px solid rgba(74, 222, 128, 0.15)',
      color: 'var(--color-primary-muted)',
    } satisfies Partial<CSSStyleDeclaration>);

    // Insert wrapper before the first sibling
    heading.parentNode?.insertBefore(wrapper, siblings[0]);
    siblings.forEach((s) => wrapper.appendChild(s));
    wrapper.appendChild(progressEl);
  }
}

function updateCheckpointStatus(article: HTMLElement) {
  const sections = article.querySelectorAll<HTMLElement>('.checkpoint-section');
  sections.forEach((section) => {
    const checkboxes = section.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    if (checkboxes.length === 0) return;

    const checked = Array.from(checkboxes).filter((cb) => cb.checked).length;
    const total = checkboxes.length;
    const progress = section.querySelector<HTMLElement>('.checkpoint-progress');
    if (!progress) return;

    const allDone = checked === total;
    progress.textContent = allDone
      ? `✓ All ${total} items verified`
      : `${checked} / ${total} verified`;
    progress.style.color = allDone ? '#4ade80' : 'var(--color-primary-muted)';

    section.style.borderColor = allDone
      ? 'rgba(74, 222, 128, 0.8)'
      : 'rgba(74, 222, 128, 0.5)';
    section.style.background = allDone
      ? 'rgba(74, 222, 128, 0.07)'
      : 'rgba(74, 222, 128, 0.04)';
  });
}
