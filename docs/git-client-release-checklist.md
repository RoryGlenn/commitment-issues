# GUI Git-client release checklist

This checklist records manual release evidence for Git operations started by a
graphical client. It is deliberately separate from shell compatibility:
required CI launches the packed artifact from Bash, Fish, Zsh, POSIX `sh`,
Windows PowerShell, and Command Prompt, while a GUI client supplies its own
process environment and presentation of hook output.

Complete this checklist against the exact release-candidate tarball after the
required shell matrix passes and before publishing any claim of verified
GUI-client support. Do not substitute a source checkout, `npm link`, a registry
version, or an integrated-terminal run for the client's Source Control UI.

If a required client or host is unavailable, do not manufacture a pass. Mark
the lane unsupported/unverified in the release evidence and compatibility
documentation, link a follow-up issue, and keep the support claim narrowed
until the lane runs. The v3.4.0 lanes were explicitly deferred to
[#231](https://github.com/RoryGlenn/commitment-issues/issues/231).

## Evidence header

Record one shared header for the review:

| Field                     | Value |
| ------------------------- | ----- |
| Candidate version         |       |
| Candidate tarball SHA-256 |       |
| Source commit             |       |
| Required CI run           |       |
| Reviewer and date         |       |

Retain screenshots or client logs with the release issue. Do not add generated
fixtures, local paths, usernames, or machine-specific logs to the repository.

## Shared fixture

Prepare a fresh repository whose absolute path contains spaces and Unicode.
Install the exact local tarball and the supported ESLint/Prettier peers, then
run `commitment-issues init`. Configure a local bare Git repository as the
remote so no network access or external service is involved.

The fixture must contain:

- one staged JavaScript or TypeScript file with a known formatting problem;
- one passing associated test so pre-push has observable work;
- generated pre-commit, pre-push, and, when enabled, commit-msg hooks;
- a normal advisory configuration; and
- no globally installed `commitment-issues` fallback.

Close integrated terminals before testing. Launch the GUI normally so Git uses
the environment the client actually provides. Node.js and the project-local
`node_modules/.bin/commitment-issues` entry must be reachable by the Git process;
shell startup files are not part of the GUI contract.

## Lanes

Complete every row for a release that claims verified support for the
corresponding GUI client. One current IntelliJ IDEA or PyCharm run satisfies
the shared JetBrains lane; dedicated IDE integrations would require their own
harness later. An unexecuted row may be deferred only under the explicit
classification and tracking rule above.

| Done | Client lane               | Client version | OS version | Commit evidence | Push evidence | Result / evidence link |
| ---- | ------------------------- | -------------- | ---------- | --------------- | ------------- | ---------------------- |
| [ ]  | VS Code Source Control    |                |            |                 |               |                        |
| [ ]  | IntelliJ IDEA or PyCharm  |                |            |                 |               |                        |
| [ ]  | GitHub Desktop on macOS   |                |            |                 |               |                        |
| [ ]  | GitHub Desktop on Windows |                |            |                 |               |                        |

For each row:

1. Open the prepared repository through the client UI, not its terminal.
2. Commit the staged fixture from Source Control. Confirm the pre-commit
   advisory is visible in the client's output/log surface, the commit-msg hook
   runs when enabled, and the advisory commit succeeds.
3. Push from the client UI. Confirm pre-push runs the associated test, reports
   one pass and zero failures, and the local bare remote receives the commit.
4. Run the installed candidate's `doctor` command in the same repository and
   record that the hooks are healthy.
5. Preview and run `uninstall`; confirm only owned setup is removed and the
   repository remains usable.

## Pass and failure rules

A lane passes only when the client-started commit and push execute the expected
hooks with the candidate's project-local binary. Hidden but retrievable client
logs are acceptable evidence; a hook that did not run is not. A missing Node or
local-bin path is a failed compatibility check, even when the same operation
works from an integrated terminal.

Record failures in the release issue with the client/OS versions, candidate
hash, exact operation, output, and whether the problem is environment discovery
or product behavior. Resolve or explicitly narrow the release claim before
publication; never mark an unexecuted row as passing.
