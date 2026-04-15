/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Semantic status palette — matches Fluent Teams tokens where possible.
        status: {
          available: '#107C10',
          pending: '#F7B500',
          leased: '#D13438',
          renewal: '#E08A00',
          locked: '#8A8886',
          expired: '#605E5C',
        },
      },
    },
  },
  plugins: [],
  // Fluent UI ships its own reset; keep Tailwind preflight off to avoid collisions.
  corePlugins: {
    preflight: false,
  },
};
