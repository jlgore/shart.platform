import React from 'react';
import type { PolicyRule } from '../../../lib/games/admission-bouncer/types';

interface PolicyPanelProps {
  policyName: string;
  rules: PolicyRule[];
  highlightRuleId?: string;
}

export function PolicyPanel({ policyName, rules, highlightRuleId }: PolicyPanelProps) {
  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <span style={styles.headerLabel}>ACTIVE POLICY</span>
        <span style={styles.policyName}>{policyName}</span>
      </div>
      <ul style={styles.ruleList}>
        {rules.map((rule) => {
          const isHighlighted = rule.id === highlightRuleId;
          return (
            <li
              key={rule.id}
              style={{
                ...styles.ruleItem,
                ...(isHighlighted ? styles.ruleItemHighlighted : {}),
              }}
            >
              <span style={{
                ...styles.ruleIcon,
                color: isHighlighted ? 'var(--color-error)' : 'var(--color-primary)',
              }}>
                {isHighlighted ? '✗' : '◆'}
              </span>
              <div style={styles.ruleText}>
                <span style={{
                  ...styles.ruleLabel,
                  color: isHighlighted ? 'var(--color-error)' : 'var(--color-primary)',
                }}>
                  {rule.label}
                </span>
                <span style={styles.ruleDesc}>{rule.description}</span>
              </div>
            </li>
          );
        })}
      </ul>
      <div style={styles.footer}>
        <span style={styles.footerIcon}>⚖</span>
        <span style={styles.footerText}>ADMIT if ALL rules pass · DENY on any violation</span>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    background: 'var(--color-bg-elevated)',
    border: '1px solid var(--color-border)',
    borderRadius: '4px',
    fontFamily: "'JetBrains Mono', monospace",
    overflow: 'hidden',
  },
  header: {
    padding: '0.75rem 1rem',
    borderBottom: '1px solid var(--color-border)',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  headerLabel: {
    fontSize: '0.5rem',
    fontWeight: 700,
    letterSpacing: '0.2em',
    textTransform: 'uppercase' as const,
    color: 'var(--color-accent)',
  },
  policyName: {
    fontSize: '0.6875rem',
    fontWeight: 700,
    color: 'var(--color-primary)',
    letterSpacing: '0.03em',
  },
  ruleList: {
    listStyle: 'none',
    margin: 0,
    padding: '0.5rem 0',
  },
  ruleItem: {
    display: 'flex',
    gap: '0.625rem',
    padding: '0.5rem 1rem',
    alignItems: 'flex-start',
    transition: 'background 0.2s',
  },
  ruleItemHighlighted: {
    background: 'color-mix(in srgb, var(--color-error) 8%, transparent)',
  },
  ruleIcon: {
    fontSize: '0.5rem',
    marginTop: '0.25rem',
    flexShrink: 0,
    transition: 'color 0.2s',
  },
  ruleText: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.125rem',
  },
  ruleLabel: {
    fontSize: '0.6875rem',
    fontWeight: 700,
    letterSpacing: '0.02em',
    transition: 'color 0.2s',
  },
  ruleDesc: {
    fontSize: '0.5625rem',
    lineHeight: 1.6,
    color: 'var(--color-primary-muted)',
  },
  footer: {
    padding: '0.625rem 1rem',
    borderTop: '1px solid var(--color-border)',
    display: 'flex',
    gap: '0.5rem',
    alignItems: 'center',
  },
  footerIcon: {
    fontSize: '0.625rem',
    color: 'var(--color-primary-subtle)',
  },
  footerText: {
    fontSize: '0.5rem',
    letterSpacing: '0.05em',
    color: 'var(--color-primary-subtle)',
    textTransform: 'uppercase' as const,
  },
};
