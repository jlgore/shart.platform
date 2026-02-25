import React, { useReducer, useCallback, useEffect, useRef, useState } from 'react';
import type { CoreGameState, CoreAction } from '../../../lib/games/types';
import type { VerdictType, PodScenario } from '../../../lib/games/admission-bouncer/types';
import { createInitialCoreState, coreReducer } from '../../../lib/games/engine';
import { getLevelConfig, TOTAL_LEVELS } from '../../../lib/games/admission-bouncer/levels';
import { gameProgress } from '../../../lib/games/progress';
import { HUD, GameOver, LevelIntro, LevelComplete } from '../GameShell';
import { SwipeCard } from './SwipeCard';
import { PolicyPanel } from './PolicyPanel';
import { RevealOverlay } from './RevealOverlay';

// ── State types ─────────────────────────────────────────────────────────────

interface BouncerState {
  scenarios: PodScenario[];
  currentIndex: number;
  highlightRuleId: string | undefined;
  retriedIds: string[];
}

type BouncerAction =
  | { type: 'LOAD_LEVEL'; scenarios: PodScenario[] }
  | { type: 'NEXT_SCENARIO' }
  | { type: 'HIGHLIGHT_RULE'; ruleId: string | undefined }
  | { type: 'RECYCLE_SCENARIO'; scenario: PodScenario };

type GameAction =
  | CoreAction
  | BouncerAction
  | { type: 'ADVANCE_LEVEL' };

interface CombinedState {
  core: CoreGameState;
  bouncer: BouncerState;
}

// ── Reducers ─────────────────────────────────────────────────────────────────

function bouncerReducer(state: BouncerState, action: GameAction): BouncerState {
  switch (action.type) {
    case 'LOAD_LEVEL': {
      const a = action as { type: 'LOAD_LEVEL'; scenarios: PodScenario[] };
      return { scenarios: a.scenarios, currentIndex: 0, highlightRuleId: undefined, retriedIds: [] };
    }

    case 'NEXT_SCENARIO':
      return { ...state, currentIndex: state.currentIndex + 1, highlightRuleId: undefined };

    case 'HIGHLIGHT_RULE': {
      const a = action as { type: 'HIGHLIGHT_RULE'; ruleId: string | undefined };
      return { ...state, highlightRuleId: a.ruleId };
    }

    case 'RECYCLE_SCENARIO': {
      const a = action as { type: 'RECYCLE_SCENARIO'; scenario: PodScenario };
      // Silently ignore if already retried
      if (state.retriedIds.includes(a.scenario.id)) return state;
      // Insert 3 positions ahead of current front
      const insertAt = Math.min(state.currentIndex + 3, state.scenarios.length);
      const newScenarios = [
        ...state.scenarios.slice(0, insertAt),
        a.scenario,
        ...state.scenarios.slice(insertAt),
      ];
      return {
        ...state,
        scenarios: newScenarios,
        retriedIds: [...state.retriedIds, a.scenario.id],
      };
    }

    default:
      return state;
  }
}

function combinedReducer(state: CombinedState, action: GameAction): CombinedState {
  if (action.type === 'ADVANCE_LEVEL') {
    return {
      core: {
        ...state.core,
        level: state.core.level + 1,
        phase: 'level-intro',
        feedback: null,
        timeRemaining: null,
      },
      bouncer: { scenarios: [], currentIndex: 0, highlightRuleId: undefined, retriedIds: [] },
    };
  }

  return {
    core: coreReducer(state.core, action as CoreAction),
    bouncer: bouncerReducer(state.bouncer, action),
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function shuffleWithSeed<T>(arr: T[], seed: number): T[] {
  const copy = [...arr];
  let s = seed;
  for (let i = copy.length - 1; i > 0; i--) {
    s = ((s * 1664525) + 1013904223) & 0xffffffff;
    const j = Math.abs(s) % (i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function BouncerGame() {
  const [state, dispatch] = useReducer(combinedReducer, {
    core: createInitialCoreState(),
    bouncer: { scenarios: [], currentIndex: 0, highlightRuleId: undefined, retriedIds: [] },
  });

  const { core, bouncer } = state;
  const timerRef = useRef<number | null>(null);
  const sessionSeedRef = useRef(Math.floor(Math.random() * 99991) + 1);

  // Post-verdict reveal (wrong answers only)
  const [revealScenario, setRevealScenario] = useState<PodScenario | null>(null);
  const [revealIsRetry, setRevealIsRetry] = useState(false);

  // Correct-answer toast
  const [correctToast, setCorrectToast] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const levelConfig = getLevelConfig(core.level);
  const currentScenario = bouncer.scenarios[bouncer.currentIndex] ?? null;
  const allScenariosComplete = bouncer.scenarios.length > 0 && bouncer.currentIndex >= bouncer.scenarios.length;

  // Timer tick
  useEffect(() => {
    if (core.phase === 'playing' && core.timeRemaining !== null) {
      timerRef.current = window.setInterval(() => dispatch({ type: 'TICK' }), 1000);
    }
    return () => {
      if (timerRef.current !== null) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [core.phase, core.timeRemaining !== null]);

  // Level complete when all scenarios cleared
  useEffect(() => {
    if (core.phase === 'playing' && allScenariosComplete) {
      dispatch({ type: 'LEVEL_COMPLETE' });
    }
  }, [core.phase, allScenariosComplete]);

  // Save progress on game over
  useEffect(() => {
    if (core.phase === 'game-over') {
      const accuracy = core.totalAttempts > 0
        ? Math.round((core.totalCorrect / core.totalAttempts) * 100)
        : 0;
      gameProgress.saveGameResult('k8s-admission-bouncer', {
        score: core.score,
        level: core.level,
        accuracy,
        totalCorrect: core.totalCorrect,
        totalAttempts: core.totalAttempts,
      });
    }
  }, [core.phase]);

  // Auto-dismiss correct toast
  useEffect(() => {
    if (!correctToast) return;
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setCorrectToast(null), 2000);
    return () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); };
  }, [correctToast]);

  const loadAndStartLevel = useCallback((levelId: number, seed: number) => {
    const cfg = getLevelConfig(levelId);
    if (!cfg) return;
    const shuffled = shuffleWithSeed(cfg.scenarios, seed + levelId * 17);
    dispatch({ type: 'LOAD_LEVEL', scenarios: shuffled });
    dispatch({ type: 'START_LEVEL', timeLimit: cfg.timeLimit });
  }, []);

  const handleStartGame = useCallback(() => {
    dispatch({ type: 'START_GAME' });
  }, []);

  const handleBeginLevel = useCallback(() => {
    loadAndStartLevel(core.level, sessionSeedRef.current);
  }, [core.level, loadAndStartLevel]);

  const handleNextLevel = useCallback(() => {
    if (core.level >= TOTAL_LEVELS) {
      dispatch({ type: 'WRONG_ANSWER', feedback: {
        type: 'success',
        title: 'All Levels Cleared',
        body: 'You have mastered Kubernetes Pod Security Admission.',
      }});
      return;
    }
    dispatch({ type: 'ADVANCE_LEVEL' });
  }, [core.level]);

  const handlePlayAgain = useCallback(() => {
    sessionSeedRef.current = Math.floor(Math.random() * 99991) + 1;
    dispatch({ type: 'START_GAME' });
  }, []);

  const handleVerdict = useCallback((verdict: VerdictType) => {
    if (!currentScenario || !levelConfig) return;

    const isCorrect = verdict === currentScenario.verdict;
    const isAlreadyRetried = bouncer.retriedIds.includes(currentScenario.id);
    const points = levelConfig.pointsPerCorrect;

    if (isCorrect) {
      dispatch({ type: 'CORRECT_ANSWER', points, feedback: {
        type: 'success',
        title: verdict === 'admit' ? 'Admitted ✓' : 'Denied ✓',
        body: currentScenario.explanation,
      }});
      dispatch({ type: 'DISMISS_FEEDBACK' });
      dispatch({ type: 'HIGHLIGHT_RULE', ruleId: undefined });
      setCorrectToast(verdict === 'admit' ? 'ADMITTED' : 'DENIED');
    } else {
      dispatch({ type: 'WRONG_ANSWER', feedback: {
        type: 'error',
        title: verdict === 'admit' ? 'Should have been DENIED' : 'Should have been ADMITTED',
        body: currentScenario.explanation,
        ruleViolated: currentScenario.violatedRule,
      }});
      dispatch({ type: 'DISMISS_FEEDBACK' });
      dispatch({ type: 'HIGHLIGHT_RULE', ruleId: currentScenario.violatedRule });

      // Show reveal overlay — capture scenario before state advances
      setRevealScenario(currentScenario);
      setRevealIsRetry(isAlreadyRetried);
    }

    // Advance to next card after swipe animation completes
    setTimeout(() => {
      dispatch({ type: 'NEXT_SCENARIO' });
      // Recycle wrong answers (reducer silently ignores if already retried)
      if (!isCorrect) {
        dispatch({ type: 'RECYCLE_SCENARIO', scenario: currentScenario });
      }
    }, 380);
  }, [currentScenario, levelConfig, bouncer.retriedIds]);

  const handleDismissReveal = useCallback(() => {
    setRevealScenario(null);
  }, []);

  // ── Render: Menu ────────────────────────────────────────────────────────────
  if (core.phase === 'menu') {
    const progress = gameProgress.getProgress('k8s-admission-bouncer');
    return (
      <div style={styles.menuWrap}>
        <div style={styles.menuLabel}>[GAME_SYS]</div>
        <h2 style={styles.menuTitle}>ADMISSION BOUNCER</h2>
        <p style={styles.menuDesc}>
          You are the kube-apiserver admission controller. Pods arrive at the door — you enforce
          the security policy. Swipe right to ADMIT. Swipe left to DENY. Wrong calls cost lives.
          Eight levels of escalating Kubernetes security rules.
        </p>
        {progress && (
          <div style={styles.menuStats}>
            <span>HIGH SCORE: {progress.highScore.toLocaleString()}</span>
            <span>BEST LEVEL: {progress.highestLevel}</span>
            <span>PLAYS: {progress.totalPlays}</span>
          </div>
        )}
        <div style={styles.menuControls}>
          <span><kbd style={styles.menuKbd}>←</kbd> DENY</span>
          <span><kbd style={styles.menuKbd}>→</kbd> ADMIT</span>
          <span style={styles.menuControlsHint}>or swipe the card</span>
        </div>
        <button style={styles.menuBtn} onClick={handleStartGame}>
          Start Game
        </button>
      </div>
    );
  }

  // ── Render: Level intro ─────────────────────────────────────────────────────
  if (core.phase === 'level-intro' && levelConfig) {
    return (
      <LevelIntro
        level={core.level}
        title={levelConfig.title}
        description={levelConfig.intro}
        onBegin={handleBeginLevel}
      />
    );
  }

  // ── Render: Game over ───────────────────────────────────────────────────────
  if (core.phase === 'game-over') {
    return (
      <GameOver
        score={core.score}
        level={core.level}
        totalCorrect={core.totalCorrect}
        totalAttempts={core.totalAttempts}
        onPlayAgain={handlePlayAgain}
        levelLabel="LEVEL"
      />
    );
  }

  // ── Render: Level complete ──────────────────────────────────────────────────
  if (core.phase === 'level-complete') {
    return (
      <LevelComplete
        level={core.level}
        totalLevels={TOTAL_LEVELS}
        score={core.score}
        onNext={handleNextLevel}
      />
    );
  }

  // ── Render: Playing ─────────────────────────────────────────────────────────
  if (!levelConfig || !currentScenario) return null;

  const scenariosLeft = bouncer.scenarios.length - bouncer.currentIndex;

  return (
    <div style={styles.playWrap}>
      <HUD
        score={core.score}
        level={core.level}
        totalLevels={TOTAL_LEVELS}
        lives={core.lives}
        maxLives={core.maxLives}
        streak={core.streak}
        timeRemaining={core.timeRemaining}
        queueLength={scenariosLeft}
      />

      <div style={styles.gameLayout}>
        {/* Left: policy panel + progress */}
        <div style={styles.policyCol}>
          <PolicyPanel
            policyName={levelConfig.policyName}
            rules={levelConfig.rules}
            highlightRuleId={bouncer.highlightRuleId}
          />
          <div style={styles.progressBlock}>
            <div style={styles.progressLabel}>
              <span>REVIEWED</span>
              <span>{bouncer.currentIndex} / {bouncer.scenarios.length}</span>
            </div>
            <div style={styles.progressBar}>
              <div style={{
                ...styles.progressFill,
                width: `${(bouncer.currentIndex / bouncer.scenarios.length) * 100}%`,
              }} />
            </div>
          </div>
          <div style={styles.shortcutHint}>
            <span style={styles.shortcutKey}>← A</span>
            <span style={styles.shortcutLabel}>deny</span>
            <span style={styles.shortcutSep}>·</span>
            <span style={styles.shortcutLabel}>admit</span>
            <span style={styles.shortcutKey}>D →</span>
          </div>
        </div>

        {/* Right: swipe card */}
        <div style={styles.cardCol}>
          <SwipeCard
            key={`${core.level}-${bouncer.currentIndex}`}
            cardKey={`${core.level}-${bouncer.currentIndex}`}
            scenario={currentScenario}
            onVerdict={handleVerdict}
            disabled={allScenariosComplete}
          />
        </div>
      </div>

      {/* Wrong-answer reveal overlay */}
      {revealScenario && (
        <RevealOverlay
          scenario={revealScenario}
          isRetry={revealIsRetry}
          onDismiss={handleDismissReveal}
        />
      )}

      {/* Correct-answer toast */}
      {correctToast && (
        <div style={{
          ...styles.correctToast,
          borderColor: '#4ade80',
          color: '#4ade80',
        }}>
          {correctToast}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  menuWrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '4rem 2rem',
    textAlign: 'center' as const,
    fontFamily: "'JetBrains Mono', monospace",
  },
  menuLabel: {
    fontSize: '0.625rem',
    fontWeight: 700,
    letterSpacing: '0.15em',
    color: 'var(--color-accent)',
    marginBottom: '0.5rem',
  },
  menuTitle: {
    fontSize: '2rem',
    fontWeight: 700,
    color: 'var(--color-primary)',
    letterSpacing: '0.05em',
    marginBottom: '1rem',
  },
  menuDesc: {
    fontSize: '0.875rem',
    lineHeight: 1.7,
    color: 'var(--color-primary-muted)',
    maxWidth: '50ch',
    marginBottom: '1.5rem',
  },
  menuStats: {
    display: 'flex',
    gap: '1.5rem',
    fontSize: '0.625rem',
    letterSpacing: '0.1em',
    color: 'var(--color-primary-subtle)',
    marginBottom: '1.5rem',
    textTransform: 'uppercase' as const,
    flexWrap: 'wrap' as const,
    justifyContent: 'center',
  },
  menuControls: {
    display: 'flex',
    gap: '1.25rem',
    fontSize: '0.6875rem',
    color: 'var(--color-primary-muted)',
    marginBottom: '2rem',
    alignItems: 'center',
    fontFamily: "'JetBrains Mono', monospace",
  },
  menuControlsHint: {
    color: 'var(--color-primary-subtle)',
    fontSize: '0.625rem',
  },
  menuKbd: {
    display: 'inline-block',
    fontSize: '0.6875rem',
    fontFamily: "'JetBrains Mono', monospace",
    padding: '0.05rem 0.35rem',
    border: '1px solid var(--color-primary-subtle)',
    borderRadius: '2px',
    color: 'var(--color-primary-subtle)',
    marginRight: '0.3rem',
  },
  menuBtn: {
    padding: '0.75rem 2.5rem',
    background: 'var(--color-primary)',
    border: 'none',
    borderRadius: '2px',
    color: 'var(--color-bg)',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.875rem',
    fontWeight: 700,
    letterSpacing: '0.1em',
    textTransform: 'uppercase' as const,
    cursor: 'pointer',
  },
  playWrap: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '1rem',
    fontFamily: "'JetBrains Mono', monospace",
    position: 'relative' as const,
  },
  gameLayout: {
    display: 'grid',
    gridTemplateColumns: '260px 1fr',
    gap: '1.5rem',
    alignItems: 'start',
  },
  policyCol: {
    position: 'sticky' as const,
    top: '4.5rem',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.75rem',
  },
  cardCol: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '1.5rem 0',
  },
  progressBlock: {
    fontFamily: "'JetBrains Mono', monospace",
  },
  progressLabel: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '0.5rem',
    letterSpacing: '0.1em',
    textTransform: 'uppercase' as const,
    color: 'var(--color-primary-subtle)',
    marginBottom: '0.375rem',
  },
  progressBar: {
    height: '3px',
    background: 'var(--color-border)',
    borderRadius: '2px',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    background: 'var(--color-primary)',
    borderRadius: '2px',
    transition: 'width 0.4s ease',
  },
  shortcutHint: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    padding: '0.5rem',
    fontSize: '0.5625rem',
    letterSpacing: '0.08em',
    color: 'var(--color-primary-subtle)',
    border: '1px solid var(--color-border)',
    borderRadius: '3px',
  },
  shortcutKey: {
    color: 'var(--color-primary-muted)',
    fontWeight: 700,
    fontSize: '0.5rem',
  },
  shortcutLabel: {
    textTransform: 'uppercase' as const,
    fontSize: '0.5rem',
  },
  shortcutSep: {
    flex: 1,
    textAlign: 'center' as const,
  },
  correctToast: {
    position: 'fixed' as const,
    bottom: '1.5rem',
    right: '1.5rem',
    padding: '0.625rem 1.25rem',
    background: 'var(--color-bg-elevated)',
    border: '1px solid',
    borderRadius: '3px',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.875rem',
    fontWeight: 900,
    letterSpacing: '0.2em',
    zIndex: 40,
  },
};
