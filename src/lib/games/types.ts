export type GamePhase =
  | 'menu'
  | 'level-intro'
  | 'playing'
  | 'paused'
  | 'level-complete'
  | 'game-over';

export interface FeedbackMessage {
  type: 'success' | 'error';
  title: string;
  body: string;
  details?: string;
  ruleViolated?: string;
}

export interface CoreGameState {
  phase: GamePhase;
  level: number;
  score: number;
  lives: number;
  maxLives: number;
  streak: number;
  timeRemaining: number | null;
  feedback: FeedbackMessage | null;
  totalCorrect: number;
  totalAttempts: number;
}

export type CoreAction =
  | { type: 'START_GAME' }
  | { type: 'START_LEVEL'; timeLimit: number | null }
  | { type: 'CORRECT_ANSWER'; points: number; feedback: FeedbackMessage }
  | { type: 'SUBOPTIMAL_ANSWER'; points: number }
  | { type: 'WRONG_ANSWER'; feedback: FeedbackMessage }
  | { type: 'DISMISS_FEEDBACK' }
  | { type: 'LEVEL_COMPLETE' }
  | { type: 'TICK' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' };

export const INITIAL_LIVES = 3;
export const STREAK_BONUS_THRESHOLD = 3;
export const STREAK_BONUS_MULTIPLIER = 1.5;
