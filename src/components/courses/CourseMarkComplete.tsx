import React, { useState } from 'react';

interface Props {
  courseSlug: string;
  docPath: string;
  initialCompleted: boolean;
  isLoggedIn: boolean;
  apiBase: string;
}

export default function CourseMarkComplete({
  courseSlug,
  docPath,
  initialCompleted,
  isLoggedIn,
  apiBase,
}: Props) {
  const [completed, setCompleted] = useState(initialCompleted);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isLoggedIn) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' } as React.CSSProperties}>
        <a
          href="/auth/login"
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '0.8rem',
            color: 'var(--color-primary-muted)',
            textDecoration: 'none',
          } as React.CSSProperties}
        >
          Log in to track progress
        </a>
      </div>
    );
  }

  async function toggle() {
    if (loading) return;
    const nextCompleted = !completed;
    setCompleted(nextCompleted);
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `${apiBase}/api/courses/${encodeURIComponent(courseSlug)}/progress/mark`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ doc_path: docPath, completed: nextCompleted }),
        }
      );

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch {
      setCompleted(!nextCompleted);
      setError('Failed to save. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' } as React.CSSProperties}>
      <button
        type="button"
        onClick={toggle}
        disabled={loading}
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '0.8rem',
          padding: '0.35rem 0.8rem',
          border: '1px solid',
          borderColor: completed ? '#4ade80' : 'var(--color-border)',
          borderRadius: '4px',
          background: completed ? 'rgba(74, 222, 128, 0.08)' : 'var(--color-bg-elevated)',
          color: completed ? '#4ade80' : 'var(--color-primary-muted)',
          cursor: loading ? 'not-allowed' : 'pointer',
          opacity: loading ? 0.6 : 1,
          transition: 'border-color 0.15s, color 0.15s, background 0.15s',
        } as React.CSSProperties}
      >
        {completed ? 'Completed ✓' : 'Mark complete'}
      </button>
      {error && (
        <span
          style={{ fontSize: '0.75rem', color: 'var(--color-error)' } as React.CSSProperties}
        >
          {error}
        </span>
      )}
    </div>
  );
}
