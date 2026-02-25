import React from 'react';
import type { GamePod } from '../../../lib/games/scheduler/types';
import { PodCard } from './PodCard';

interface PodQueueProps {
  pods: GamePod[];
  activeIndex: number | null;
  draggingPodIndex: number | null;
  penaltyFlash: number;
  onPointerDown: (index: number, e: React.PointerEvent) => void;
  onInspect: (podIndex: number) => void;
}

export function PodQueue({ pods, activeIndex, draggingPodIndex, penaltyFlash, onPointerDown, onInspect }: PodQueueProps) {
  if (pods.length === 0) {
    return (
      <div style={styles.empty}>
        <span style={styles.emptyIcon}>{'\u2713'}</span>
        <span style={styles.emptyText}>All pods scheduled</span>
      </div>
    );
  }

  const activePod = activeIndex !== null ? pods[activeIndex] : null;
  const previewPods = pods.slice(1, 4);
  const moreCount = pods.length - 4;

  const previewOpacities = [0.7, 0.45, 0.25];

  return (
    <div style={styles.wrap}>
      <style>{`
        @keyframes penaltyShake {
          0%, 100% { transform: translateX(0); }
          15%  { transform: translateX(-6px); }
          30%  { transform: translateX(6px); }
          45%  { transform: translateX(-4px); }
          60%  { transform: translateX(4px); }
          75%  { transform: translateX(-2px); }
          90%  { transform: translateX(2px); }
        }
      `}</style>

      <div style={styles.header}>
        <span style={styles.label}>POD QUEUE</span>
        <span style={styles.count}>{pods.length} remaining</span>
      </div>

      {activePod && (
        <div
          style={{
            ...styles.activeWrap,
            ...(penaltyFlash > 0 ? styles.penaltyActive : {}),
          }}
        >
          <span style={styles.sectionLabel}>ACTIVE</span>
          <PodCard
            key={activePod.name}
            pod={activePod}
            podIndex={activeIndex!}
            isDragging={draggingPodIndex === activeIndex}
            variant="active"
            onPointerDown={onPointerDown}
            onInspect={onInspect}
          />
        </div>
      )}

      {previewPods.length > 0 && (
        <div style={styles.nextSection}>
          <span style={styles.sectionLabel}>NEXT</span>
          <div style={styles.previewList}>
            {previewPods.map((pod, i) => (
              <div key={pod.name} style={{ opacity: previewOpacities[i] ?? 0.2 }}>
                <PodCard
                  pod={pod}
                  podIndex={i + 1}
                  isDragging={false}
                  variant="preview"
                  onPointerDown={onPointerDown}
                />
              </div>
            ))}
          </div>
          {moreCount > 0 && (
            <div style={styles.moreBadge}>+{moreCount} more</div>
          )}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    minWidth: 0,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  label: {
    fontSize: '0.625rem',
    fontWeight: 700,
    letterSpacing: '0.15em',
    color: 'var(--color-accent)',
    textTransform: 'uppercase' as const,
    fontFamily: "'JetBrains Mono', monospace",
  },
  count: {
    fontSize: '0.625rem',
    color: 'var(--color-primary-subtle)',
    fontFamily: "'JetBrains Mono', monospace",
  },
  sectionLabel: {
    fontSize: '0.5rem',
    fontWeight: 700,
    letterSpacing: '0.15em',
    color: 'var(--color-primary-subtle)',
    textTransform: 'uppercase' as const,
    fontFamily: "'JetBrains Mono', monospace",
    marginBottom: '0.25rem',
    display: 'block',
  },
  activeWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
    transition: 'background 0.3s',
    borderRadius: '4px',
  },
  penaltyActive: {
    animation: 'penaltyShake 0.6s ease-in-out',
    background: 'color-mix(in srgb, var(--color-error) 15%, transparent)',
  },
  nextSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  previewList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  moreBadge: {
    fontSize: '0.5625rem',
    letterSpacing: '0.1em',
    color: 'var(--color-primary-subtle)',
    fontFamily: "'JetBrains Mono', monospace",
    textAlign: 'center' as const,
    padding: '0.25rem 0',
    opacity: 0.7,
  },
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '2rem',
    fontFamily: "'JetBrains Mono', monospace",
  },
  emptyIcon: { fontSize: '1.5rem', color: 'var(--color-primary)' },
  emptyText: { fontSize: '0.75rem', color: 'var(--color-primary-muted)' },
};
