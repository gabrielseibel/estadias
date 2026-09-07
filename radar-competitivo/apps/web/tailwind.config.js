/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#07090f', 900: '#0b0e16', 850: '#101522', 800: '#151b2b',
          700: '#1e2637', 600: '#2a3346', 500: '#3b4658', 400: '#5d6980',
          300: '#8b95ab', 200: '#b9c1d1', 100: '#dfe4ed', 50: '#f4f6fa',
        },
        radar: {
          50: '#eefbf6', 100: '#d3f5e7', 200: '#a8ebd2', 300: '#6edcb8',
          400: '#34c79a', 500: '#12ad81', 600: '#068b69', 700: '#056f56',
          800: '#075846', 900: '#07483b',
        },
        signal: {
          critical: '#f4436c', high: '#ff8a3d', medium: '#f4c33d',
          low: '#4cc38a', info: '#4b9dfa', neutral: '#8b95ab',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        panel: '0 1px 2px rgba(3,7,18,0.06), 0 12px 32px -12px rgba(3,7,18,0.18)',
        lift: '0 2px 4px rgba(3,7,18,0.05), 0 24px 48px -20px rgba(3,7,18,0.28)',
      },
      keyframes: {
        'fade-up': { '0%': { opacity: '0', transform: 'translateY(6px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        'pulse-ring': { '0%': { transform: 'scale(0.9)', opacity: '0.7' }, '100%': { transform: 'scale(1.6)', opacity: '0' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
      },
      animation: {
        'fade-up': 'fade-up .35s cubic-bezier(.2,.7,.3,1) both',
        'pulse-ring': 'pulse-ring 1.8s cubic-bezier(.2,.7,.3,1) infinite',
        shimmer: 'shimmer 1.6s infinite',
      },
    },
  },
  plugins: [],
}
