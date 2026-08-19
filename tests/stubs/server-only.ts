/**
 * Stands in for the `server-only` package under vitest.
 *
 * The real module throws the moment it is imported outside a Server Component,
 * which is what keeps server code out of the browser bundle. That boundary is
 * enforced by the Next.js build; inside a test runner it only prevents a client
 * component from being rendered at all.
 */
export {};
