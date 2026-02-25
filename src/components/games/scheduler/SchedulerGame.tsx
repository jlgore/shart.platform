import React, { useReducer, useCallback, useEffect, useRef, useState } from 'react';
import type { CoreGameState, CoreAction } from '../../../lib/games/types';
import type { SchedulerGameState, SchedulerAction, GameNode, GamePod } from '../../../lib/games/scheduler/types';
import { createInitialCoreState, coreReducer } from '../../../lib/games/engine';
import { getWaveConfig, generateWave, generatePenaltyPods, getPenaltyCount } from '../../../lib/games/scheduler/rounds';
import { validatePlacement, getValidNodes, getSuboptimalReason } from '../../../lib/games/scheduler/validator';
import { getFailureFeedback, getSuccessFeedback } from '../../../lib/games/scheduler/feedback';
import { gameProgress } from '../../../lib/games/progress';
import { HUD, FeedbackOverlay, GameOver } from '../GameShell';
import { PodQueue } from './PodQueue';
import { ClusterView } from './ClusterView';
import { PodYamlModal } from './PodYamlModal';

interface CombinedState {
  core: CoreGameState;
  scheduler: SchedulerGameState;
}

type CombinedAction = CoreAction | SchedulerAction;

function createInitialSchedulerState(): SchedulerGameState {
  return {
    nodes: [],
    podQueue: [],
    draggingPodIndex: null,
    placedCount: 0,
    activeIndex: null,
    penaltyBuffer: [],
  };
}

function schedulerReducer(state: SchedulerGameState, action: CombinedAction): SchedulerGameState {
  switch (action.type) {
    case 'INIT_ROUND':
      return {
        nodes: (action as { type: 'INIT_ROUND'; nodes: GameNode[]; pods: GamePod[] }).nodes,
        podQueue: (action as { type: 'INIT_ROUND'; nodes: GameNode[]; pods: GamePod[] }).pods,
        draggingPodIndex: null,
        placedCount: 0,
        activeIndex: 0,
        penaltyBuffer: [],
      };

    case 'DRAG_START':
      return {
        ...state,
        draggingPodIndex: (action as { type: 'DRAG_START'; podIndex: number }).podIndex,
      };

    case 'DRAG_END':
      return { ...state, draggingPodIndex: null };

    case 'DROP_POD': {
      const a = action as { type: 'DROP_POD'; nodeIndex: number; podIndex: number };
      const pod = state.podQueue[a.podIndex];
      if (!pod) return state;

      const updatedNodes = state.nodes.map((n, i) => {
        if (i !== a.nodeIndex) return n;
        return {
          ...n,
          allocated: {
            cpu: n.allocated.cpu + pod.resources.cpu,
            memory: n.allocated.memory + pod.resources.memory,
          },
          pods: [...n.pods, pod],
        };
      });

      const updatedQueue = state.podQueue.filter((_, i) => i !== a.podIndex);

      return {
        ...state,
        nodes: updatedNodes,
        podQueue: updatedQueue,
        draggingPodIndex: null,
        placedCount: state.placedCount + 1,
        activeIndex: updatedQueue.length > 0 ? 0 : null,
        penaltyBuffer: state.penaltyBuffer,
      };
    }

    case 'WRONG_DROP_PENALTY': {
      const a = action as { type: 'WRONG_DROP_PENALTY'; podIndex: number; penaltyPods: GamePod[] };
      const failedPod = state.podQueue[a.podIndex];
      const withoutFailed = state.podQueue.filter((_, i) => i !== a.podIndex);

      // Recycle the failed pod back into the queue once so the player must place it correctly
      const recycledPod: GamePod | null = failedPod && !failedPod.retriedOnce
        ? { ...failedPod, retriedOnce: true }
        : null;

      const baseQueue = [...a.penaltyPods, ...withoutFailed];
      let newQueue: GamePod[];
      if (recycledPod) {
        const insertAt = Math.min(3, baseQueue.length);
        newQueue = [
          ...baseQueue.slice(0, insertAt),
          recycledPod,
          ...baseQueue.slice(insertAt),
        ];
      } else {
        newQueue = baseQueue;
      }

      return {
        ...state,
        podQueue: newQueue,
        activeIndex: newQueue.length > 0 ? 0 : null,
        penaltyBuffer: [],
      };
    }

    case 'NEXT_WAVE': {
      const a = action as { type: 'NEXT_WAVE'; nodes: GameNode[]; pods: GamePod[] };
      return {
        nodes: a.nodes,
        podQueue: a.pods,
        draggingPodIndex: null,
        placedCount: 0,
        activeIndex: 0,
        penaltyBuffer: [],
      };
    }

    default:
      return state;
  }
}

function combinedReducer(state: CombinedState, action: CombinedAction): CombinedState {
  if (action.type === 'NEXT_WAVE') {
    const nextWave = state.core.level + 1;
    const a = action as { type: 'NEXT_WAVE'; nodes: GameNode[]; pods: GamePod[] };
    return {
      core: {
        ...state.core,
        level: nextWave,
        timeRemaining: getWaveConfig(nextWave).timeLimit,
        feedback: null,
      },
      scheduler: schedulerReducer(state.scheduler, a),
    };
  }

  return {
    core: coreReducer(state.core, action as CoreAction),
    scheduler: schedulerReducer(state.scheduler, action),
  };
}

export default function SchedulerGame() {
  const [state, dispatch] = useReducer(combinedReducer, {
    core: createInitialCoreState(),
    scheduler: createInitialSchedulerState(),
  });

  const { core, scheduler } = state;
  const timerRef = useRef<number | null>(null);
  const [hoverNodeIndex, setHoverNodeIndex] = useState<number | null>(null);
  const [waveFlash, setWaveFlash] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [warningToast, setWarningToast] = useState<{ title: string; explanation: string } | null>(null);
  const [penaltyFlash, setPenaltyFlash] = useState<number>(0);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const [inspectPodIndex, setInspectPodIndex] = useState<number | null>(null);

  // Stable session seed — different each play, consistent within a session
  const sessionSeedRef = useRef(Math.floor(Math.random() * 99991) + 1);

  // Ref for always-current drop handler (avoids stale closures in pointer event listeners)
  const dropHandlerRef = useRef<((nodeIndex: number) => void) | null>(null);
  dropHandlerRef.current = (nodeIndex: number) => {
    const podIndex = scheduler.draggingPodIndex;
    if (podIndex === null) return;

    const pod = scheduler.podQueue[podIndex];
    const node = scheduler.nodes[nodeIndex];
    if (!pod || !node) return;

    const result = validatePlacement(pod, node, scheduler.nodes);
    const config = getWaveConfig(core.level);

    if (result.valid) {
      const suboptimal = getSuboptimalReason(pod, node, scheduler.nodes);
      dispatch({ type: 'DROP_POD', nodeIndex, podIndex });

      if (suboptimal) {
        const reducedPoints = Math.round(config.pointsPerPod * 0.35);
        dispatch({ type: 'SUBOPTIMAL_ANSWER', points: reducedPoints });
        setWarningToast({ title: suboptimal.title, explanation: suboptimal.explanation });
      } else {
        const feedback = getSuccessFeedback(pod.name, node.name);
        dispatch({ type: 'CORRECT_ANSWER', points: config.pointsPerPod, feedback });
        setToast(`${pod.name} \u2192 ${node.name}`);
        dispatch({ type: 'DISMISS_FEEDBACK' });
      }
    } else {
      const feedback = getFailureFeedback(result.reason!, result.details || result.message || '');
      const penaltyPods = generatePenaltyPods(pod, getPenaltyCount(core.level), core.level, Date.now());
      dispatch({ type: 'WRONG_DROP_PENALTY', podIndex, penaltyPods });
      dispatch({ type: 'WRONG_ANSWER', feedback });
      setPenaltyFlash(penaltyPods.length);
    }
  };

  // Timer tick
  useEffect(() => {
    if (core.phase === 'playing' && core.timeRemaining !== null) {
      timerRef.current = window.setInterval(() => {
        dispatch({ type: 'TICK' });
      }, 1000);
    }
    return () => {
      if (timerRef.current !== null) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [core.phase, core.timeRemaining !== null]);

  // Save progress on game over
  useEffect(() => {
    if (core.phase === 'game-over') {
      const accuracy = core.totalAttempts > 0
        ? Math.round((core.totalCorrect / core.totalAttempts) * 100)
        : 0;
      gameProgress.saveGameResult('k8s-scheduler', {
        score: core.score,
        level: core.level,
        accuracy,
        totalCorrect: core.totalCorrect,
        totalAttempts: core.totalAttempts,
      });
    }
  }, [core.phase]);

  // Wave completion: queue emptied → show flash → start next wave
  useEffect(() => {
    if (
      core.phase === 'playing' &&
      core.feedback === null &&
      scheduler.podQueue.length === 0 &&
      scheduler.placedCount > 0
    ) {
      const nextWave = core.level + 1;
      setWaveFlash(nextWave);
      // Close inspect modal if open during wave transition
      setInspectPodIndex(null);

      const timer = window.setTimeout(() => {
        setWaveFlash(null);
        const { nodes, pods } = generateWave(nextWave, sessionSeedRef.current);
        dispatch({ type: 'NEXT_WAVE', nodes, pods });
      }, 1400);

      return () => window.clearTimeout(timer);
    }
  }, [core.phase, core.feedback, scheduler.podQueue.length, scheduler.placedCount, core.level]);

  // Auto-dismiss toasts
  useEffect(() => {
    if (toast === null) return;
    const timer = window.setTimeout(() => setToast(null), 1500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (warningToast === null) return;
    const timer = window.setTimeout(() => setWarningToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [warningToast]);

  // Clear penalty flash
  useEffect(() => {
    if (penaltyFlash === 0) return;
    const timer = window.setTimeout(() => setPenaltyFlash(0), 1200);
    return () => window.clearTimeout(timer);
  }, [penaltyFlash]);

  // Global pointer event listeners during drag
  useEffect(() => {
    if (scheduler.draggingPodIndex === null) {
      document.body.style.cursor = '';
      return;
    }

    document.body.style.cursor = 'grabbing';

    const findNodeIndex = (x: number, y: number): number | null => {
      const elements = document.elementsFromPoint(x, y);
      for (const el of elements) {
        const attr = (el as HTMLElement).dataset?.nodeIndex;
        if (attr !== undefined) {
          const idx = parseInt(attr, 10);
          return isNaN(idx) ? null : idx;
        }
      }
      return null;
    };

    const handlePointerMove = (e: PointerEvent) => {
      setDragPos({ x: e.clientX, y: e.clientY });
      setHoverNodeIndex(findNodeIndex(e.clientX, e.clientY));
    };

    const handlePointerUp = (e: PointerEvent) => {
      const nodeIndex = findNodeIndex(e.clientX, e.clientY);
      if (nodeIndex !== null) {
        dropHandlerRef.current?.(nodeIndex);
      }
      dispatch({ type: 'DRAG_END' });
      setHoverNodeIndex(null);
      setDragPos(null);
      document.body.style.cursor = '';
    };

    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
    document.addEventListener('pointercancel', handlePointerUp);

    return () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
      document.removeEventListener('pointercancel', handlePointerUp);
      document.body.style.cursor = '';
    };
  }, [scheduler.draggingPodIndex]);

  const handleStartGame = useCallback(() => {
    dispatch({ type: 'START_GAME' });
    const { nodes, pods } = generateWave(1, sessionSeedRef.current);
    dispatch({ type: 'INIT_ROUND', nodes, pods });
    dispatch({ type: 'START_LEVEL', timeLimit: getWaveConfig(1).timeLimit });
  }, []);

  const handlePointerDown = useCallback((podIndex: number, e: React.PointerEvent) => {
    e.preventDefault();
    dispatch({ type: 'DRAG_START', podIndex });
    setDragPos({ x: e.clientX, y: e.clientY });
  }, []);

  const handleInspect = useCallback((podIndex: number) => {
    setInspectPodIndex(podIndex);
  }, []);

  const handleDismissFeedback = useCallback(() => {
    dispatch({ type: 'DISMISS_FEEDBACK' });
  }, []);

  const handlePlayAgain = useCallback(() => {
    sessionSeedRef.current = Math.floor(Math.random() * 99991) + 1;
    dispatch({ type: 'START_GAME' });
    const { nodes, pods } = generateWave(1, sessionSeedRef.current);
    dispatch({ type: 'INIT_ROUND', nodes, pods });
    dispatch({ type: 'START_LEVEL', timeLimit: getWaveConfig(1).timeLimit });
  }, []);

  const validNodeIndices =
    scheduler.draggingPodIndex !== null
      ? getValidNodes(scheduler.podQueue[scheduler.draggingPodIndex], scheduler.nodes)
      : [];

  const draggingPod =
    scheduler.draggingPodIndex !== null
      ? scheduler.podQueue[scheduler.draggingPodIndex]
      : null;

  const inspectPod =
    inspectPodIndex !== null ? scheduler.podQueue[inspectPodIndex] : null;

  // ── Menu ────────────────────────────────────────────────────────────────
  if (core.phase === 'menu') {
    const progress = gameProgress.getProgress('k8s-scheduler');
    return (
      <div style={styles.menuWrap}>
        <div style={styles.menuLabel}>[GAME_SYS]</div>
        <h2 style={styles.menuTitle}>K8S SCHEDULER</h2>
        <p style={styles.menuDesc}>
          You are the kube-scheduler. Pods arrive in waves with constraints — resources, selectors,
          taints, affinities. Drag each pod onto the right worker node. Wrong placements lose a life
          but teach you real Kubernetes scheduling rules.
        </p>
        {progress && (
          <div style={styles.menuStats}>
            <span>HIGH SCORE: {progress.highScore.toLocaleString()}</span>
            <span>BEST WAVE: {progress.highestLevel}</span>
            <span>PLAYS: {progress.totalPlays}</span>
          </div>
        )}
        <button style={styles.menuBtn} onClick={handleStartGame}>
          Start Game
        </button>
      </div>
    );
  }

  // ── Game over ───────────────────────────────────────────────────────────
  if (core.phase === 'game-over') {
    return (
      <GameOver
        score={core.score}
        level={core.level}
        totalCorrect={core.totalCorrect}
        totalAttempts={core.totalAttempts}
        onPlayAgain={handlePlayAgain}
        levelLabel="WAVE"
      />
    );
  }

  // ── Playing ─────────────────────────────────────────────────────────────
  return (
    <div style={styles.playWrap}>
      <HUD
        score={core.score}
        level={core.level}
        lives={core.lives}
        maxLives={core.maxLives}
        streak={core.streak}
        timeRemaining={core.timeRemaining}
        queueLength={scheduler.podQueue.length}
      />

      {scheduler.draggingPodIndex === null && scheduler.podQueue.length > 0 && !waveFlash && (
        <div style={styles.hint}>
          Drag the active pod onto a node — or press <kbd style={styles.kbd}>i</kbd> to inspect its spec.
        </div>
      )}

      <div style={styles.gameGrid}>
        <div style={styles.podPanel}>
          <PodQueue
            key={core.level}
            pods={scheduler.podQueue}
            activeIndex={scheduler.activeIndex}
            draggingPodIndex={scheduler.draggingPodIndex}
            penaltyFlash={penaltyFlash}
            onPointerDown={handlePointerDown}
            onInspect={handleInspect}
          />
        </div>
        <div style={styles.clusterPanel}>
          <ClusterView
            nodes={scheduler.nodes}
            validNodeIndices={validNodeIndices}
            isDragActive={scheduler.draggingPodIndex !== null}
            hoverNodeIndex={hoverNodeIndex}
          />
        </div>
      </div>

      {/* Error feedback */}
      {core.feedback && core.feedback.type === 'error' && (
        <FeedbackOverlay feedback={core.feedback} onDismiss={handleDismissFeedback} />
      )}

      {/* YAML inspector modal */}
      {inspectPod && (
        <PodYamlModal pod={inspectPod} onClose={() => setInspectPodIndex(null)} />
      )}

      {/* Success toast */}
      {toast && (
        <div style={styles.toast}>
          <span style={styles.toastIcon}>{'\u2713'}</span> {toast}
        </div>
      )}

      {/* Suboptimal placement warning */}
      {warningToast && (
        <div style={styles.warningToast}>
          <div style={styles.warningToastHeader}>
            <span style={styles.warningToastIcon}>{'\u26A0'}</span>
            <span style={styles.warningToastTitle}>{warningToast.title}</span>
            <span style={styles.warningToastPenalty}>−65% pts</span>
          </div>
          <div style={styles.warningToastBody}>{warningToast.explanation}</div>
        </div>
      )}

      {/* Wave clear flash */}
      {waveFlash !== null && (
        <div style={styles.flashBackdrop}>
          <div style={styles.flashText}>WAVE {waveFlash - 1} CLEAR</div>
          <div style={styles.flashSub}>Wave {waveFlash} incoming&hellip;</div>
        </div>
      )}

      {/* Drag indicator */}
      {draggingPod && dragPos && (
        <div style={{ ...styles.dragIndicator, left: dragPos.x, top: dragPos.y }}>
          {draggingPod.name}
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
    marginBottom: '2rem',
    textTransform: 'uppercase' as const,
    flexWrap: 'wrap' as const,
    justifyContent: 'center',
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
    flexDirection: 'column',
    gap: '1rem',
    fontFamily: "'JetBrains Mono', monospace",
    position: 'relative' as const,
  },
  hint: {
    fontSize: '0.75rem',
    color: 'var(--color-primary-subtle)',
    textAlign: 'center' as const,
    padding: '0.5rem',
  },
  kbd: {
    display: 'inline-block',
    fontSize: '0.6875rem',
    fontFamily: "'JetBrains Mono', monospace",
    fontStyle: 'italic',
    padding: '0 0.25rem',
    border: '1px solid var(--color-primary-subtle)',
    borderRadius: '2px',
    color: 'var(--color-primary-subtle)',
  },
  gameGrid: {
    display: 'grid',
    gridTemplateColumns: '280px 1fr',
    gap: '1rem',
    alignItems: 'start',
  },
  podPanel: {
    position: 'sticky' as const,
    top: '4.5rem',
  },
  clusterPanel: {
    minWidth: 0,
  },
  toast: {
    position: 'fixed' as const,
    bottom: '1.5rem',
    right: '1.5rem',
    padding: '0.625rem 1rem',
    background: 'var(--color-bg-elevated)',
    border: '1px solid var(--color-primary)',
    borderRadius: '4px',
    color: 'var(--color-primary)',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.75rem',
    fontWeight: 600,
    zIndex: 40,
    boxShadow: '0 0 20px -4px color-mix(in srgb, var(--color-primary) 30%, transparent)',
  },
  toastIcon: {
    color: 'var(--color-primary)',
  },
  warningToast: {
    position: 'fixed' as const,
    bottom: '1.5rem',
    right: '1.5rem',
    maxWidth: '22rem',
    padding: '0.75rem 1rem',
    background: 'var(--color-bg-elevated)',
    border: '1px solid var(--color-accent)',
    borderRadius: '4px',
    fontFamily: "'JetBrains Mono', monospace",
    zIndex: 40,
    boxShadow: '0 0 24px -4px color-mix(in srgb, var(--color-accent) 30%, transparent)',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.4rem',
  },
  warningToastHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  warningToastIcon: {
    fontSize: '0.875rem',
    color: 'var(--color-accent)',
    flexShrink: 0,
  },
  warningToastTitle: {
    fontSize: '0.75rem',
    fontWeight: 700,
    color: 'var(--color-accent)',
    letterSpacing: '0.05em',
    flex: 1,
  },
  warningToastPenalty: {
    fontSize: '0.5625rem',
    fontWeight: 700,
    color: 'var(--color-accent-muted)',
    letterSpacing: '0.08em',
    flexShrink: 0,
  },
  warningToastBody: {
    fontSize: '0.625rem',
    lineHeight: 1.6,
    color: 'var(--color-primary-muted)',
  },
  flashBackdrop: {
    position: 'fixed' as const,
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.75rem',
    background: 'rgba(0,0,0,0.65)',
    zIndex: 50,
  },
  flashText: {
    fontSize: '3rem',
    fontWeight: 700,
    letterSpacing: '0.2em',
    color: 'var(--color-primary)',
    fontFamily: "'JetBrains Mono', monospace",
    textTransform: 'uppercase' as const,
  },
  flashSub: {
    fontSize: '0.875rem',
    letterSpacing: '0.1em',
    color: 'var(--color-primary-muted)',
    fontFamily: "'JetBrains Mono', monospace",
  },
  dragIndicator: {
    position: 'fixed' as const,
    pointerEvents: 'none' as const,
    background: 'var(--color-bg-elevated)',
    border: '1px solid var(--color-primary)',
    borderRadius: '4px',
    padding: '0.25rem 0.625rem',
    fontSize: '0.75rem',
    fontFamily: "'JetBrains Mono', monospace",
    color: 'var(--color-primary)',
    fontWeight: 600,
    zIndex: 100,
    transform: 'translate(-50%, calc(-100% - 8px))',
    boxShadow: '0 0 16px -4px color-mix(in srgb, var(--color-primary) 30%, transparent)',
    whiteSpace: 'nowrap' as const,
  },
};
