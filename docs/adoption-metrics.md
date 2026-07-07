# Adoption Metrics

A lightweight, maintainer-facing checklist for keeping an eye on how
`commitment-issues` is landing. It's a place to jot signals and notice friction,
not a dashboard to obsess over.

Nothing here is telemetry: every number below is something a maintainer looks up
by hand — some from public sources (npm downloads, GitHub stars), and some from
the repo's own dashboards that need repo access (GitHub Insights → Traffic). The
tool itself collects nothing — see the [Privacy section](../README.md#privacy) in
the README.

## Weekly

- [ ] npm weekly downloads — from the [npm package page](https://www.npmjs.com/package/commitment-issues) or the [npm downloads API](https://api.npmjs.org/downloads/point/last-week/commitment-issues) (`npm view` does not report download counts).
- [ ] GitHub stars — rough trend, not a vanity chase.
- [ ] New issues opened, and whether any point at first-run friction.
- [ ] Discussions / questions — what are people confused about?

## Monthly

- [ ] GitHub traffic and referrers (Insights → Traffic): where are visitors coming from?
- [ ] Common install or first-run failures worth a docs fix or a smoother default.
- [ ] Recurring "how do I …" questions that a README or FAQ line could pre-empt.
- [ ] Revisit the [adoption checklist](../ADOPTION.md) — mark what landed, retire what no longer matters.

## How to use this

- Keep it lightweight. A few bullets after each release beats a spreadsheet nobody updates.
- Turn friction into docs: most first-run problems are a missing sentence, not a missing feature.
- Prefer smoothing the default over adding another config knob.
