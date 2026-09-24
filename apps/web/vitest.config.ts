import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // `server-only` is a Next.js build-time marker: importing it from a
      // Client Component is meant to fail the build. It has no runtime, so
      // Vite cannot resolve it and every test touching a server-only module
      // died on import — rateLimit.test.ts reported "no tests" rather than a
      // failure, which reads like a pass in CI. Stub it so the module graph
      // resolves; the guarantee it provides is enforced by `next build`, not
      // by the test runner.
      'server-only': path.resolve(__dirname, 'src/test/serverOnlyStub.ts'),
    },
  },
});
