/**
 * Test-only stand-in for the `server-only` package.
 *
 * `server-only` exists purely so that `next build` fails when a server
 * module is pulled into a Client Component. It ships no runtime, so Vite
 * cannot resolve it and any test importing a server-only module died during
 * transform. vitest.config.ts aliases the package here.
 *
 * Not imported by application code.
 */
export {};
