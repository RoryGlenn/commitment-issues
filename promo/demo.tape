# promo/demo.tape — generate the README demo GIF with:  vhs promo/demo.tape
#
# VHS is the Charm terminal recorder (https://github.com/charmbracelet/vhs) — a
# standalone binary, NOT the "vhs" npm package. Do NOT run `npx vhs`.
# Install:
#   Linux: Charm apt repo for `vhs`, plus `ffmpeg` and `ttyd`
#          (e.g. `sudo apt install vhs ffmpeg` + `sudo snap install ttyd --classic`)
#   macOS: `brew install vhs`  (pulls in ffmpeg + ttyd)
# Then run this tape from the repo root:  vhs promo/demo.tape
#
# Timings depend on install/network speed — after a first render, tune the
# Sleep values so each box is fully visible. Output lands at assets/demo.gif,
# which is already inside package.json `files`, ready to embed in the README.

Output assets/demo.gif

Set Shell "bash"
Set FontSize 18
Set Width 1000
Set Height 640
Set Theme "Dracula"
Set Padding 24
Set TypingSpeed 60ms

# --- Hidden setup: a minimal project (a source file + its test) already
#     committed, so the recording shows only the everyday experience ---
Hide
Type "cd $(mktemp -d)" Enter
Type "git init -q && git config user.name demo && git config user.email demo@example.com" Enter
Type "npm init -y >/dev/null 2>&1" Enter
Type "npm install -D commitment-issues husky lint-staged eslint prettier @eslint/js globals >/dev/null 2>&1" Enter
Type `printf 'import js from "@eslint/js";\nimport globals from "globals";\nexport default [js.configs.recommended, { languageOptions: { globals: globals.node } }];\n' > eslint.config.js` Enter
Type "mkdir src" Enter
Type `printf 'export const sum = (a, b) => a + b;\n' > src/sum.mjs` Enter
Type `printf 'import test from "node:test";\nimport assert from "node:assert/strict";\nimport { sum } from "./sum.mjs";\ntest("sum", () => assert.equal(sum(1, 2), 3));\n' > src/sum.test.mjs` Enter
Type "git add . && git commit -q -m init" Enter
Type "clear" Enter
Show

# --- 1. One command sets everything up ---
Type "npx commitment-issues init" Enter
Sleep 4s
Hide
Type "clear" Enter
Show

# --- 2. Commit as usual — a formatting slip gets an advisory box, not a block ---
Type "echo 'export const sum=(a,b)=>a+b;' > src/sum.mjs" Enter
Sleep 500ms
Type "git commit -am 'tweak sum'" Enter
Sleep 5s
