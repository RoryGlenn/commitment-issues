# promo/demo.tape — generate the README demo GIF with:  vhs promo/demo.tape
#
# Requires VHS (https://github.com/charmbracelet/vhs), plus ttyd and ffmpeg.
# Timings depend on install/network speed — after a first render, tune the
# Sleep values so each box is fully visible. Output lands at assets/demo.gif,
# which is already inside package.json `files`, ready to embed in the README.

Output assets/demo.gif

Set Shell "bash"
Set FontSize 18
Set Width 1100
Set Height 720
Set Theme "Dracula"
Set Padding 24
Set TypingSpeed 55ms

# --- Hidden setup so the recording is self-contained ---
Hide
Type "cd $(mktemp -d)" Enter
Type "git init -q && git config user.name demo && git config user.email demo@example.com" Enter
Type "npm init -y >/dev/null 2>&1" Enter
Type "npm install -D commitment-issues husky lint-staged eslint prettier @eslint/js globals >/dev/null 2>&1" Enter
Type `printf 'import js from "@eslint/js";\nimport globals from "globals";\nexport default [js.configs.recommended, { languageOptions: { globals: globals.node } }];\n' > eslint.config.js` Enter
Type "clear" Enter
Show

# --- One command wires up hooks, scripts, and lint-staged ---
Type "npx commitment-issues init" Enter
Sleep 4s

# --- Commit code with a formatting slip: the hook advises, never blocks ---
Type "echo 'export const sum=(a,b)=>a+b;' > sum.mjs" Enter
Type `echo 'import test from "node:test"; import assert from "node:assert/strict"; import { sum } from "./sum.mjs"; test("sum", () => assert.equal(sum(1, 2), 3));' > sum.test.mjs` Enter
Type "git add ." Enter
Type "git commit -m 'add sum'" Enter
Sleep 4s

# --- Apply the suggested fix and amend the commit in place ---
Type "npm run commit:fix" Enter
Sleep 4s
