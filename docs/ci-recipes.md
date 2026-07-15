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

## GitHub Actions

Set `COMMITMENT_ISSUES: "0"` at the job (or workflow) level:

```yaml
permissions:
  contents: read

jobs:
  ci:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    env:
      COMMITMENT_ISSUES: "0"
    steps:
      - uses: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0 # v7
        with:
          persist-credentials: false
      - uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e # v6
        with:
          node-version: "22.11.0"
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
- Keep third-party GitHub Actions pinned to reviewed full commit SHAs and use a
  dependency updater such as Dependabot to propose version changes.
