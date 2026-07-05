# Launch kit

Drafts for putting `commitment-issues` in front of people. Not shipped in the npm
package (the `promo/` folder is not listed in `package.json` `files`).

Before posting: add GitHub repo topics and a social preview image (link previews
matter), and generate the demo GIF (`vhs promo/demo.tape`) so it can lead the README.

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
npm install -D commitment-issues husky lint-staged eslint prettier
npx commitment-issues init
```

That wires the hooks, npm scripts, and lint-staged config. Hooks are notorious for
silently breaking — a `git clean`, a stale checkout, a teammate who never ran
`prepare`. `commitment-issues` ships a `doctor` that repairs the wiring and runs
quietly on every install, so it self-heals.

It works with npm, pnpm, yarn, and bun (each proven by an end-to-end CI smoke), on
Linux, macOS, and Windows, on Node 22+.

### The point

Hooks should be a helpful teammate, not a bouncer. Advisory by default, strict when
you ask — that's the whole idea.

It's MIT-licensed and on npm as `commitment-issues`. If the philosophy resonates —
or if you think I'm wrong — I'd love the feedback.

Repo: https://github.com/RoryGlenn/commitment-issues

---

## Show HN

**Title:** Show HN: Commitment Issues – advisory-first Git hooks that nudge instead of blocking

**First comment (post immediately for context):**

Hi HN — I built commitment-issues because I was tired of pre-commit hooks that
block my commit at the worst moment and train me to type `--no-verify`.

It runs the usual checks (ESLint, Prettier, missing tests, pushed-file tests) but
is advisory by default: it prints a compact box telling you what it found and how
to fix it, and lets the commit through. When you want a hard gate, you opt in
(`blockPushOnTestFailure`).

A few things I tried to get right:

- Safe fixes: `fix:staged` refuses partially-staged files; `commit:fix` only amends
  when it can't rewrite pushed history or clobber unstaged work.
- Self-healing: a `doctor` command repairs broken hook wiring and runs quietly on
  install.
- Works across npm/pnpm/yarn/bun (each has an end-to-end CI smoke), Linux/macOS/
  Windows, Node 22+.

Setup is one command: `npx commitment-issues init`.

Honest limitations: it's JS/TS only, and yarn Berry needs `nodeLinker: node-modules`
(no Plug'n'Play yet).

Repo: https://github.com/RoryGlenn/commitment-issues — npm: `commitment-issues`.
Feedback and disagreement welcome.

---

## Posting checklist

- [ ] Generate and embed the demo GIF (`vhs promo/demo.tape` → `assets/demo.gif`).
- [ ] Add GitHub repo topics: `git-hooks`, `husky`, `lint-staged`, `pre-commit`, `eslint`, `prettier`, `developer-tools`.
- [ ] Add a social preview image (Settings → General → Social preview).
- [ ] Publish the blog on your site; cross-post to dev.to and Hashnode with a canonical link back.
- [ ] Post Show HN Tue–Thu, ~8–10am ET; add the first comment immediately.
- [ ] Be available for the first 2–3 hours to answer replies.
