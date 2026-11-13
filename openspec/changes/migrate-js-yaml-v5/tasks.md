# Tasks

- [x] Read target-head guidance and verify the published dependency API.
- [x] Reproduce the manifest/lockfile installation failure on Node 22.11.0.
- [x] Regenerate the focused lockfile and reproduce the runtime import failure.
- [x] Migrate YAML consumers and preserve hook-manager validation behavior.
- [x] Add focused regression coverage and the changelog entry.
- [x] Correct the timestamp fallback and cover the independently reproduced
      invalid-date and invalid-time compatibility regression.
- [x] Run focused tests, lint, formatting, and full tests.
- [x] Run coverage on Node 22.11.0 and Node 24.
- [x] Run the packed npm lifecycle and native POSIX shell lifecycle.
- [x] Validate OpenSpec, inspect the diff, and hand off for independent review.
- [x] Merge current main at `9b1e1c79c3d560929ea914e858d4fe06201867c9`, preserve
      its v4.0.0 baseline and unrelated changes, and regenerate the dependency
      lockfile from that baseline.
- [x] Repeat the required gates on the merged candidate and hand off its final
      delta against current main for independent review and verification.
