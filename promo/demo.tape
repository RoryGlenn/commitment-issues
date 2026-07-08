# promo/demo.tape — generate the README demo GIF with:  vhs promo/demo.tape
#
# VHS is the Charm terminal recorder (https://github.com/charmbracelet/vhs) — a
# standalone binary, NOT the "vhs" npm package. Do NOT run `npx vhs`.
# Install:
#   Linux: Charm apt repo for `vhs`, plus `ffmpeg`, `ttyd`, and `zsh`
#          (e.g. `sudo apt install vhs ffmpeg zsh` + `sudo snap install ttyd --classic`)
#   macOS: `brew install vhs`  (pulls in ffmpeg + ttyd; zsh is already available by default)
# Then run this tape from the repo root:  vhs promo/demo.tape
#
# Timings depend on install/network speed — after a first render, tune the
# Sleep values so each box is fully visible. Output lands at assets/demo.gif,
# which is already inside package.json `files`, ready to embed in the README.

Output assets/demo.gif

Set Shell "zsh"
Set FontSize 18
Set Width 1000
Set Height 760
Set Theme "Dracula"
Set Padding 24
Set TypingSpeed 100ms

# --- Hidden setup: a minimal project with a local bare Git remote.
#     A source file + its test are already committed, so the recording
#     shows only the everyday experience. ---
Hide
Type "REPO=$(pwd)" Enter
Type `WORKDIR=$(mktemp -d)/hello-world && mkdir -p "$WORKDIR"` Enter
Type "REMOTE_DIR=$(mktemp -d)/demo.git" Enter
Type `git init --bare "$REMOTE_DIR" >/dev/null 2>&1` Enter
Type `cd "$WORKDIR"` Enter
Type "git init -q && git branch -M main && git config user.name demo && git config user.email demo@example.com" Enter
Type `git remote add origin "$REMOTE_DIR"` Enter
Type "npm init -y >/dev/null 2>&1" Enter
Type "printf 'node_modules/\n' > .gitignore" Enter
# Install the local build (not the npm release) so the GIF reflects current code.
Type `npm install -D "$REPO" eslint prettier @eslint/js globals >/dev/null 2>&1` Enter
Type `printf 'import js from "@eslint/js";\nimport globals from "globals";\nexport default [js.configs.recommended, { languageOptions: { globals: globals.node } }];\n' > eslint.config.mjs` Enter
Type "mkdir src" Enter
Type `printf 'export const greet = () => "Hello, World!";\n' > src/hello.mjs` Enter
Type `printf 'import test from "node:test";\nimport assert from "node:assert/strict";\nimport { greet } from "./hello.mjs";\ntest("greet", () => assert.equal(greet(), "Hello, World!"));\n' > src/hello.test.mjs` Enter
Type "git add . && git commit -q -m init" Enter
Type "git push -u origin main >/dev/null 2>&1" Enter
# Mirror our oh-my-zsh "robbyrussell" prompt with zsh's built-in vcs_info, so the
# recording looks like a normal terminal without depending on oh-my-zsh.
Type `autoload -Uz vcs_info colors && colors; setopt PROMPT_SUBST; zstyle ':vcs_info:git:*' check-for-changes true; zstyle ':vcs_info:git:*' unstagedstr ' %F{yellow}✗'; zstyle ':vcs_info:git:*' stagedstr ' %F{yellow}✗'; zstyle ':vcs_info:git:*' formats ' %F{blue}git:(%F{red}%b%F{blue})%f%u%c'; zstyle ':vcs_info:git:*' actionformats ' %F{blue}git:(%F{red}%b%F{blue})%f%u%c'; precmd() { vcs_info }; PROMPT='%(?:%B%F{green}➜%f%b:%B%F{red}➜%f%b) %B%F{cyan}%c%f%b${vcs_info_msg_0_} '` Enter
Type "clear" Enter
Show

# --- 1. One command sets everything up ---
Hide
Type "npx commitment-issues init" Enter
# Commit the hook setup off-camera, then clear it so beat 2 starts on a clean
# screen and the next commit shows a single file. --no-verify skips its hook box.
Hide
Type "git add . && git commit -q --no-verify -m 'chore: set up commitment-issues'" Enter

# --- 2. Commit as usual — a messy edit gets an advisory box, not a block ---
Hide
Type `echo 'export const greet=()=>"Hello, World!";console.log(greet());' > src/hello.mjs` Enter
Type "clear" Enter

Show
Type "git commit -am 'print hello world'" Enter
Sleep 4s
Show

# --- 3. Run command to fix changes ---
Type "npm run commit:fix" Enter
Sleep 4s
Show

# --- 4. Push changes ---
Type "git push" Enter
Sleep 4s
Show