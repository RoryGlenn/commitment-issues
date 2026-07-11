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
# Wait commands synchronize the recording with stable output. Short sleeps hold
# each completed state long enough to read. Output lands at assets/demo.gif,
# which is already inside package.json `files`, ready to embed in the README.

Output assets/demo.gif

Set Shell "zsh"
Set FontSize 20
Set Width 1000
Set Height 740
Set Theme "Dracula"
Set Padding 24
Set TypingSpeed 1ms

# --- Hidden setup: a minimal project with a local bare Git remote.
#     A source file + its test are already committed on a tracked feature
#     branch, keeping current protected-branch advice out of this scenario. ---
Hide
Type `REPO=$(pwd) && DEMO_HOME=$(mktemp -d) && unset npm_config_http_proxy NPM_CONFIG_HTTP_PROXY npm_config_https_proxy NPM_CONFIG_HTTPS_PROXY && export HOME="$DEMO_HOME" NPM_CONFIG_CACHE="$DEMO_HOME/.npm" NPM_CONFIG_USERCONFIG="$DEMO_HOME/.npmrc" NPM_CONFIG_UPDATE_NOTIFIER=false && PACKAGE_TGZ=$(npm pack "$REPO" --ignore-scripts --pack-destination "$DEMO_HOME" --silent | tail -1) && WORKDIR=$(mktemp -d)/hello-world && mkdir -p "$WORKDIR" && REMOTE_DIR=$(mktemp -d)/demo.git && git init --bare "$REMOTE_DIR" >/dev/null 2>&1 && cd "$WORKDIR" && git init -q && git branch -M main && git config user.name demo && git config user.email demo@example.com && git remote add origin "$REMOTE_DIR" && npm init -y >/dev/null 2>&1 && printf 'node_modules/\n' > .gitignore && printf '__PROJECT_%s__\n' READY` Enter
Wait+Screen /__PROJECT_READY__/
# Install the local build (not the npm release) so the GIF reflects current code.
# Pin the fixture dependencies so unrelated releases cannot change the recording.
Type `npm install -D "$DEMO_HOME/$PACKAGE_TGZ" eslint@9.39.4 prettier@3.9.4 @eslint/js@9.39.4 globals@17.7.0 >/dev/null 2>&1 && printf '__DEPS_%s__\n' READY` Enter
Wait+Screen /__DEPS_READY__/
Type `printf 'import js from "@eslint/js";\nimport globals from "globals";\nexport default [js.configs.recommended, { languageOptions: { globals: globals.node } }];\n' > eslint.config.mjs && mkdir src && printf 'export const greet = () => "Hello, World!";\n' > src/hello.mjs && printf 'import test from "node:test";\nimport assert from "node:assert/strict";\nimport { greet } from "./hello.mjs";\ntest("greet", () => assert.equal(greet(), "Hello, World!"));\n' > src/hello.test.mjs && printf '__FILES_%s__\n' READY` Enter
Wait+Screen /__FILES_READY__/
Type "clear" Enter
Sleep 200ms
Type `git add . && git commit -q -m init && git push -q -u origin main && git switch -q -c feature/demo && git push -q -u origin feature/demo && printf '__REPO_%s__\n' READY` Enter
Wait+Screen /__REPO_READY__/
# Mirror our oh-my-zsh "robbyrussell" prompt with zsh's built-in vcs_info, so the
# recording looks like a normal terminal without depending on oh-my-zsh.
Type `autoload -Uz vcs_info colors && colors; setopt PROMPT_SUBST; zstyle ':vcs_info:git:*' check-for-changes true; zstyle ':vcs_info:git:*' unstagedstr ' %F{yellow}✗'; zstyle ':vcs_info:git:*' stagedstr ' %F{yellow}✗'; zstyle ':vcs_info:git:*' formats ' %F{blue}git:(%F{red}%b%F{blue})%f%u%c'; zstyle ':vcs_info:git:*' actionformats ' %F{blue}git:(%F{red}%b%F{blue})%f%u%c'; precmd() { vcs_info }; PROMPT='%(?:%B%F{green}➜%f%b:%B%F{red}➜%f%b) %B%F{cyan}%c%f%b${vcs_info_msg_0_} '` Enter
Type "clear" Enter
Sleep 200ms
Set TypingSpeed 50ms
Show

# --- 1. One command sets everything up ---
Type "npx commitment-issues init" Enter
Wait+Screen /Commitment Issues is set up\./
Sleep 2500ms

# Commit the hook setup off-camera, then clear it so beat 2 starts on a clean
# screen and the next commit and push show a single file. --no-verify skips the
# generated hooks while creating and pushing this hidden baseline.
Hide
Set TypingSpeed 1ms
Type "git add . && git commit -q --no-verify -m 'chore: set up commitment-issues' && git push -q --no-verify" Enter
Sleep 1500ms

# --- 2. Commit as usual — a messy edit gets an advisory box, not a block ---
Type `echo 'export const greet=()=>"Hello, World!";console.log(greet());' > src/hello.mjs` Enter
Sleep 200ms
Type "clear" Enter
Sleep 200ms
Set TypingSpeed 50ms
Show
Type "git commit -am 'print hello world'" Enter
Wait+Screen /1 file changed/
Sleep 3s

# --- 3. Run command to fix changes ---
Type "npm run commit:fix" Enter
Sleep 4500ms

# --- 4. Push changes ---
Type "git push -q" Enter
Sleep 4500ms
