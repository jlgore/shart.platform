import React, { useEffect, useRef } from 'react';
import type { PodScenario } from '../../../lib/games/admission-bouncer/types';

interface RevealOverlayProps {
  scenario: PodScenario;
  isRetry: boolean;
  onDismiss: () => void;
}

const AUTO_DISMISS_MS = 5000;

export function RevealOverlay({ scenario, isRetry, onDismiss }: RevealOverlayProps) {
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    btnRef.current?.focus();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [onDismiss]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
        e.preventDefault();
        onDismiss();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onDismiss]);

  return (
    <div style={styles.backdrop} onClick={onDismiss}>
      <div
        style={styles.card}
        role="dialog"
        aria-label="What you missed"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={styles.header}>
          <span style={styles.headerIcon}>✗</span>
          <div style={styles.headerText}>
            <div style={styles.headerTitle}>WRONG CALL — HERE'S WHAT YOU MISSED</div>
            <div style={styles.podLine}>
              <span style={styles.podKind}>Pod</span>
              <span style={styles.podName}>{scenario.podName}</span>
              <span style={styles.namespace}>{scenario.namespace}</span>
            </div>
          </div>
        </div>

        {/* YAML with violations highlighted */}
        <div style={styles.yamlBlock}>
          <pre style={styles.yamlPre}>
            {scenario.yaml.map((line, i) => {
              const color =
                line.highlight === 'violation' ? 'var(--color-error)' :
                line.highlight === 'ok' ? '#4ade80' :
                line.highlight === 'neutral' ? 'var(--color-primary-subtle)' :
                'var(--color-primary-muted)';
              const weight = line.highlight === 'violation' ? 700 : 400;
              return (
                <span key={i} style={{ display: 'block', color, fontWeight: weight }}>
                  {line.text}
                </span>
              );
            })}
          </pre>
        </div>

        {/* Explanation */}
        <div style={styles.explanation}>
          {scenario.explanation}
        </div>

        {/* Retry notice */}
        {isRetry ? null : (
          <div style={styles.retryNotice}>
            <span style={styles.retryIcon}>↺</span>
            This card has been shuffled back into the deck.
          </div>
        )}

        <button ref={btnRef} style={styles.btn} onClick={onDismiss}>
          Got It — Next Card
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed' as const,
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0,0,0,0.75)',
    zIndex: 50,
    padding: '1rem',
  },
  card: {
    maxWidth: '32rem',
    width: '100%',
    background: 'var(--color-bg)',
    border: '1px solid var(--color-error)',
    borderRadius: '4px',
    fontFamily: "'JetBrains Mono', monospace",
    overflow: 'hidden',
    boxShadow: '0 0 40px -8px color-mix(in srgb, var(--color-error) 35%, transparent)',
  },
  header: {
    display: 'flex',
    gap: '0.75rem',
    alignItems: 'flex-start',
    padding: '0.875rem 1rem',
    borderBottom: '1px solid var(--color-error)',
    background: 'color-mix(in srgb, var(--color-error) 8%, transparent)',
  },
  headerIcon: {
    fontSize: '1.25rem',
    color: 'var(--color-error)',
    fontWeight: 700,
    flexShrink: 0,
    lineHeight: 1,
    marginTop: '0.125rem',
  },
  headerText: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.25rem',
  },
  headerTitle: {
    fontSize: '0.5625rem',
    fontWeight: 700,
    letterSpacing: '0.15em',
    textTransform: 'uppercase' as const,
    color: 'var(--color-error)',
  },
  podLine: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  podKind: {
    fontSize: '0.5rem',
    fontWeight: 700,
    letterSpacing: '0.15em',
    textTransform: 'uppercase' as const,
    color: 'var(--color-accent)',
  },
  podName: {
    fontSize: '0.875rem',
    fontWeight: 700,
    color: 'var(--color-primary)',
  },
  namespace: {
    fontSize: '0.5625rem',
    color: 'var(--color-primary-subtle)',
    background: 'var(--color-bg-elevated)',
    border: '1px solid var(--color-border)',
    borderRadius: '3px',
    padding: '0.1rem 0.35rem',
  },
  yamlBlock: {
    background: 'var(--color-bg-elevated)',
    borderBottom: '1px solid var(--color-border)',
    padding: '0.75rem 1rem',
    maxHeight: '14rem',
    overflowY: 'auto' as const,
  },
  yamlPre: {
    margin: 0,
    fontSize: '0.6875rem',
    lineHeight: 1.6,
    fontFamily: "'JetBrains Mono', monospace",
    whiteSpace: 'pre' as const,
  },
  explanation: {
    padding: '0.875rem 1rem',
    fontSize: '0.75rem',
    lineHeight: 1.7,
    color: 'var(--color-primary-muted)',
    borderBottom: '1px solid var(--color-border)',
  },
  retryNotice: {
    padding: '0.5rem 1rem',
    fontSize: '0.5625rem',
    letterSpacing: '0.05em',
    color: 'var(--color-primary-subtle)',
    borderBottom: '1px solid var(--color-border)',
    display: 'flex',
    alignItems: 'center',
    gap: '0.375rem',
  },
  retryIcon: {
    fontSize: '0.75rem',
    color: 'var(--color-accent)',
  },
  btn: {
    display: 'block',
    width: '100%',
    padding: '0.75rem 1rem',
    background: 'transparent',
    border: 'none',
    color: 'var(--color-primary)',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.75rem',
    fontWeight: 700,
    letterSpacing: '0.1em',
    textTransform: 'uppercase' as const,
    cursor: 'pointer',
    textAlign: 'center' as const,
  },
};
