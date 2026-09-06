---
name: Runtime schema bundling
description: Keep generated Zod schemas compatible with the API server's bundled ESM runtime.
---

Generated Zod schemas in this workspace must use the named `z` export rather than a namespace import when bundled into the API server. The namespace form can typecheck and build but fail during startup because of a Zod v4/esbuild constructor mismatch.

**Why:** The API server bundles the shared schema package with esbuild; a namespace-imported Zod schema previously caused a runtime `Class2 is not a constructor` failure even though compilation passed.

**How to apply:** After regenerating the API client/schema libraries, preserve the named Zod import in the generated runtime schema entrypoint and smoke-test the API process before declaring the server healthy.