# CI Provider Recipes

`commitment-issues` installs Git hooks for local development. In CI you should
**skip the hooks** and run your checks explicitly instead, so the pipeline
stays fast and predictable.

## Why skip the hooks in CI

The generated hooks guard interactive commits and pushes; in CI that is
unnecessary work. Setting the `COMMITMENT_ISSUES=0` environment variable makes
every generated hook exit immediately. (The pre-3.0 `HUSKY=0` variable is still
honored, so existing pipelines keep working.) Hook wiring itself is harmless in
CI—the generated or composed `prepare` repair script runs `doctor --quiet`,
which never fails an install, even with no `.git` directory.

Then run the same commands the hooks would run, directly:

```bash
npm ci
npm run lint
npm run format:check
npm test
```

### Markdown link validation

Run `npm run links:check` to verify tracked Markdown files do not reference missing local paths. The tool only inspects the repository's own files (no external URLs or network requests), so it is safe to run in CI even on a single matrix leg—our workflow executes it on Ubuntu/Node 24.

## GitHub Actions

Set `COMMITMENT_ISSUES: "0"` at the job (or workflow) level:

```yaml
jobs:
  ci:
    runs-on: ubuntu-latest
    env:
      COMMITMENT_ISSUES: "0"
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v6
        with:
          node-version: "22"
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run format:check
      - run: npm test
```

## GitLab CI

Set `COMMITMENT_ISSUES` as a pipeline variable:

```yaml
variables:
  COMMITMENT_ISSUES: "0"

test:
  image: node:22
  script:
    - npm ci
    - npm run lint
    - npm run format:check
    - npm test
```

## CircleCI

Set `COMMITMENT_ISSUES` in the job environment:

```yaml
version: 2.1

jobs:
  test:
    docker:
      - image: cimg/node:22.11
    environment:
      COMMITMENT_ISSUES: "0"
    steps:
      - checkout
      - run: npm ci
      - run: npm run lint
      - run: npm run format:check
      - run: npm test

workflows:
  ci:
    jobs:
      - test
```

## Notes

- `COMMITMENT_ISSUES=0` only makes the hooks exit early. It does not change how
  `commitment-issues` behaves when you invoke its commands directly.
- The same approach works for pnpm, yarn, and bun — swap `npm ci` and
  `npm run` for the equivalent commands.
- Use CI for real enforcement: run lint, format, and test commands directly so
  every pipeline fails on problems, independent of the advisory local hooks.
