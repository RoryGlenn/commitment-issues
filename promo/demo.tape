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
# Dependency setup is hidden and pins the direct tool versions used by the
# repository lockfile. The visible scenario, terminal size, branch name, and
# pauses stay fixed so reruns describe the same workflow. Output lands at
# assets/demo.gif, which is already embedded in the README.

Output assets/demo.gif

Set Shell "zsh"
Set FontFamily "DejaVu Sans Mono"
Set FontSize 18
Set Width 1000
Set Height 760
Set Theme "Dracula"
Set Padding 24
Set TypingSpeed 1ms

# --- Hidden setup: a minimal project with a local bare Git remote.
#     A source file + its test are already committed, so the recording
#     shows only the everyday experience. ---
Hide
Type "REPO=$(pwd)" Enter
Type `WORKDIR=$(mktemp -d)/hello-world && mkdir -p "$WORKDIR"` Enter
Type "REMOTE_DIR=$(mktemp -d)/demo.git" Enter
Type `git init --bare "$REMOTE_DIR" >/dev/null 2>&1` Enter
Type `cd "$WORKDIR"` Enter
Type "export LANG=C.UTF-8 LC_ALL=C.UTF-8 TZ=UTC GIT_AUTHOR_DATE=2026-07-11T12:00:00Z GIT_COMMITTER_DATE=2026-07-11T12:00:00Z" Enter
Type "git init -q --initial-branch=main && git config user.name demo && git config user.email demo@example.com && git config commit.gpgsign false" Enter
Type `git remote add origin "$REMOTE_DIR"` Enter
Type "npm init -y >/dev/null 2>&1" Enter
Type "printf 'node_modules/\n' > .gitignore" Enter
# Pack and install the local build (not the npm release) so the GIF reflects
# current code without recording a machine-specific source path.
Type `TARBALL=$(npm pack --quiet --ignore-scripts "$REPO" --pack-destination .) && mv "$TARBALL" commitment-issues-demo.tgz` Enter
Type `npm install -D --save-exact ./commitment-issues-demo.tgz eslint@9.39.4 prettier@3.9.5 @eslint/js@9.39.4 globals@17.7.0 >/dev/null 2>&1` Enter
Type "rm commitment-issues-demo.tgz" Enter
Type `printf 'import js from "@eslint/js";\nimport globals from "globals";\nexport default [js.configs.recommended, { languageOptions: { globals: globals.node } }];\n' > eslint.config.mjs` Enter
Type "mkdir src" Enter
Type `printf 'export const greet = () => "Hello, World!";\n' > src/hello.mjs` Enter
Type `printf 'import test from "node:test";\nimport assert from "node:assert/strict";\nimport { greet } from "./hello.mjs";\ntest("greet", () => assert.equal(greet(), "Hello, World!"));\n' > src/hello.test.mjs` Enter
Type "git add . && git commit -q -m init" Enter
Type "git push -u origin main >/dev/null 2>&1" Enter
# Work on a feature branch and give it an upstream before the recording starts.
Type "git switch -q -c feature/greeting && git push -q -u origin HEAD" Enter
# Mirror our oh-my-zsh "robbyrussell" prompt with zsh's built-in vcs_info, so the
# recording looks like a normal terminal without depending on oh-my-zsh.
Type `autoload -Uz vcs_info colors && colors; setopt PROMPT_SUBST; zstyle ':vcs_info:git:*' check-for-changes true; zstyle ':vcs_info:git:*' unstagedstr ' %F{yellow}✗'; zstyle ':vcs_info:git:*' stagedstr ' %F{yellow}✗'; zstyle ':vcs_info:git:*' formats ' %F{blue}git:(%F{red}%b%F{blue})%f%u%c'; zstyle ':vcs_info:git:*' actionformats ' %F{blue}git:(%F{red}%b%F{blue})%f%u%c'; precmd() { vcs_info }; PROMPT='%(?:%B%F{green}➜%f%b:%B%F{red}➜%f%b) %B%F{cyan}%c%f%b${vcs_info_msg_0_} '` Enter
Type "clear" Enter
Set TypingSpeed 100ms
Show

# --- 1. One command sets everything up ---
Type "npx --no-install commitment-issues init" Enter
Sleep 4s
# Commit the hook setup off-camera, then clear it so beat 2 starts on a clean
# screen and the next commit shows a single file. --no-verify skips its hook box.
Hide
Set TypingSpeed 1ms
Type "git add . && git commit -q --no-verify -m 'chore: set up commitment-issues'" Enter

# --- 2. Commit as usual — a messy edit gets an advisory box, not a block ---
Type `echo 'export const greet=()=>"Hello, World!";console.log(greet());' > src/hello.mjs` Enter
Type "clear" Enter

Set TypingSpeed 100ms
Show
Type "git commit -q -am 'print hello world'" Enter
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
