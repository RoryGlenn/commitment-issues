# Dependency Management

This document describes how `commitment-issues` selects, obtains, tracks, reviews, and updates dependencies.

## Dependency sources

`commitment-issues` is a Node.js package. Dependencies are obtained from the npm ecosystem using the standard npm client and npm registry.

The project does not vendor convenience copies of third-party source code. External dependencies are declared in npm metadata and resolved through npm.

## How dependencies are selected

Dependencies should be added only when they provide clear project value and are better than maintaining equivalent project-local code.

When selecting a dependency, maintainers consider:

- whether the dependency is actively maintained;
- whether it is commonly used in the Node.js ecosystem;
- whether it has a compatible open source license;
- whether it has a reasonable transitive dependency footprint;
- whether it supports the project's supported Node.js versions;
- whether it avoids unnecessary network access or unsafe runtime behavior;
- whether the same result can be achieved with built-in Node.js APIs.

New runtime dependencies should be avoided unless they materially improve safety, portability, or maintainability.

## How dependencies are obtained

Dependencies are installed through npm using the repository's `package.json` and `package-lock.json` files.

Developers install dependencies with:

```bash
npm install
```

CI uses:

```bash
npm ci
```

`npm ci` installs exactly from `package-lock.json`, which makes CI dependency resolution reproducible for a given lockfile.

## How dependencies are tracked

The project tracks dependencies in computer-processable files:

- `package.json` declares direct runtime dependencies, development dependencies, peer dependencies, package metadata, and supported Node.js engines.
- `package-lock.json` records the resolved dependency graph, versions, integrity hashes, and transitive dependency metadata.
- `.github/dependabot.yml` configures automated dependency update checks for npm packages and GitHub Actions.

These files are reviewed like source code. Dependency and lockfile changes should be intentional and included in the pull request diff.

## Dependency update process

Dependency updates may be proposed by maintainers or automated tools such as Dependabot.

Dependency update pull requests should:

1. identify which dependencies changed;
2. preserve or update the lockfile consistently;
3. pass CI;
4. be reviewed for unexpected transitive changes;
5. update documentation if the dependency affects installation, runtime behavior, or supported platforms.

Security updates may be prioritized ahead of normal feature work.

## Vulnerability monitoring

The project monitors external dependencies using GitHub and Dependabot features.

When a dependency vulnerability is reported, maintainers should:

1. determine whether the vulnerable dependency is used by the project;
2. determine whether the vulnerable code path is reachable or exploitable;
3. update or remove the vulnerable dependency when practical;
4. document unexploitable findings when needed;
5. release a fixed version if users may be affected.

## GitHub Actions dependencies

GitHub Actions are also treated as dependencies. Workflows should pin third-party actions where practical and Dependabot should be configured to propose updates.

## Adding new dependencies

Pull requests that add new dependencies should explain why the dependency is needed. Maintainers may reject a new dependency if the feature can be implemented safely with existing dependencies or built-in Node.js APIs.
