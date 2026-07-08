# Copilot instructions for commitment-issues

`commitment-issues` is an **advisory-first** Git hook toolkit for JS/TS projects (wraps Husky, lint-staged, ESLint, Prettier). It reports problems without discarding unstaged work, rewriting pushed history, or blocking — **blocking is opt-in** via `precommitChecks`. Preserve that philosophy in every change: warn and continue by default; gate enforcement behind explicit config.

## Hard constraints

- **Pure ESM `.mjs`, no build step, no transpile.** Node `>=22.22.1`. Uses the built-in `node --test` runner and `node:assert/strict` — no Jest/Mocha/Vitest. The one extra test library is `fast-check` (property-based tests in `test/property.test.js`, kept `.js` so the OpenSSF Scorecard fuzzing check detects it).
- **Cross-platform.** CI runs on Ubuntu/macOS/Windows × Node 22.22.1/24. No shell-specific assumptions, no hard-coded path separators (normalize `\\` → `/` before matching).
- `scripts/*.mjs` = entry commands (top-level code + `process.exit`); `scripts/lib/*.mjs` = pure, unit-tested helpers. Push logic down into `lib/`.
- Community-health, governance, and these agent files live in `.github/` so they stay out of the npm tarball (`package.json` `files` allowlists only `scripts/ assets/ docs/ README.md CHANGELOG.md LICENSE`).

## Before you push (always)

```bash
npm test
npm run lint
npm run format:check   # `npm run format` to fix
```

Add/adjust a test for every behavior change (bug fixes get a regression test). Update `docs/` and the `## [Unreleased]` block in `CHANGELOG.md` for any user-visible change.

## Top traps

- **Test coverage relies on symlinks.** `createTempRepo()` symlinks `scripts/` + `node_modules/`; never revert to `cpSync` or subprocess coverage silently drops.
- **`HUSKY=0`** is set in CI and must stay stripped from test subprocess env. Reproduce CI-only failures with `HUSKY=0 npm test`.
- **`isPackageInstalled` must stay fs-based** (husky v9's `exports` map hides `package.json`, so `require.resolve` throws on it).
- **Don't weaken the `CI Success` gate** or force-merge breaking Dependabot majors.

## Detailed workflows — load the matching skill

| Task                                                              | Skill                  |
| ----------------------------------------------------------------- | ---------------------- |
| Write/run/debug tests, coverage, temp repos, HUSKY=0              | `testing-and-coverage` |
| Add/modify a command, hook check, or `scripts/lib` helper         | `authoring-checks`     |
| Cut a release / publish to npm / debug a failed publish           | `release-and-publish`  |
| Branch protection, CI gate, Dependabot, security, labels, roadmap | `github-governance`    |

Skills live in [`.github/skills/`](skills/). Read the relevant `SKILL.md` before doing that class of work — they carry the non-obvious mechanics and gotchas.
