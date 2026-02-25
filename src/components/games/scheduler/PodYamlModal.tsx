import React, { useEffect } from 'react';
import type { GamePod } from '../../../lib/games/scheduler/types';

interface PodYamlModalProps {
  pod: GamePod;
  onClose: () => void;
}

type HighlightKey = 'resources' | 'selector' | 'toleration' | 'affinity';

interface YamlLine {
  text: string;
  highlight?: HighlightKey;
}

const HIGHLIGHT_COLORS: Record<HighlightKey, string> = {
  resources:  'color-mix(in srgb, var(--color-primary) 14%, transparent)',
  selector:   'color-mix(in srgb, #66cc88 14%, transparent)',
  toleration: 'color-mix(in srgb, var(--color-accent) 14%, transparent)',
  affinity:   'color-mix(in srgb, #9966ff 14%, transparent)',
};

const HIGHLIGHT_LABEL_COLORS: Record<HighlightKey, string> = {
  resources:  'var(--color-primary-muted)',
  selector:   '#66cc88',
  toleration: 'var(--color-accent)',
  affinity:   '#9966ff',
};

const LEGEND: { key: HighlightKey; label: string }[] = [
  { key: 'resources',  label: 'resources'    },
  { key: 'selector',   label: 'nodeSelector' },
  { key: 'toleration', label: 'tolerations'  },
  { key: 'affinity',   label: 'affinity'     },
];

function podToYaml(pod: GamePod): YamlLine[] {
  const lines: YamlLine[] = [];
  const add = (text: string, highlight?: HighlightKey) => lines.push({ text, highlight });

  add('apiVersion: v1');
  add('kind: Pod');
  add('metadata:');
  add(`  name: ${pod.name}`);
  add('  labels:');
  Object.entries(pod.labels).forEach(([k, v]) => {
    add(`    ${k}: "${v}"`);
  });
  add('spec:');
  add('  containers:');
  add(`    - name: ${pod.name}`);
  add('      resources:', 'resources');
  add('        requests:', 'resources');
  add(`          cpu: "${pod.resources.cpu}m"`, 'resources');
  add(`          memory: "${pod.resources.memory}Mi"`, 'resources');

  if (pod.nodeSelector && Object.keys(pod.nodeSelector).length > 0) {
    add('  nodeSelector:', 'selector');
    Object.entries(pod.nodeSelector).forEach(([k, v]) => {
      add(`    ${k}: "${v}"`, 'selector');
    });
  }

  if (pod.tolerations && pod.tolerations.length > 0) {
    add('  tolerations:', 'toleration');
    pod.tolerations.forEach((t) => {
      add(`    - key: ${t.key}`, 'toleration');
      add(`      operator: ${t.operator}`, 'toleration');
      if (t.value !== undefined) add(`      value: "${t.value}"`, 'toleration');
      add(`      effect: ${t.effect}`, 'toleration');
    });
  }

  if (pod.affinity) {
    add('  affinity:', 'affinity');

    if (pod.affinity.podAffinity) {
      add('    podAffinity:', 'affinity');
      add('      requiredDuringSchedulingIgnoredDuringExecution:', 'affinity');
      pod.affinity.podAffinity.requiredDuringSchedulingIgnoredDuringExecution?.forEach((term) => {
        add('        - labelSelector:', 'affinity');
        Object.entries(term.labelSelector).forEach(([k, v]) => {
          add(`            ${k}: "${v}"`, 'affinity');
        });
        add(`          topologyKey: ${term.topologyKey}`, 'affinity');
      });
    }

    if (pod.affinity.podAntiAffinity) {
      add('    podAntiAffinity:', 'affinity');
      add('      requiredDuringSchedulingIgnoredDuringExecution:', 'affinity');
      pod.affinity.podAntiAffinity.requiredDuringSchedulingIgnoredDuringExecution?.forEach((term) => {
        add('        - labelSelector:', 'affinity');
        Object.entries(term.labelSelector).forEach(([k, v]) => {
          add(`            ${k}: "${v}"`, 'affinity');
        });
        add(`          topologyKey: ${term.topologyKey}`, 'affinity');
      });
    }
  }

  return lines;
}

export function PodYamlModal({ pod, onClose }: PodYamlModalProps) {
  const lines = podToYaml(pod);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Which highlight types are actually present in this pod
  const activeHighlights = LEGEND.filter(({ key }) => lines.some((l) => l.highlight === key));

  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div
        role="dialog"
        aria-label={`${pod.name} YAML spec`}
        style={styles.modal}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <span style={styles.filePath}>pod.yaml</span>
            <span style={styles.podNameBadge}>{pod.name}</span>
          </div>
          <button style={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* Legend */}
        {activeHighlights.length > 0 && (
          <div style={styles.legend}>
            {activeHighlights.map(({ key, label }) => (
              <span key={key} style={styles.legendItem}>
                <span
                  style={{
                    ...styles.legendSwatch,
                    background: HIGHLIGHT_COLORS[key],
                    borderColor: HIGHLIGHT_LABEL_COLORS[key],
                  }}
                />
                <span style={{ color: HIGHLIGHT_LABEL_COLORS[key] }}>{label}</span>
              </span>
            ))}
          </div>
        )}

        {/* YAML block */}
        <div style={styles.codeBlock}>
          {lines.map((line, i) => (
            <div
              key={i}
              style={{
                ...styles.codeLine,
                background: line.highlight ? HIGHLIGHT_COLORS[line.highlight] : 'transparent',
              }}
            >
              <span style={styles.lineNum}>{String(i + 1).padStart(2, ' ')}</span>
              <span style={styles.lineText}>{line.text || ' '}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.75)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 60,
    padding: '1rem',
  },
  modal: {
    width: '100%',
    maxWidth: '38rem',
    maxHeight: '80vh',
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--color-bg)',
    border: '1px solid var(--color-border)',
    borderRadius: '4px',
    fontFamily: "'JetBrains Mono', monospace",
    overflow: 'hidden',
    boxShadow: '0 0 40px -8px rgba(0,0,0,0.8)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0.625rem 0.875rem',
    borderBottom: '1px solid var(--color-border)',
    background: 'var(--color-bg-elevated)',
    flexShrink: 0,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.625rem',
  },
  filePath: {
    fontSize: '0.6875rem',
    color: 'var(--color-primary-subtle)',
    letterSpacing: '0.05em',
  },
  podNameBadge: {
    fontSize: '0.625rem',
    fontWeight: 700,
    padding: '0.1rem 0.5rem',
    border: '1px solid var(--color-primary)',
    borderRadius: '2px',
    color: 'var(--color-primary)',
    letterSpacing: '0.05em',
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--color-primary-subtle)',
    cursor: 'pointer',
    fontSize: '0.875rem',
    padding: '0.25rem',
    lineHeight: 1,
    fontFamily: "'JetBrains Mono', monospace",
  },
  legend: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.875rem',
    padding: '0.5rem 0.875rem',
    borderBottom: '1px solid var(--color-border)',
    background: 'var(--color-bg-elevated)',
    flexShrink: 0,
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.375rem',
    fontSize: '0.5625rem',
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
  },
  legendSwatch: {
    width: '10px',
    height: '10px',
    borderRadius: '2px',
    border: '1px solid',
    flexShrink: 0,
  },
  codeBlock: {
    overflowY: 'auto',
    fontSize: '0.6875rem',
    lineHeight: '1.6',
  },
  codeLine: {
    display: 'flex',
    alignItems: 'baseline',
    minHeight: '1.4em',
    transition: 'background 0.1s',
  },
  lineNum: {
    flexShrink: 0,
    width: '2.5rem',
    textAlign: 'right' as const,
    paddingRight: '0.75rem',
    color: 'var(--color-primary-subtle)',
    userSelect: 'none' as const,
    fontSize: '0.5625rem',
  },
  lineText: {
    whiteSpace: 'pre' as const,
    color: 'var(--color-primary)',
    paddingRight: '0.875rem',
  },
};
