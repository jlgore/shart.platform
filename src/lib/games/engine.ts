import type { CoreGameState, CoreAction } from './types';
import { INITIAL_LIVES, STREAK_BONUS_THRESHOLD, STREAK_BONUS_MULTIPLIER } from './types';

export function createInitialCoreState(): CoreGameState {
  return {
    phase: 'menu',
    level: 1,
    score: 0,
    lives: INITIAL_LIVES,
    maxLives: INITIAL_LIVES,
    streak: 0,
    timeRemaining: null,
    feedback: null,
    totalCorrect: 0,
    totalAttempts: 0,
  };
}

export function coreReducer(state: CoreGameState, action: CoreAction): CoreGameState {
  switch (action.type) {
    case 'START_GAME':
      return {
        ...createInitialCoreState(),
        phase: 'level-intro',
      };

    case 'START_LEVEL':
      return {
        ...state,
        phase: 'playing',
        timeRemaining: action.timeLimit,
        feedback: null,
      };

    case 'CORRECT_ANSWER': {
      const newStreak = state.streak + 1;
      const bonus = newStreak >= STREAK_BONUS_THRESHOLD ? STREAK_BONUS_MULTIPLIER : 1;
      const points = Math.round(action.points * bonus);
      return {
        ...state,
        score: state.score + points,
        streak: newStreak,
        feedback: action.feedback,
        totalCorrect: state.totalCorrect + 1,
        totalAttempts: state.totalAttempts + 1,
      };
    }

    case 'SUBOPTIMAL_ANSWER': {
      // Pod placed on a valid but wasteful node: partial points, streak reset, no life loss.
      return {
        ...state,
        score: state.score + action.points,
        streak: 0,
        feedback: null,
        totalCorrect: state.totalCorrect + 1,
        totalAttempts: state.totalAttempts + 1,
      };
    }

    case 'WRONG_ANSWER': {
      const newLives = state.lives - 1;
      return {
        ...state,
        lives: newLives,
        streak: 0,
        feedback: action.feedback,
        totalAttempts: state.totalAttempts + 1,
        phase: newLives <= 0 ? 'game-over' : state.phase,
      };
    }

    case 'DISMISS_FEEDBACK':
      return {
        ...state,
        feedback: null,
      };

    case 'LEVEL_COMPLETE':
      return {
        ...state,
        phase: 'level-complete',
        feedback: null,
      };

    case 'TICK': {
      if (state.timeRemaining === null || state.phase !== 'playing') return state;
      const next = state.timeRemaining - 1;
      if (next <= 0) {
        return { ...state, timeRemaining: 0, phase: 'game-over' };
      }
      return { ...state, timeRemaining: next };
    }

    case 'PAUSE':
      return state.phase === 'playing' ? { ...state, phase: 'paused' } : state;

    case 'RESUME':
      return state.phase === 'paused' ? { ...state, phase: 'playing' } : state;

    default:
      return state;
  }
}
