export interface GameResult {
  score: number;
  level: number;
  accuracy: number;
  totalCorrect: number;
  totalAttempts: number;
  completedAt: string;
}

export interface GameProgress {
  gameId: string;
  highScore: number;
  highestLevel: number;
  totalPlays: number;
  bestAccuracy: number;
  recentResults: GameResult[];
}

export class GameProgressManager {
  private readonly storageKey = 'game-progress';

  private getStorage(): Record<string, GameProgress> {
    if (typeof localStorage === 'undefined') return {};
    try {
      const stored = localStorage.getItem(this.storageKey);
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  }

  private setStorage(data: Record<string, GameProgress>): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(data));
    } catch (error) {
      console.warn('Failed to save game progress:', error);
    }
  }

  getProgress(gameId: string): GameProgress | null {
    return this.getStorage()[gameId] || null;
  }

  saveGameResult(gameId: string, result: Omit<GameResult, 'completedAt'>): GameProgress {
    const storage = this.getStorage();
    const existing = storage[gameId];
    const fullResult: GameResult = { ...result, completedAt: new Date().toISOString() };

    const progress: GameProgress = existing
      ? {
          ...existing,
          highScore: Math.max(existing.highScore, result.score),
          highestLevel: Math.max(existing.highestLevel, result.level),
          totalPlays: existing.totalPlays + 1,
          bestAccuracy: Math.max(existing.bestAccuracy, result.accuracy),
          recentResults: [fullResult, ...existing.recentResults].slice(0, 10),
        }
      : {
          gameId,
          highScore: result.score,
          highestLevel: result.level,
          totalPlays: 1,
          bestAccuracy: result.accuracy,
          recentResults: [fullResult],
        };

    storage[gameId] = progress;
    this.setStorage(storage);
    return progress;
  }

  resetProgress(gameId: string): void {
    const storage = this.getStorage();
    delete storage[gameId];
    this.setStorage(storage);
  }

  exportProgress(): string {
    return JSON.stringify(this.getStorage(), null, 2);
  }
}

export const gameProgress = new GameProgressManager();
