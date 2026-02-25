import React from 'react';
import type { GameNode } from '../../../lib/games/scheduler/types';

interface NodeCardProps {
  node: GameNode;
  nodeIndex: number;
  isValidTarget: boolean;
  isDragActive: boolean;
  isDropHovering: boolean;
}

export function NodeCard({
  node,
  nodeIndex,
  isValidTarget,
  isDragActive,
  isDropHovering,
}: NodeCardProps) {
  const cpuPercent = Math.round((node.allocated.cpu / node.capacity.cpu) * 100);
  const memPercent = Math.round((node.allocated.memory / node.capacity.memory) * 100);

  let borderColor = 'var(--color-border)';
  let boxShadow = 'none';
  let opacity = 1;

  if (isDragActive) {
    if (isDropHovering) {
      if (isValidTarget) {
        borderColor = 'var(--color-primary)';
        boxShadow = '0 0 30px -4px color-mix(in srgb, var(--color-primary) 40%, transparent)';
      } else {
        borderColor = 'var(--color-error)';
        boxShadow = '0 0 20px -4px color-mix(in srgb, var(--color-error) 30%, transparent)';
      }
    } else if (isValidTarget) {
      borderColor = 'var(--color-primary)';
      boxShadow = '0 0 20px -4px color-mix(in srgb, var(--color-primary) 25%, transparent)';
    } else {
      opacity = 0.6;
    }
  }

  return (
    <div
      data-node-index={nodeIndex}
      aria-label={`Node ${node.name}: ${cpuPercent}% CPU, ${memPercent}% memory used`}
      style={{
        ...styles.card,
        borderColor,
        boxShadow,
        opacity,
      }}
    >
      <div style={styles.header}>
        <span style={styles.name}>{node.name}</span>
        {node.taints && node.taints.length > 0 && (
          <span style={styles.taintBadge}>TAINTED</span>
        )}
      </div>

      {/* CPU bar */}
      <div style={styles.barSection}>
        <div style={styles.barHeader}>
          <span style={styles.barLabel}>CPU</span>
          <span style={styles.barValue}>
            {node.allocated.cpu}m / {node.capacity.cpu}m
          </span>
        </div>
        <div style={styles.barTrack}>
          <div
            style={{
              ...styles.barFill,
              width: `${cpuPercent}%`,
              backgroundColor:
                cpuPercent > 80
                  ? 'var(--color-error)'
                  : cpuPercent > 60
                    ? 'var(--color-accent)'
                    : 'var(--color-primary)',
            }}
          />
        </div>
      </div>

      {/* Memory bar */}
      <div style={styles.barSection}>
        <div style={styles.barHeader}>
          <span style={styles.barLabel}>MEM</span>
          <span style={styles.barValue}>
            {node.allocated.memory}Mi / {node.capacity.memory}Mi
          </span>
        </div>
        <div style={styles.barTrack}>
          <div
            style={{
              ...styles.barFill,
              width: `${memPercent}%`,
              backgroundColor:
                memPercent > 80
                  ? 'var(--color-error)'
                  : memPercent > 60
                    ? 'var(--color-accent)'
                    : 'var(--color-primary)',
            }}
          />
        </div>
      </div>

      {/* Labels */}
      <div style={styles.labelsRow}>
        {Object.entries(node.labels)
          .filter(([k]) => k !== 'kubernetes.io/hostname')
          .map(([k, v]) => (
            <span key={k} style={styles.labelTag}>
              {shortLabel(k)}={v}
            </span>
          ))}
      </div>

      {/* Taints */}
      {node.taints && node.taints.length > 0 && (
        <div style={styles.labelsRow}>
          {node.taints.map((t, i) => (
            <span key={i} style={styles.taintTag}>
              {t.key}={t.value}:{t.effect}
            </span>
          ))}
        </div>
      )}

      {/* Placed pods */}
      {node.pods.length > 0 && (
        <div style={styles.podsSection}>
          <span style={styles.podsLabel}>PODS ({node.pods.length})</span>
          <div style={styles.podsList}>
            {node.pods.map((p) => (
              <span key={p.name} style={styles.podChip}>{p.name}</span>
            ))}
          </div>
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
    gap: '0.5rem',
    padding: '0.875rem',
    background: 'var(--color-bg-elevated)',
    border: '1px solid',
    borderRadius: '4px',
    fontFamily: "'JetBrains Mono', monospace",
    textAlign: 'left' as const,
    transition: 'border-color 0.15s, box-shadow 0.2s, opacity 0.15s',
    width: '100%',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  name: {
    fontSize: '0.875rem',
    fontWeight: 700,
    color: 'var(--color-primary)',
  },
  taintBadge: {
    fontSize: '0.5rem',
    fontWeight: 700,
    letterSpacing: '0.1em',
    padding: '0.125rem 0.375rem',
    border: '1px solid var(--color-accent-muted)',
    borderRadius: '2px',
    color: 'var(--color-accent)',
    textTransform: 'uppercase' as const,
  },
  barSection: { display: 'flex', flexDirection: 'column', gap: '0.125rem' },
  barHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' },
  barLabel: {
    fontSize: '0.5625rem',
    fontWeight: 700,
    letterSpacing: '0.1em',
    color: 'var(--color-primary-subtle)',
    textTransform: 'uppercase' as const,
  },
  barValue: { fontSize: '0.625rem', color: 'var(--color-primary-muted)' },
  barTrack: {
    height: '6px',
    background: 'var(--color-bg)',
    borderRadius: '3px',
    border: '1px solid var(--color-border)',
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: '3px',
    transition: 'width 0.3s ease',
  },
  labelsRow: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '0.25rem',
  },
  labelTag: {
    fontSize: '0.5625rem',
    padding: '0.0625rem 0.375rem',
    border: '1px solid var(--color-border)',
    borderRadius: '2px',
    color: 'var(--color-primary-muted)',
  },
  taintTag: {
    fontSize: '0.5625rem',
    padding: '0.0625rem 0.375rem',
    border: '1px solid var(--color-accent-muted)',
    borderRadius: '2px',
    color: 'var(--color-accent)',
  },
  podsSection: {
    paddingTop: '0.375rem',
    borderTop: '1px solid var(--color-border)',
  },
  podsLabel: {
    fontSize: '0.5rem',
    fontWeight: 700,
    letterSpacing: '0.15em',
    color: 'var(--color-primary-subtle)',
    textTransform: 'uppercase' as const,
    marginBottom: '0.25rem',
    display: 'block',
  },
  podsList: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '0.25rem',
  },
  podChip: {
    fontSize: '0.5625rem',
    padding: '0.0625rem 0.375rem',
    background: 'color-mix(in srgb, var(--color-primary) 10%, var(--color-bg))',
    borderRadius: '2px',
    color: 'var(--color-primary-muted)',
  },
};
