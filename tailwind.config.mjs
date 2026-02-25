/** @type {import('tailwindcss').Config} */
import typography from '@tailwindcss/typography';

export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Theme-aware colors using CSS custom properties
        'theme': {
          'primary': 'var(--color-primary)',
          'bright': 'var(--color-primary-bright)',
          'muted': 'var(--color-primary-muted)',
          'subtle': 'var(--color-primary-subtle)',
          'accent': 'var(--color-accent)',
          'accent-muted': 'var(--color-accent-muted)',
          'error': 'var(--color-error)',
          'bg': 'var(--color-bg)',
          'elevated': 'var(--color-bg-elevated)',
          'border': 'var(--color-border)',
        },
      },
      fontFamily: {
        'mono': ['JetBrains Mono', 'Fira Code', 'Cascadia Code', 'monospace'],
        'display': ['Orbitron', 'monospace'],
      },
      fontSize: {
        // Custom scale optimized for monospace readability
        'xs': ['0.75rem', { lineHeight: '1.5' }],      // 12px - meta, timestamps
        'sm': ['0.875rem', { lineHeight: '1.6' }],    // 14px - secondary text
        'base': ['1rem', { lineHeight: '1.7' }],      // 16px - body text
        'lg': ['1.125rem', { lineHeight: '1.6' }],    // 18px - lead text
        'xl': ['1.25rem', { lineHeight: '1.5' }],     // 20px - h3
        '2xl': ['1.5rem', { lineHeight: '1.4' }],     // 24px - h2
        '3xl': ['1.875rem', { lineHeight: '1.3' }],   // 30px - h1
        '4xl': ['2.25rem', { lineHeight: '1.2' }],    // 36px - display
        '5xl': ['3rem', { lineHeight: '1.1' }],       // 48px - hero
      },
      letterSpacing: {
        'tighter': '-0.02em',
        'tight': '-0.01em',
        'normal': '0',
        'wide': '0.02em',
        'wider': '0.05em',
        'widest': '0.1em',
        'terminal': '0.05em',  // Slight spacing for terminal feel
      },
      animation: {
        'glow': 'glow 2s ease-in-out infinite alternate',
        'breathe': 'breathe 4s ease-in-out infinite',
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'float': 'float 6s ease-in-out infinite',
        'scan': 'scan 8s linear infinite',
        'flicker': 'flicker 3s linear infinite',
        'typing': 'typing 3.5s steps(40, end), blink-caret .75s step-end infinite',
      },
      keyframes: {
        glow: {
          '0%': { textShadow: '0 0 10px var(--color-primary), 0 0 20px var(--color-primary), 0 0 30px var(--color-primary)' },
          '100%': { textShadow: '0 0 20px var(--color-primary), 0 0 30px var(--color-primary), 0 0 40px var(--color-primary)' }
        },
        breathe: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.35' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-20px)' },
        },
        scan: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' },
        },
        flicker: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.8' },
        },
        typing: {
          'from': { width: '0' },
          'to': { width: '100%' },
        },
        'blink-caret': {
          'from, to': { borderColor: 'transparent' },
          '50%': { borderColor: 'var(--color-primary)' },
        },
      },
      backgroundImage: {
        'grid-pattern': 'linear-gradient(rgba(0, 255, 65, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 255, 65, 0.1) 1px, transparent 1px)',
        'cyber-gradient': 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        'matrix-rain': 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0, 255, 0, 0.03) 2px, rgba(0, 255, 0, 0.03) 4px)',
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [
    typography,
  ],
}
