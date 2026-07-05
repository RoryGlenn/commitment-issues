# Adoption Checklist

A living, maintainer-facing checklist for growing adoption of `commitment-issues`.
Check items off as they land. (Not shipped in the npm package — it's not listed
in `package.json` `files`.)

## Positioning & first impression

- [x] One-line positioning tagline in the README ("Git hooks that nudge instead of blocking…").
- [x] "How it compares" table (vs a hand-rolled husky + lint-staged setup, lefthook, pre-commit).
- [x] "Package managers" section (npm, pnpm, yarn, bun).
- [ ] Demo GIF near the top of the README — recipe ready in `promo/demo.tape` (render with `vhs promo/demo.tape`), then embed.
- [ ] Simple logo / wordmark for the README header and social preview.

## Trust signals

- [x] `CHANGELOG.md` in Keep a Changelog format, shipped in the tarball.
- [x] GitHub Releases with notes (v2.2.0, v2.3.0).
- [x] Cross-platform CI (Ubuntu/macOS/Windows × Node 22.22.1/24) with coverage.
- [x] Scenario-coverage tracker mapping the full test suite.
- [ ] `CONTRIBUTING.md`, issue/PR templates, and a Code of Conduct.
- [ ] "good first issue" labels to invite contributors.

## Reach & compatibility (remove adoption blockers)

- [x] npm, pnpm, yarn, and bun supported — each with an end-to-end CI lifecycle smoke.
- [ ] Yarn Berry (Plug'n'Play): documented boundary today (`nodeLinker: node-modules`); add real PnP support or a dedicated guide (PM-004).
- [ ] Monorepo / workspaces support (MONO-001/002).
- [ ] Framework recipes: Next.js, Vite, a TypeScript library.

## Discoverability

- [x] npm keywords set in `package.json`.
- [ ] GitHub repo topics: `git-hooks`, `husky`, `lint-staged`, `pre-commit`, `eslint`, `prettier`, `developer-tools`.
- [ ] Social preview image (Settings → General → Social preview).
- [ ] Link the docs (message-states gallery, configuration) prominently from the README.

## Content & community

- [ ] "Show HN: Commitment Issues — advisory-first git hooks." Draft ready in `promo/launch.md`.
- [ ] Blog post: "Why I stopped letting pre-commit hooks block my commits." Draft ready in `promo/launch.md`.
- [ ] Answer relevant threads (r/javascript, r/node, StackOverflow, "husky is annoying" discussions) — genuinely, not spammy.
- [ ] Cross-post to dev.to / Hashnode.

## Measure & iterate

- [ ] Track npm weekly downloads and GitHub traffic/referrers.
- [ ] Note where first-run drop-off happens and smooth it.
- [ ] Revisit this checklist after each release.
