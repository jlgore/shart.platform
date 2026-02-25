import React from 'react';
import type { GameNode } from '../../../lib/games/scheduler/types';
import { NodeCard } from './NodeCard';

interface ClusterViewProps {
  nodes: GameNode[];
  validNodeIndices: number[];
  isDragActive: boolean;
  hoverNodeIndex: number | null;
}

export function ClusterView({
  nodes,
  validNodeIndices,
  isDragActive,
  hoverNodeIndex,
}: ClusterViewProps) {
  return (
    <div style={styles.wrap}>
      <div style={styles.header}>
        <span style={styles.label}>CLUSTER NODES</span>
        <span style={styles.count}>{nodes.length} nodes</span>
      </div>
      <div style={styles.grid}>
        {nodes.map((node, index) => (
          <NodeCard
            key={node.name}
            node={node}
            nodeIndex={index}
            isValidTarget={validNodeIndices.includes(index)}
            isDragActive={isDragActive}
            isDropHovering={hoverNodeIndex === index}
          />
        ))}
      </div>
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
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
    gap: '0.75rem',
  },
};
