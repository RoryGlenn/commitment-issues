# Launch kit

Maintainer material for putting `commitment-issues` in front of people. It is
not shipped in the npm package because `promo/` is outside the `package.json`
`files` allowlist.

Current technical baseline: v3.3.2 is live on npm, its immutable GitHub Release
contains the exact npm tarball and matching SLSA provenance, issue #39 is
closed, and the demo GIF, repository topics, and social preview are complete.
Recheck those signals on launch day rather than relying on this snapshot.

---

## Blog post

**Title:** Why I stopped letting pre-commit hooks block my commits

Every team eventually adds Git hooks. And every team eventually learns the same
reflex: `git commit --no-verify`.

It happens because most hook setups are **blocking by default**. You're
mid-thought, you commit a WIP, and a hook rejects it because Prettier wanted
different quotes — or worse, it reformats and re-stages files you didn't mean to
touch, or fails a test suite you were about to fix in the next commit. The hook
was trying to help. It just picked the worst possible moment.

So people reach for `--no-verify`, and once that's muscle memory, the hooks may
as well not exist.

I wanted the opposite default: **hooks that inform, then get out of the way.**

### Advisory-first

`commitment-issues` runs the checks you'd expect — ESLint, Prettier, missing-test
detection, and pushed-file tests — but by default it **reports** and lets your
commit through. You get a compact box: what it found, what's safe to do next, and
the command to fix it when you're ready. Your commit is never held hostage.

When you _do_ want a hard gate, you opt in. Set `blockPushOnTestFailure: true` and
failing tests block a push. Strictness is a deliberate choice — not the default
that trains you to bypass it.

### Safe by construction

The fix commands refuse to do anything risky:

- `fix:staged` only touches staged files, and refuses to run when a file has both
  staged and unstaged changes.
- `commit:fix` only amends the latest commit when the working tree is safe, so it
  can never rewrite pushed history or clobber unstaged work.

Nothing mutates your work behind your back.

### One command, and it heals itself

```bash
npm install -D commitment-issues eslint@^9 prettier@^3
npx --no-install commitment-issues init
```

That wires the hooks and npm scripts — no hook manager needed. Hooks are notorious for
silently breaking — a `git clean`, a stale checkout, a teammate who never ran
the install lifecycle. `commitment-issues` ships a `doctor` that repairs the
wiring through `prepare`, composing it after a project-owned command when
needed, so it self-heals without overwriting project setup and works with Yarn
Classic too.

It works with npm, pnpm, yarn, and bun (each proven by an end-to-end CI smoke),
on Linux, macOS, and Windows, on Node >=22.11.0.

### The point

Hooks should be a helpful teammate, not a bouncer. Advisory by default, strict when
you ask — that's the whole idea.

It's MIT-licensed and on npm as `commitment-issues`. If the philosophy resonates —
or if you think I'm wrong — I'd love the feedback.

Repo: https://github.com/RoryGlenn/commitment-issues

---

## Show HN preparation

Do not reuse generated launch copy. Write the Show HN title, first comment, and
every reply personally, from scratch, and follow the official Show HN and
Hacker News guidelines linked from issue #78.

The human-written title should:

- begin with `Show HN:`;
- describe the project neutrally and concisely;
- link directly to the GitHub repository; and
- avoid superlatives, marketing language, or an upvote request.

The first comment should explain, in the maintainer's own words:

- what the project does and who it is for;
- the blocking-hook and habitual `--no-verify` problem;
- why advisory-first is the default;
- the safe-fix, local-only, and native-hook design choices;
- current JS/TS, Node, Yarn Plug'n'Play, shell, and GUI-client boundaries; and
- the specific tradeoffs on which feedback would be useful.

Prepare personal answers for likely questions about Husky/lint-staged and CI,
bypasses, partial staging, telemetry and configured-command trust, monorepos,
platform compatibility, the proposed v4 direction, release verification, and
the v3.3.0/v3.3.1 fix-forward history. The durable product answers live in the
FAQ; launch replies must still be written personally.

---

## Posting checklist

- [x] Generate and embed the demo GIF (`vhs promo/demo.tape` → `assets/demo.gif`).
- [x] Add GitHub repo topics: `git-hooks`, `husky`, `lint-staged`, `pre-commit`, `eslint`, `prettier`, `developer-tools`.
- [x] Add a social preview image (Settings → General → Social preview).
- [x] Publish and independently verify v3.3.2, including matching npm/GitHub
      tarballs and signed SLSA provenance.
- [ ] Re-run the clean-install launch path: `init`, advisory commit warning,
      `commit:fix`, and related push-time tests.
- [ ] Recheck npm, the immutable GitHub Release assets, CI, CodeQL, DCO,
      Scorecard, README media, and repository availability on launch day.
- [ ] Publish the blog on your site; cross-post to dev.to and Hashnode with a canonical link back.
- [ ] Confirm the personal HN account can submit and the title/first comment are
      human-written and ready.
- [ ] Post Show HN in the chosen launch window and add the first comment within
      approximately one or two minutes.
- [ ] Reserve at least three uninterrupted hours for personal replies.
