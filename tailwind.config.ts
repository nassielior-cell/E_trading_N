import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/features/**/*.{js,ts,jsx,tsx,mdx}',
    './src/lib/**/*.{js,ts,jsx,tsx,mdx}',
    './src/models/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: '#F7F8FA',
        surface: '#FFFFFF',
        muted: '#F0F2F5',
        border: '#D9DEE7',
        ink: '#17202A',
        subtle: '#667085',
        primary: '#2563EB',
        success: '#16A34A',
        successSoft: '#DCFCE7',
        danger: '#DC2626',
        dangerSoft: '#FEE2E2',
      },
      boxShadow: {
        soft: '0 1px 3px rgba(16, 24, 40, 0.08)',
      },
    },
  },
  plugins: [],
};

export default config;
