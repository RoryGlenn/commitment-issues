# Framework Recipes

`commitment-issues` is framework-agnostic: it delegates linting to your project's
ESLint flat config and runs whatever `testCommand` you configure. These recipes
show the common wiring for a few popular stacks.

Every recipe starts the same way — install at the project root and initialize:

```bash
npm install -D commitment-issues eslint prettier
npx commitment-issues init
```

Then adjust `precommitChecks` in `package.json` and your ESLint config as shown
below.

## Next.js

Next.js projects lint with ESLint and usually test with Vitest or Jest.

1. Use an ESLint **flat config** (`eslint.config.mjs`). `commitment-issues` runs
   ESLint directly on staged files, so the flat config must cover your `.ts` and
   `.tsx` sources. This is independent of `next lint`.
2. Make sure build output is ignored. Next's default `.gitignore` already lists
   `.next/`; keep it so generated files are never staged.
3. Point `testCommand` at your runner:

   ```json
   {
     "precommitChecks": {
       "testCommand": ["npx", "vitest", "run"]
     }
   }
   ```

   The `run` subcommand is required so Vitest does not start watch mode and hang
   the hook. For Jest, use `["npx", "jest"]`.

The generated `next-env.d.ts` is a declaration file, so it is already excluded
from the missing-test check.

## Vite

Vite projects (React, Vue, Svelte, or vanilla TS) pair naturally with Vitest.

1. Keep an ESLint flat config that covers your framework files.
2. Use Vitest as the runner:

   ```json
   {
     "precommitChecks": {
       "testCommand": ["npx", "vitest", "run"]
     }
   }
   ```

3. `vite.config.ts` is treated as a config file, so it is exempt from the
   missing-test check.

If you keep component files without co-located tests and do not want
missing-test warnings for them, add a glob to `testExempt`:

```json
{
  "precommitChecks": {
    "testExempt": ["src/components/**/*.tsx"]
  }
}
```

## TypeScript library

For a publishable TypeScript library, lint with a TypeScript-aware ESLint config
and test with your preferred runner.

1. Use a `typescript-eslint` flat config so staged `.ts` files lint correctly.
2. Choose a `testCommand`. The built-in Node runner works for compiled or
   loader-based tests; Vitest is a common alternative:

   ```json
   {
     "precommitChecks": {
       "testCommand": ["npx", "vitest", "run"]
     }
   }
   ```

3. Declaration files (`*.d.ts`) are excluded from the missing-test check. Build
   output such as `dist/` should stay in `.gitignore` so it is never staged.

If you want to enforce that tests run at commit time (not just warn on missing
tests), enable `runStagedTests`:

```json
{
  "precommitChecks": {
    "runStagedTests": true,
    "testCommand": ["npx", "vitest", "run"]
  }
}
```

## Notes that apply to every stack

- `commitment-issues` never bundles ESLint or Prettier — it runs the versions
  installed in your project.
- Missing-test warnings are advisory by default. Use `testExempt` globs to scope
  them, or set `requireTests: false` to turn them off.
- See [Configuration and Behavior](configuration.md) for the full option
  reference and [the FAQ](faq.md) for test-runner details.
