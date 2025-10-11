export interface LabProgress {
  labSlug: string;
  currentStep: number;
  completedSteps: number[];
  startedAt: string;
  lastActivity: string;
  totalSteps?: number;
}

export interface LabStepInfo {
  stepNumber: number;
  branchName: string;
  title?: string;
  isCompleted: boolean;
  isCurrent: boolean;
  isLocked: boolean;
}

export class LabProgressManager {
  private readonly storageKey = 'lab-progress';

  private getStorage(): Record<string, LabProgress> {
    if (typeof localStorage === 'undefined') return {};

    try {
      const stored = localStorage.getItem(this.storageKey);
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  }

  private setStorage(data: Record<string, LabProgress>): void {
    if (typeof localStorage === 'undefined') return;

    try {
      localStorage.setItem(this.storageKey, JSON.stringify(data));
    } catch (error) {
      console.warn('Failed to save lab progress:', error);
    }
  }

  getProgress(labSlug: string): LabProgress | null {
    const storage = this.getStorage();
    return storage[labSlug] || null;
  }

  initializeProgress(labSlug: string, totalSteps: number): LabProgress {
    const existing = this.getProgress(labSlug);
    if (existing) {
      // Update total steps if it has changed
      if (existing.totalSteps !== totalSteps) {
        existing.totalSteps = totalSteps;
        this.updateProgress(existing);
      }
      return existing;
    }

    const newProgress: LabProgress = {
      labSlug,
      currentStep: 1,
      completedSteps: [],
      startedAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      totalSteps
    };

    this.updateProgress(newProgress);
    return newProgress;
  }

  private updateProgress(progress: LabProgress): void {
    const storage = this.getStorage();
    progress.lastActivity = new Date().toISOString();
    storage[progress.labSlug] = progress;
    this.setStorage(storage);
  }

  setCurrentStep(labSlug: string, step: number): void {
    const progress = this.getProgress(labSlug);
    if (!progress) return;

    progress.currentStep = step;
    this.updateProgress(progress);
  }

  markStepComplete(labSlug: string, step: number): void {
    const progress = this.getProgress(labSlug);
    if (!progress) return;

    if (!progress.completedSteps.includes(step)) {
      progress.completedSteps.push(step);
      progress.completedSteps.sort((a, b) => a - b);
    }

    // Auto-advance to next step if not already ahead
    if (progress.currentStep === step && progress.totalSteps) {
      const nextStep = step + 1;
      if (nextStep <= progress.totalSteps) {
        progress.currentStep = nextStep;
      }
    }

    this.updateProgress(progress);
  }

  markStepIncomplete(labSlug: string, step: number): void {
    const progress = this.getProgress(labSlug);
    if (!progress) return;

    progress.completedSteps = progress.completedSteps.filter(s => s !== step);
    this.updateProgress(progress);
  }

  resetProgress(labSlug: string): void {
    const storage = this.getStorage();
    delete storage[labSlug];
    this.setStorage(storage);
  }

  getAllProgress(): Record<string, LabProgress> {
    return this.getStorage();
  }

  getProgressPercentage(labSlug: string): number {
    const progress = this.getProgress(labSlug);
    if (!progress || !progress.totalSteps) return 0;

    return Math.round((progress.completedSteps.length / progress.totalSteps) * 100);
  }

  generateStepInfo(
    labSlug: string,
    totalSteps: number,
    stepTitles?: string[]
  ): LabStepInfo[] {
    const progress = this.getProgress(labSlug) || this.initializeProgress(labSlug, totalSteps);

    return Array.from({ length: totalSteps }, (_, index) => {
      const stepNumber = index + 1;
      const isCompleted = progress.completedSteps.includes(stepNumber);
      const isCurrent = progress.currentStep === stepNumber;
      const isLocked = stepNumber > progress.currentStep && !isCompleted;

      return {
        stepNumber,
        branchName: `branch-${stepNumber}`,
        title: stepTitles?.[index],
        isCompleted,
        isCurrent,
        isLocked
      };
    });
  }

  // Analytics/tracking methods
  trackStepStarted(labSlug: string, step: number): void {
    // In a real implementation, this would send analytics data
    console.log(`Lab ${labSlug}: Started step ${step}`);
    this.setCurrentStep(labSlug, step);
  }

  trackStepCompleted(labSlug: string, step: number): void {
    // In a real implementation, this would send analytics data
    console.log(`Lab ${labSlug}: Completed step ${step}`);
    this.markStepComplete(labSlug, step);
  }

  exportProgress(): string {
    return JSON.stringify(this.getStorage(), null, 2);
  }

  importProgress(data: string): void {
    try {
      const parsed = JSON.parse(data);
      this.setStorage(parsed);
    } catch (error) {
      throw new Error('Invalid progress data format');
    }
  }
}

// Default instance for convenience
export const labProgress = new LabProgressManager();