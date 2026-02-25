import React, { useEffect, useRef } from 'react';
import type { CoreGameState, CoreAction, FeedbackMessage } from '../../lib/games/types';

interface HUDProps {
  score: number;
  level: number;
  totalLevels?: number;
  lives: number;
  maxLives: number;
  streak: number;
  timeRemaining: number | null;
  queueLength?: number;
}

export function HUD({ score, level, totalLevels, lives, maxLives, streak, timeRemaining, queueLength }: HUDProps) {
  const livesDisplay = Array.from({ length: maxLives }, (_, i) =>
    i < lives ? '\u25CF' : '\u25CB'
  ).join(' ');

  const queueColor =
    queueLength === undefined ? undefined
    : queueLength >= 10 ? 'var(--color-error)'
    : queueLength >= 6 ? '#d97706'
    : 'var(--color-primary-subtle)';

  return (
    <div style={styles.hud}>
      <div style={styles.hudLeft}>
        <span style={styles.hudLabel}>SCORE</span>
        <span style={styles.hudValue}>{score.toLocaleString()}</span>
      </div>
      <div style={styles.hudCenter}>
        <span style={styles.hudLabel}>{totalLevels ? `LEVEL ${level}/${totalLevels}` : `ROUND ${level}`}</span>
        <span style={styles.hudLives} aria-label={`${lives} of ${maxLives} lives remaining`}>
          {livesDisplay}
        </span>
      </div>
      <div style={styles.hudRight}>
        {queueLength !== undefined && (
          <div style={styles.hudQueueWrap}>
            <span style={styles.hudLabel}>QUEUE</span>
            <span style={{ ...styles.hudQueueValue, color: queueColor }}>
              {queueLength}
            </span>
          </div>
        )}
        {streak >= 3 && (
          <span style={styles.hudStreak}>x{streak} STREAK</span>
        )}
        {timeRemaining !== null && (
          <span style={{
            ...styles.hudTimer,
            ...(timeRemaining <= 30 ? styles.hudTimerWarning : {}),
          }}>
            {Math.floor(timeRemaining / 60)}:{String(timeRemaining % 60).padStart(2, '0')}
          </span>
        )}
      </div>
    </div>
  );
}

interface FeedbackOverlayProps {
  feedback: FeedbackMessage;
  onDismiss: () => void;
}

export function FeedbackOverlay({ feedback, onDismiss }: FeedbackOverlayProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
        e.preventDefault();
        onDismiss();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onDismiss]);

  const isError = feedback.type === 'error';

  return (
    <div style={styles.overlayBackdrop} onClick={onDismiss}>
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-label={feedback.title}
        style={{
          ...styles.overlayCard,
          borderColor: isError ? 'var(--color-error)' : 'var(--color-primary)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{
          ...styles.overlayIcon,
          color: isError ? 'var(--color-error)' : 'var(--color-primary)',
        }}>
          {isError ? '\u2717' : '\u2713'}
        </div>
        <h3 style={{
          ...styles.overlayTitle,
          color: isError ? 'var(--color-error)' : 'var(--color-primary)',
        }}>
          {feedback.title}
        </h3>
        {feedback.details && (
          <p style={styles.overlayDetails}>{feedback.details}</p>
        )}
        <p style={styles.overlayBody}>{feedback.body}</p>
        {feedback.ruleViolated && (
          <div style={styles.overlayRule}>
            <span style={styles.overlayRuleLabel}>FILTER PLUGIN:</span> {feedback.ruleViolated}
          </div>
        )}
        <button style={styles.overlayBtn} onClick={onDismiss}>
          {isError ? 'Got It' : 'Continue'}
        </button>
      </div>
    </div>
  );
}

interface LevelIntroProps {
  level: number;
  title: string;
  description: string;
  onBegin: () => void;
}

export function LevelIntro({ level, title, description, onBegin }: LevelIntroProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onBegin();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onBegin]);

  return (
    <div style={styles.introWrap}>
      <div style={styles.introLabel}>LEVEL {level}</div>
      <h2 style={styles.introTitle}>{title}</h2>
      <p style={styles.introDesc}>{description}</p>
      <button style={styles.introBtn} onClick={onBegin}>
        Begin
      </button>
    </div>
  );
}

interface GameOverProps {
  score: number;
  level: number;
  totalCorrect: number;
  totalAttempts: number;
  onPlayAgain: () => void;
  levelLabel?: string;
}

export function GameOver({ score, level, totalCorrect, totalAttempts, onPlayAgain, levelLabel = 'LEVEL' }: GameOverProps) {
  const accuracy = totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : 0;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onPlayAgain();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onPlayAgain]);

  return (
    <div style={styles.gameOverWrap}>
      <div style={styles.gameOverLabel}>GAME OVER</div>
      <div style={styles.gameOverStats}>
        <div style={styles.statBlock}>
          <span style={styles.statValue}>{score.toLocaleString()}</span>
          <span style={styles.statLabel}>SCORE</span>
        </div>
        <div style={styles.statBlock}>
          <span style={styles.statValue}>{level}</span>
          <span style={styles.statLabel}>{levelLabel}</span>
        </div>
        <div style={styles.statBlock}>
          <span style={styles.statValue}>{accuracy}%</span>
          <span style={styles.statLabel}>ACCURACY</span>
        </div>
        <div style={styles.statBlock}>
          <span style={styles.statValue}>{totalCorrect}/{totalAttempts}</span>
          <span style={styles.statLabel}>PLACED</span>
        </div>
      </div>
      <button style={styles.introBtn} onClick={onPlayAgain}>
        Play Again
      </button>
    </div>
  );
}

interface LevelCompleteProps {
  level: number;
  totalLevels: number;
  score: number;
  onNext: () => void;
}

export function LevelComplete({ level, totalLevels, score, onNext }: LevelCompleteProps) {
  const isFinal = level >= totalLevels;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onNext();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onNext]);

  return (
    <div style={styles.introWrap}>
      <div style={styles.gameOverLabel}>{isFinal ? 'YOU WIN' : 'LEVEL COMPLETE'}</div>
      <p style={styles.introDesc}>
        {isFinal
          ? `All levels cleared! Final score: ${score.toLocaleString()}`
          : `Score: ${score.toLocaleString()}. Ready for level ${level + 1}?`}
      </p>
      <button style={styles.introBtn} onClick={onNext}>
        {isFinal ? 'Play Again' : 'Next Level'}
      </button>
    </div>
  );
}

// Inline styles using CSS custom properties
const styles: Record<string, React.CSSProperties> = {
  hud: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.75rem 1rem',
    background: 'var(--color-bg-elevated)',
    border: '1px solid var(--color-border)',
    borderRadius: '4px',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.75rem',
    gap: '1rem',
  },
  hudLeft: { display: 'flex', flexDirection: 'column', gap: '0.125rem' },
  hudCenter: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.125rem' },
  hudRight: { display: 'flex', alignItems: 'center', gap: '0.75rem' },
  hudLabel: {
    fontSize: '0.5625rem',
    letterSpacing: '0.15em',
    textTransform: 'uppercase' as const,
    color: 'var(--color-primary-subtle)',
  },
  hudValue: { color: 'var(--color-primary)', fontWeight: 700, fontSize: '1.125rem' },
  hudLives: { color: 'var(--color-error)', fontSize: '0.875rem', letterSpacing: '3px' },
  hudQueueWrap: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '0.125rem',
  },
  hudQueueValue: {
    fontWeight: 700,
    fontSize: '0.875rem',
    fontFamily: "'JetBrains Mono', monospace",
    transition: 'color 0.3s',
  },
  hudStreak: {
    color: 'var(--color-accent)',
    fontWeight: 700,
    fontSize: '0.75rem',
    letterSpacing: '0.05em',
  },
  hudTimer: { color: 'var(--color-primary)', fontWeight: 700, fontSize: '1rem' },
  hudTimerWarning: { color: 'var(--color-error)' },

  overlayBackdrop: {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0,0,0,0.7)',
    zIndex: 50,
    padding: '1rem',
  },
  overlayCard: {
    maxWidth: '28rem',
    width: '100%',
    padding: '2rem',
    background: 'var(--color-bg)',
    border: '1px solid',
    borderRadius: '4px',
    fontFamily: "'JetBrains Mono', monospace",
    outline: 'none',
  },
  overlayIcon: { fontSize: '2rem', marginBottom: '0.75rem' },
  overlayTitle: {
    fontSize: '1.125rem',
    fontWeight: 700,
    marginBottom: '0.75rem',
  },
  overlayDetails: {
    fontSize: '0.8125rem',
    lineHeight: 1.6,
    color: 'var(--color-primary-muted)',
    marginBottom: '0.75rem',
    padding: '0.75rem',
    background: 'var(--color-bg-elevated)',
    borderRadius: '4px',
    border: '1px solid var(--color-border)',
  },
  overlayBody: {
    fontSize: '0.8125rem',
    lineHeight: 1.6,
    color: 'var(--color-primary-muted)',
    marginBottom: '1rem',
  },
  overlayRule: {
    fontSize: '0.625rem',
    letterSpacing: '0.1em',
    color: 'var(--color-primary-subtle)',
    marginBottom: '1.25rem',
    textTransform: 'uppercase' as const,
  },
  overlayRuleLabel: { color: 'var(--color-accent)', fontWeight: 700 },
  overlayBtn: {
    padding: '0.5rem 1.5rem',
    background: 'transparent',
    border: '1px solid var(--color-primary-muted)',
    borderRadius: '2px',
    color: 'var(--color-primary)',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.75rem',
    fontWeight: 600,
    letterSpacing: '0.1em',
    textTransform: 'uppercase' as const,
    cursor: 'pointer',
  },

  introWrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '4rem 2rem',
    textAlign: 'center' as const,
    fontFamily: "'JetBrains Mono', monospace",
  },
  introLabel: {
    fontSize: '0.625rem',
    fontWeight: 700,
    letterSpacing: '0.2em',
    textTransform: 'uppercase' as const,
    color: 'var(--color-accent)',
    marginBottom: '0.5rem',
  },
  introTitle: {
    fontSize: '1.75rem',
    fontWeight: 700,
    color: 'var(--color-primary)',
    marginBottom: '1rem',
  },
  introDesc: {
    fontSize: '0.875rem',
    lineHeight: 1.7,
    color: 'var(--color-primary-muted)',
    maxWidth: '40ch',
    marginBottom: '2rem',
  },
  introBtn: {
    padding: '0.625rem 2rem',
    background: 'var(--color-primary)',
    border: 'none',
    borderRadius: '2px',
    color: 'var(--color-bg)',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.8125rem',
    fontWeight: 700,
    letterSpacing: '0.1em',
    textTransform: 'uppercase' as const,
    cursor: 'pointer',
  },

  gameOverWrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '4rem 2rem',
    textAlign: 'center' as const,
    fontFamily: "'JetBrains Mono', monospace",
  },
  gameOverLabel: {
    fontSize: '1.5rem',
    fontWeight: 700,
    letterSpacing: '0.15em',
    textTransform: 'uppercase' as const,
    color: 'var(--color-primary)',
    marginBottom: '2rem',
  },
  gameOverStats: {
    display: 'flex',
    gap: '2rem',
    marginBottom: '2.5rem',
    flexWrap: 'wrap' as const,
    justifyContent: 'center',
  },
  statBlock: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem' },
  statValue: { fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-primary)' },
  statLabel: {
    fontSize: '0.5625rem',
    letterSpacing: '0.15em',
    textTransform: 'uppercase' as const,
    color: 'var(--color-primary-subtle)',
  },
};
