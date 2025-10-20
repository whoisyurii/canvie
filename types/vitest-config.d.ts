declare module "vitest/config" {
  // Minimal fallback type definition used during production builds where vitest isn't installed.
  export function defineConfig<T>(config: T): T;
}
