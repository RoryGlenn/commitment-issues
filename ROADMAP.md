# Roadmap

This document tracks the public direction for `commitment-issues` for the next year.

The roadmap is intentionally practical rather than speculative. It describes what the project intends to do, what it does not intend to do, and what users should expect while the project is active.

## Guiding direction

`commitment-issues` will remain a local, advisory-first Git-hook toolkit for JavaScript and TypeScript projects.

The project will prioritize:

- protecting user working trees and Git history;
- clear local CLI output;
- opt-in enforcement for stricter teams;
- compatibility with common Node.js package managers;
- security and supply-chain transparency;
- small, well-tested changes.

## Next 12 months: planned work

### Maintenance and compatibility

- Keep support current for maintained Node.js versions used by the project.
- Keep npm, pnpm, yarn, and bun lifecycle smoke tests current.
- Maintain compatibility documentation for common JavaScript and TypeScript project layouts.
- Keep migration documentation current for users moving from older `commitment-issues` versions or other hook managers.

### Security and release practices

- Continue improving OpenSSF Best Practices evidence and policies.
- Maintain dependency monitoring through Dependabot and npm metadata.
- Keep GitHub Actions pinned and reviewed where practical.
- Maintain release provenance and user-facing verification documentation.
- Keep vulnerability reporting and vulnerability history documentation current.
- Continue hardening command execution, path handling, and configuration validation.

### Testing and quality

- Require automated tests for major new functionality.
- Add regression tests for practical bug fixes.
- Maintain CI across Ubuntu, macOS, and Windows.
- Preserve high statement coverage and keep the scenario-coverage document current.
- Expand tests around configuration validation, Git edge cases, and package-manager behavior when new behavior lands.

### Documentation and onboarding

- Improve first-run and adoption documentation.
- Add or improve recipes for common stacks such as Next.js, Vite, TypeScript libraries, and monorepos.
- Keep README examples, message-state screenshots, configuration docs, and external interface documentation aligned with current behavior.
- Keep governance, roles, dependency-management, and release-verification documentation current.

### Feature direction

- Improve branch-awareness and wrong-branch protection design before implementation.
- Explore additional advisory checks such as large commit warnings, debug-junk warnings, and generated-file warnings.
- Keep any stricter enforcement mode opt-in and clearly documented.
- Keep user-facing output concise, actionable, and safe to ignore unless enforcement is explicitly enabled.

## Next 12 months: non-goals

The project does not intend to:

- become a general-purpose Git hook framework;
- replace ESLint, Prettier, test runners, or package managers;
- add telemetry, analytics, or phone-home behavior;
- upload repository contents to any hosted service;
- require a SaaS account;
- mutate unstaged work without explicit user action;
- make blocking behavior the default for all users;
- support every programming language equally;
- maintain generated binaries or native build artifacts in the repository.

## Longer-term possibilities

These ideas may be revisited after the planned maintenance and security work remains stable:

- richer PR-readiness checks;
- a `panic` command for recovering from common Git mistakes;
- optional branch-awareness checks;
- optional secret or debug-artifact staged checks;
- improved framework-specific setup guidance;
- optional localized output if there is contributor demand.

## How to use this roadmap

- Treat the checklist in [ADOPTION.md](ADOPTION.md) as the source of truth for what has already landed.
- Treat this file as the public view of what the project intends to do and not do over the next year.
- If priorities shift, the roadmap should change with them through a normal pull request.
