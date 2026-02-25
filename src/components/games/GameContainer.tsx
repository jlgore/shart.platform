import { createElement, lazy, Suspense } from 'react';
import type { CSSProperties, LazyExoticComponent, ComponentType } from 'react';

const GAME_REGISTRY: Record<string, LazyExoticComponent<ComponentType>> = {
  'k8s-scheduler': lazy(() => import('./scheduler/SchedulerGame.tsx')),
  'k8s-admission-bouncer': lazy(() => import('./admission-bouncer/BouncerGame.tsx')),
};

interface GameContainerProps {
  gameId: string;
}

// Using createElement instead of JSX here because this is the Astro client:only
// entry point — Vite may pre-bundle it before the Babel JSX transform runs.
export default function GameContainer({ gameId }: GameContainerProps) {
  const GameComponent = GAME_REGISTRY[gameId];

  if (!GameComponent) {
    return createElement('div', { style: styles.error },
      createElement('span', { style: styles.errorLabel }, '[ERROR]'),
      createElement('p', null, `Unknown game: ${gameId}`),
    );
  }

  return createElement(Suspense, {
    fallback: createElement('div', { style: styles.loading },
      createElement('span', { style: styles.loadingDot }, '\u25CF'),
      createElement('span', null, 'Loading game...'),
    ),
  }, createElement(GameComponent, null));
}

const styles: Record<string, CSSProperties> = {
  loading: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '1rem',
    padding: '4rem',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.875rem',
    color: 'var(--color-primary-muted)',
  },
  loadingDot: {
    fontSize: '1.5rem',
    color: 'var(--color-primary)',
    animation: 'breathe 2s ease-in-out infinite',
  },
  error: {
    padding: '2rem',
    fontFamily: "'JetBrains Mono', monospace",
    color: 'var(--color-error)',
    textAlign: 'center',
  },
  errorLabel: {
    fontSize: '0.625rem',
    fontWeight: 700,
    letterSpacing: '0.1em',
  },
};
