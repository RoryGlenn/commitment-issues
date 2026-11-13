# Make the js-yaml v5 update installable

## Why

PR #334 updates the js-yaml dependency range while retaining the v4 lockfile.
Clean installation fails, and the hook inspector uses APIs removed in v5.

## What Changes

- Regenerate the lockfile for the existing `^5.2.2` dependency range.
- Migrate ESM imports and the hook inspector's custom scalar tag to v5 APIs.
- Preserve conservative hook-manager YAML validation and exercise the packed
  install, hook, repair, and uninstall paths.

## Capabilities

Existing product behavior and public requirements remain the compatibility
target. This dependency maintenance change uses `skip_specs` because it preserves
those requirements.

## Impact

The affected surfaces are dependency installation, the shared hook inspector,
and tests that load YAML. The public command and configuration contracts stay
compatible. Publication remains part of the existing PR workflow.
