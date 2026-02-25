import React, { useRef, useState, useEffect, useCallback } from 'react';
import type { PodScenario, VerdictType } from '../../../lib/games/admission-bouncer/types';

interface SwipeCardProps {
  scenario: PodScenario;
  cardKey: string | number;
  onVerdict: (verdict: VerdictType) => void;
  disabled?: boolean;
}

type CardState = 'idle' | 'dragging' | 'exiting-admit' | 'exiting-deny' | 'returning';

const SWIPE_THRESHOLD = 90;
const EXIT_DISTANCE = 600;

// Render a single YAML line with neutral syntax coloring (key vs value vs comment).
// Deliberately does NOT use the highlight metadata — that would give away the answer.
function renderYamlLine(text: string): React.ReactNode {
  // Pure comment line
  if (/^\s*#/.test(text)) {
    return <span style={{ color: 'var(--color-primary-subtle)' }}>{text}</span>;
  }

  // Inline comment suffix (e.g. "    privileged: true  # some note")
  const commentIdx = text.indexOf('  #');
  const mainPart = commentIdx !== -1 ? text.slice(0, commentIdx) : text;
  const commentPart = commentIdx !== -1 ? text.slice(commentIdx) : null;

  // key: value  — split on first colon not inside a brace/bracket
  const colonIdx = mainPart.indexOf(': ');
  if (colonIdx !== -1) {
    const key = mainPart.slice(0, colonIdx + 1); // includes the colon
    const value = mainPart.slice(colonIdx + 1);  // leading space + value
    return (
      <>
        <span style={{ color: 'var(--color-primary)' }}>{key}</span>
        <span style={{ color: 'var(--color-accent)' }}>{value}</span>
        {commentPart && <span style={{ color: 'var(--color-primary-subtle)' }}>{commentPart}</span>}
      </>
    );
  }

  // key: (no value — next line is nested)  e.g. "  securityContext:"
  if (mainPart.trimEnd().endsWith(':')) {
    return (
      <>
        <span style={{ color: 'var(--color-primary)' }}>{mainPart}</span>
        {commentPart && <span style={{ color: 'var(--color-primary-subtle)' }}>{commentPart}</span>}
      </>
    );
  }

  // List item marker or bare value
  return (
    <>
      <span style={{ color: 'var(--color-primary-muted)' }}>{mainPart}</span>
      {commentPart && <span style={{ color: 'var(--color-primary-subtle)' }}>{commentPart}</span>}
    </>
  );
}

export function SwipeCard({ scenario, cardKey, onVerdict, disabled }: SwipeCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardState, setCardState] = useState<CardState>('idle');
  const [delta, setDelta] = useState({ x: 0, y: 0 });
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const draggingRef = useRef(false);
  const committedRef = useRef(false);

  // Reset on new card
  useEffect(() => {
    setCardState('idle');
    setDelta({ x: 0, y: 0 });
    committedRef.current = false;
    draggingRef.current = false;
  }, [cardKey]);

  const fireVerdict = useCallback((v: VerdictType) => {
    if (committedRef.current) return;
    committedRef.current = true;
    setCardState(v === 'admit' ? 'exiting-admit' : 'exiting-deny');
    setTimeout(() => onVerdict(v), 340);
  }, [onVerdict]);

  // Keyboard controls
  useEffect(() => {
    if (disabled) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a') { e.preventDefault(); fireVerdict('deny'); }
      if (e.key === 'ArrowRight' || e.key === 'd') { e.preventDefault(); fireVerdict('admit'); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [disabled, fireVerdict]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (disabled || committedRef.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    draggingRef.current = true;
    setStartPos({ x: e.clientX, y: e.clientY });
    setCardState('dragging');
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current || committedRef.current) return;
    const dx = e.clientX - startPos.x;
    const dy = e.clientY - startPos.y;
    setDelta({ x: dx, y: dy });
  };

  const handlePointerUp = () => {
    if (!draggingRef.current || committedRef.current) return;
    draggingRef.current = false;
    if (delta.x > SWIPE_THRESHOLD) {
      fireVerdict('admit');
    } else if (delta.x < -SWIPE_THRESHOLD) {
      fireVerdict('deny');
    } else {
      setCardState('returning');
      setDelta({ x: 0, y: 0 });
      setTimeout(() => setCardState('idle'), 280);
    }
  };

  // Compute transform
  let transform = 'translate(0px, 0px) rotate(0deg)';
  let transition = 'none';

  if (cardState === 'dragging') {
    const rot = delta.x * 0.06;
    transform = `translate(${delta.x}px, ${delta.y * 0.25}px) rotate(${rot}deg)`;
  } else if (cardState === 'exiting-admit') {
    transform = `translate(${EXIT_DISTANCE}px, -80px) rotate(20deg)`;
    transition = 'transform 0.32s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
  } else if (cardState === 'exiting-deny') {
    transform = `translate(${-EXIT_DISTANCE}px, -80px) rotate(-20deg)`;
    transition = 'transform 0.32s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
  } else if (cardState === 'returning') {
    transform = 'translate(0px, 0px) rotate(0deg)';
    transition = 'transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1)';
  }

  // Overlay opacity
  const admitOpacity = cardState === 'dragging' ? Math.min(1, Math.max(0, delta.x / SWIPE_THRESHOLD)) : 0;
  const denyOpacity = cardState === 'dragging' ? Math.min(1, Math.max(0, -delta.x / SWIPE_THRESHOLD)) : 0;

  return (
    <div style={styles.wrapper}>
      {/* Background stack hint */}
      <div style={styles.stackBack2} />
      <div style={styles.stackBack1} />

      {/* Main card */}
      <div
        ref={cardRef}
        style={{
          ...styles.card,
          transform,
          transition,
          cursor: disabled ? 'default' : cardState === 'dragging' ? 'grabbing' : 'grab',
          userSelect: 'none',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* ADMIT overlay */}
        <div style={{ ...styles.admitOverlay, opacity: admitOpacity }}>
          <span style={styles.admitLabel}>ADMIT</span>
        </div>

        {/* DENY overlay */}
        <div style={{ ...styles.denyOverlay, opacity: denyOpacity }}>
          <span style={styles.denyLabel}>DENY</span>
        </div>

        {/* Card header */}
        <div style={styles.cardHeader}>
          <div style={styles.podMeta}>
            <span style={styles.podKind}>Pod</span>
            <span style={styles.podName}>{scenario.podName}</span>
          </div>
          <span style={styles.namespace}>{scenario.namespace}</span>
        </div>

        {/* YAML body */}
        <div style={styles.yamlBody}>
          <pre style={styles.yamlPre}>
            {scenario.yaml.map((line, i) => (
              <span key={i} style={{ display: 'block' }}>
                {renderYamlLine(line.text)}
              </span>
            ))}
          </pre>
        </div>

        {/* Card footer hint */}
        <div style={styles.cardFooter}>
          <span style={styles.hintKey}>←</span>
          <span style={styles.hintDeny}>DENY</span>
          <span style={styles.hintSep}>·</span>
          <span style={styles.hintAdmit}>ADMIT</span>
          <span style={styles.hintKey}>→</span>
        </div>
      </div>

      {/* Action buttons */}
      <div style={styles.buttons}>
        <button
          style={{ ...styles.btn, ...styles.btnDeny }}
          onClick={() => fireVerdict('deny')}
          disabled={disabled || committedRef.current}
          aria-label="Deny this pod"
        >
          <span style={styles.btnIcon}>✗</span>
          <span>DENY</span>
        </button>
        <button
          style={{ ...styles.btn, ...styles.btnAdmit }}
          onClick={() => fireVerdict('admit')}
          disabled={disabled || committedRef.current}
          aria-label="Admit this pod"
        >
          <span>ADMIT</span>
          <span style={styles.btnIcon}>✓</span>
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '1.25rem',
    position: 'relative' as const,
  },
  stackBack2: {
    position: 'absolute' as const,
    top: '8px',
    width: '320px',
    height: '420px',
    background: 'var(--color-bg-elevated)',
    border: '1px solid var(--color-border)',
    borderRadius: '6px',
    transform: 'rotate(4deg)',
    opacity: 0.4,
  },
  stackBack1: {
    position: 'absolute' as const,
    top: '4px',
    width: '320px',
    height: '420px',
    background: 'var(--color-bg-elevated)',
    border: '1px solid var(--color-border)',
    borderRadius: '6px',
    transform: 'rotate(2deg)',
    opacity: 0.65,
  },
  card: {
    position: 'relative' as const,
    width: '320px',
    minHeight: '420px',
    background: 'var(--color-bg-elevated)',
    border: '1px solid var(--color-border)',
    borderRadius: '6px',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column' as const,
    fontFamily: "'JetBrains Mono', monospace",
    boxShadow: '0 8px 32px -8px rgba(0,0,0,0.4)',
    willChange: 'transform',
    touchAction: 'none',
  },
  admitOverlay: {
    position: 'absolute' as const,
    inset: 0,
    background: 'color-mix(in srgb, #22c55e 15%, transparent)',
    border: '3px solid #22c55e',
    borderRadius: '6px',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'flex-end',
    padding: '1rem',
    pointerEvents: 'none' as const,
    zIndex: 10,
    transition: 'opacity 0.05s',
  },
  admitLabel: {
    fontSize: '1.25rem',
    fontWeight: 900,
    letterSpacing: '0.15em',
    color: '#22c55e',
    fontFamily: "'JetBrains Mono', monospace",
    transform: 'rotate(15deg)',
    border: '3px solid #22c55e',
    padding: '0.1rem 0.5rem',
    borderRadius: '4px',
  },
  denyOverlay: {
    position: 'absolute' as const,
    inset: 0,
    background: 'color-mix(in srgb, var(--color-error) 15%, transparent)',
    border: '3px solid var(--color-error)',
    borderRadius: '6px',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    padding: '1rem',
    pointerEvents: 'none' as const,
    zIndex: 10,
    transition: 'opacity 0.05s',
  },
  denyLabel: {
    fontSize: '1.25rem',
    fontWeight: 900,
    letterSpacing: '0.15em',
    color: 'var(--color-error)',
    fontFamily: "'JetBrains Mono', monospace",
    transform: 'rotate(-15deg)',
    border: '3px solid var(--color-error)',
    padding: '0.1rem 0.5rem',
    borderRadius: '4px',
  },
  cardHeader: {
    padding: '0.875rem 1rem 0.625rem',
    borderBottom: '1px solid var(--color-border)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  podMeta: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.125rem',
  },
  podKind: {
    fontSize: '0.5rem',
    fontWeight: 700,
    letterSpacing: '0.2em',
    textTransform: 'uppercase' as const,
    color: 'var(--color-accent)',
  },
  podName: {
    fontSize: '0.9375rem',
    fontWeight: 700,
    color: 'var(--color-primary)',
  },
  namespace: {
    fontSize: '0.5625rem',
    color: 'var(--color-primary-subtle)',
    background: 'var(--color-bg)',
    border: '1px solid var(--color-border)',
    borderRadius: '3px',
    padding: '0.125rem 0.375rem',
    letterSpacing: '0.05em',
  },
  yamlBody: {
    flex: 1,
    padding: '0.75rem 1rem',
    overflow: 'auto',
    background: 'var(--color-bg)',
  },
  yamlPre: {
    margin: 0,
    fontSize: '0.6875rem',
    lineHeight: 1.6,
    fontFamily: "'JetBrains Mono', monospace",
    whiteSpace: 'pre' as const,
  },
  cardFooter: {
    padding: '0.5rem 1rem',
    borderTop: '1px solid var(--color-border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    fontSize: '0.5625rem',
    letterSpacing: '0.1em',
  },
  hintKey: {
    color: 'var(--color-primary-subtle)',
    fontWeight: 700,
  },
  hintDeny: {
    color: 'var(--color-error)',
    fontWeight: 700,
  },
  hintAdmit: {
    color: '#4ade80',
    fontWeight: 700,
  },
  hintSep: {
    color: 'var(--color-primary-subtle)',
    flex: 1,
    textAlign: 'center' as const,
  },
  buttons: {
    display: 'flex',
    gap: '1rem',
    zIndex: 1,
  },
  btn: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.625rem 1.5rem',
    border: '1px solid',
    borderRadius: '3px',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.75rem',
    fontWeight: 700,
    letterSpacing: '0.1em',
    textTransform: 'uppercase' as const,
    cursor: 'pointer',
    background: 'transparent',
    transition: 'background 0.15s',
  },
  btnDeny: {
    borderColor: 'var(--color-error)',
    color: 'var(--color-error)',
  },
  btnAdmit: {
    borderColor: '#4ade80',
    color: '#4ade80',
  },
  btnIcon: {
    fontSize: '0.875rem',
  },
};
