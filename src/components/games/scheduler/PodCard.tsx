import React from 'react';
import type { GamePod } from '../../../lib/games/scheduler/types';

interface PodCardProps {
  pod: GamePod;
  podIndex: number;
  isDragging: boolean;
  variant?: 'active' | 'preview';
  onPointerDown: (podIndex: number, e: React.PointerEvent) => void;
  onInspect?: (podIndex: number) => void;
}

export function PodCard({ pod, podIndex, isDragging, variant = 'active', onPointerDown, onInspect }: PodCardProps) {
  const isPreview = variant === 'preview';

  return (
    <div
      onPointerDown={isPreview ? undefined : (e) => onPointerDown(podIndex, e)}
      aria-label={`Pod ${pod.name}: ${pod.resources.cpu}m CPU, ${pod.resources.memory}Mi memory`}
      style={{
        ...styles.card,
        ...(isPreview ? styles.cardPreview : styles.cardActive),
        borderColor: isDragging ? 'var(--color-primary)' : isPreview ? 'var(--color-border)' : 'var(--color-primary)',
        boxShadow: isDragging
          ? '0 0 20px -4px color-mix(in srgb, var(--color-primary) 30%, transparent)'
          : isPreview
          ? 'none'
          : '0 0 12px -4px color-mix(in srgb, var(--color-primary) 20%, transparent)',
        opacity: isDragging ? 0.4 : 1,
      }}
    >
      <div style={styles.header}>
        <span style={isPreview ? styles.namePreview : styles.name}>{pod.name}</span>
        {!isPreview && onInspect && (
          <button
            style={styles.inspectBtn}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onInspect(podIndex)}
            aria-label="View pod YAML"
            title="View pod YAML"
          >
            i
          </button>
        )}
      </div>

      <div style={styles.resources}>
        <span style={isPreview ? styles.resourcePreview : styles.resource}>
          <span style={styles.resourceLabel}>CPU</span> {pod.resources.cpu}m
        </span>
        <span style={isPreview ? styles.resourcePreview : styles.resource}>
          <span style={styles.resourceLabel}>MEM</span> {pod.resources.memory}Mi
        </span>
      </div>

      {!isPreview && pod.nodeSelector && (
        <div style={styles.constraintRow}>
          <span style={styles.constraintLabel}>SEL</span>
          {Object.entries(pod.nodeSelector).map(([k, v]) => (
            <span key={k} style={styles.tag}>{shortLabel(k)}={v}</span>
          ))}
        </div>
      )}

      {!isPreview && pod.tolerations && pod.tolerations.length > 0 && (
        <div style={styles.constraintRow}>
          <span style={{ ...styles.constraintLabel, color: 'var(--color-accent)' }}>TOL</span>
          {pod.tolerations.map((t, i) => (
            <span key={i} style={{ ...styles.tag, borderColor: 'var(--color-accent-muted)' }}>
              {t.key}={t.value}
            </span>
          ))}
        </div>
      )}

      {!isPreview && pod.affinity?.podAffinity && (
        <div style={styles.constraintRow}>
          <span style={{ ...styles.constraintLabel, color: '#66cc66' }}>AFF</span>
          {pod.affinity.podAffinity.requiredDuringSchedulingIgnoredDuringExecution?.map((term, i) => (
            <span key={i} style={{ ...styles.tag, borderColor: '#66cc66' }}>
              {Object.entries(term.labelSelector).map(([k, v]) => `${k}=${v}`).join(',')}
            </span>
          ))}
        </div>
      )}

      {!isPreview && pod.affinity?.podAntiAffinity && (
        <div style={styles.constraintRow}>
          <span style={{ ...styles.constraintLabel, color: 'var(--color-error)' }}>ANTI</span>
          {pod.affinity.podAntiAffinity.requiredDuringSchedulingIgnoredDuringExecution?.map((term, i) => (
            <span key={i} style={{ ...styles.tag, borderColor: 'var(--color-error)' }}>
              {Object.entries(term.labelSelector).map(([k, v]) => `${k}=${v}`).join(',')}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function shortLabel(label: string): string {
  const map: Record<string, string> = {
    'topology.kubernetes.io/zone': 'zone',
    'node.kubernetes.io/instance-type': 'type',
    'kubernetes.io/hostname': 'host',
  };
  return map[label] || label.split('/').pop() || label;
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.375rem',
    background: 'var(--color-bg-elevated)',
    border: '1px solid',
    borderRadius: '4px',
    fontFamily: "'JetBrains Mono', monospace",
    textAlign: 'left' as const,
    transition: 'border-color 0.15s, box-shadow 0.2s, opacity 0.15s',
    width: '100%',
    userSelect: 'none' as const,
    touchAction: 'none' as const,
  },
  cardActive: {
    padding: '0.625rem 0.75rem',
    cursor: 'grab',
  },
  cardPreview: {
    padding: '0.4rem 0.625rem',
    cursor: 'default',
  },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.375rem' },
  inspectBtn: {
    flexShrink: 0,
    width: '1.125rem',
    height: '1.125rem',
    background: 'transparent',
    border: '1px solid var(--color-primary-subtle)',
    borderRadius: '50%',
    color: 'var(--color-primary-subtle)',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.5625rem',
    fontWeight: 700,
    fontStyle: 'italic',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    lineHeight: 1,
    transition: 'border-color 0.15s, color 0.15s',
  },
  name: {
    fontSize: '0.8125rem',
    fontWeight: 600,
    color: 'var(--color-primary)',
  },
  namePreview: {
    fontSize: '0.6875rem',
    fontWeight: 600,
    color: 'var(--color-primary-muted)',
  },
  resources: { display: 'flex', gap: '0.75rem' },
  resource: { fontSize: '0.6875rem', color: 'var(--color-primary-muted)' },
  resourcePreview: { fontSize: '0.5625rem', color: 'var(--color-primary-subtle)' },
  resourceLabel: {
    fontSize: '0.5625rem',
    fontWeight: 700,
    color: 'var(--color-primary-subtle)',
    letterSpacing: '0.05em',
  },
  constraintRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.375rem',
    flexWrap: 'wrap' as const,
  },
  constraintLabel: {
    fontSize: '0.5rem',
    fontWeight: 700,
    letterSpacing: '0.1em',
    color: 'var(--color-primary-muted)',
    textTransform: 'uppercase' as const,
  },
  tag: {
    fontSize: '0.5625rem',
    padding: '0.0625rem 0.375rem',
    border: '1px solid var(--color-border)',
    borderRadius: '2px',
    color: 'var(--color-primary-muted)',
  },
};
