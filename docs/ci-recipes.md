# CI Provider Recipes

`commitment-issues` installs Git hooks for local development. In CI you should
**disable Husky** and run your checks explicitly instead, so the install step
never tries to wire hooks and your pipeline stays fast and predictable.

## Why disable Husky in CI

Husky sets up Git hooks from its `prepare` script when dependencies are
installed. In CI that is unnecessary work — there are no interactive commits or
pushes to guard — and it can fail in minimal environments. Setting the `HUSKY=0`
environment variable turns Husky installation into a no-op.

Then run the same commands the hooks would run, directly:

```bash
npm ci
npm run lint
npm run format:check
npm test
```

## GitHub Actions

Set `HUSKY: "0"` at the job (or workflow) level:

```yaml
jobs:
  ci:
    runs-on: ubuntu-latest
    env:
      HUSKY: "0"
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run format:check
      - run: npm test
```

## GitLab CI

Set `HUSKY` as a pipeline variable:

```yaml
variables:
  HUSKY: "0"

test:
  image: node:22
  script:
    - npm ci
    - npm run lint
    - npm run format:check
    - npm test
```

## CircleCI

Set `HUSKY` in the job environment:

```yaml
version: 2.1

jobs:
  test:
    docker:
      - image: cimg/node:22.22
    environment:
      HUSKY: "0"
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

- `HUSKY=0` only disables hook installation. It does not change how
  `commitment-issues` behaves when you invoke its commands directly.
- The same approach works for pnpm, yarn, and bun — swap `npm ci` and
  `npm run` for the equivalent commands.
- Use CI for real enforcement: run lint, format, and test commands directly so
  every pipeline fails on problems, independent of the advisory local hooks.
