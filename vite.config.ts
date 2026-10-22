/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // GitHub Pages serves the app from /Gift-List/; Vercel (which sets VERCEL=1
  // while building) serves it from the root of its own domain.
  base: process.env.VERCEL ? '/' : '/Gift-List/',
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'supabase/functions/**/*.test.ts'],
  },
});
