// Ambient declarations for MCP tool files that run in the Deno edge function.
// The tools reference `process.env` at runtime (Deno shims it), but they're
// type-checked in the Vite/browser tsconfig where `process` is not declared.
declare const process: {
  env: Record<string, string | undefined>;
};
