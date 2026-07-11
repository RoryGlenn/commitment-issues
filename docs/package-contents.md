# npm Package Contents

The published package is intentionally smaller than the source repository. Use
`npm pack --dry-run --json --ignore-scripts` to inspect the exact file list and
sizes before a release.

## Classification

| Class                   | Included in npm? | Contents                                                    |
| ----------------------- | ---------------- | ----------------------------------------------------------- |
| Runtime                 | Yes              | `scripts/`, `package.json`, and npm-installed dependencies  |
| Installed documentation | Yes              | `docs/`, `README.md`, `CHANGELOG.md`, and `LICENSE`         |
| npm README assets       | Yes              | Terminal-state and flowchart SVGs matched by `assets/*.svg` |
| Promotional-only media  | No               | `assets/commitment-issues.png` and `assets/demo.gif`        |

The hero PNG and demo GIF remain tracked in the GitHub source repository. The
README references their stable `raw.githubusercontent.com` URLs so they render
on both GitHub and npm without adding roughly 1.4 MB of promotional media to
every package download.

## Size budget

The release tarball must remain at or below **350 KiB compressed** and **750 KiB
unpacked**. CI tests the generated npm pack manifest and fails when either
budget is exceeded, when promotional raster/video files reappear, or when the
runtime CLI and installed package documentation are missing.

The budget is intentionally above the current package size so ordinary code and
documentation growth does not cause noise. Revisit it explicitly if a new
runtime asset is genuinely required; do not silently raise it to accommodate
promotional media.
