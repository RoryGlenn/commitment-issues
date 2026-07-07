# Adoption Checklist

A living, maintainer-facing checklist for growing adoption of `commitment-issues`.
Check items off as they land. (Not shipped in the npm package — it's not listed
in `package.json` `files`.)

## Positioning & first impression

- [x] One-line positioning tagline in the README ("For developers who overthink every commit").
- [x] "How it compares" table (vs a hand-rolled husky + lint-staged setup, lefthook, pre-commit).
- [x] "Package managers" section (npm, pnpm, yarn, bun).
- [x] Demo GIF near the top of the README — recipe ready in `promo/demo.tape` (render with `vhs promo/demo.tape`), then embed.
- [x] Simple logo / wordmark for the README header and social preview.

## Trust signals

- [x] `CHANGELOG.md` in Keep a Changelog format, shipped in the tarball.
- [x] GitHub Releases with notes (v2.2.0, v2.3.0).
- [x] Cross-platform CI (Ubuntu/macOS/Windows × Node 22.22.1/24) with coverage.
- [x] Scenario-coverage tracker mapping the full test suite.
- [x] `CONTRIBUTING.md`, issue/PR templates, and a Code of Conduct.
- [ ] "good first issue" labels to invite contributors.

## Supply-chain & security trust

The hooks execute inside a consumer's commit/push flow, so "safe to run" is a
direct adoption lever.

- [x] `SECURITY.md` with a private vulnerability-disclosure policy.
- [ ] Publish with npm **provenance** (`--provenance` from a GitHub Actions release workflow via OIDC) — surfaces the Provenance badge on npm. Publishing is manual today.
- [x] `.github/dependabot.yml` (or Renovate) for automated dependency-update PRs.
- [ ] OpenSSF Scorecard workflow + badge.
- [ ] Coverage badge in the README — coverage runs in CI but is never surfaced.

## Reach & compatibility (remove adoption blockers)

- [x] npm, pnpm, yarn, and bun supported — each with an end-to-end CI lifecycle smoke.
- [ ] Yarn Berry (Plug'n'Play): documented boundary today (`nodeLinker: node-modules`); add real PnP support or a dedicated guide (PM-004).
- [ ] Monorepo / workspaces support (MONO-001/002).
- [ ] Framework recipes: Next.js, Vite, a TypeScript library.
- [ ] CI-provider recipes for disabling Husky (GitHub Actions / GitLab / CircleCI).

## Onboarding & DX

- [x] `commitment-issues --version` / `-v` — the CLI only handles `-h` / `--help` today.
- [x] `init --dry-run` to preview changes before writing to `package.json` / `.gitignore`.
- [x] Migration guide: raw husky + lint-staged / lefthook / pre-commit → `commitment-issues`.
- [x] FAQ page expanding the README troubleshooting section.

## Discoverability

- [x] npm keywords set in `package.json`.
- [ ] GitHub repo topics: `git-hooks`, `husky`, `lint-staged`, `pre-commit`, `eslint`, `prettier`, `developer-tools`.
- [ ] Social preview image (Settings → General → Social preview).
- [x] Link the docs (message-states gallery, configuration) prominently from the README.
- [ ] Submit to awesome lists (`awesome-nodejs`, `awesome-eslint`, an awesome-git-hooks list).
- [ ] Publish to **JSR** (jsr.io) alongside npm.
- [ ] Enable GitHub Discussions for Q&A.

## Content & community

- [ ] "Show HN: Commitment Issues — advisory-first git hooks." Draft ready in `promo/launch.md`.
- [ ] Blog post: "Why I stopped letting pre-commit hooks block my commits." Draft ready in `promo/launch.md`.
- [ ] Answer relevant threads (r/javascript, r/node, StackOverflow, "husky is annoying" discussions) — genuinely, not spammy.
- [ ] Cross-post to dev.to / Hashnode.
- [ ] Public roadmap (`ROADMAP.md` or a GitHub Project).
- [ ] `FUNDING.yml` / GitHub Sponsors (optional).

## Measure & iterate

- [ ] Track npm weekly downloads and GitHub traffic/referrers.
- [ ] Note where first-run drop-off happens and smooth it.
- [ ] "No telemetry by design" — state the privacy posture explicitly as a trust signal.
- [ ] Revisit this checklist after each release.
