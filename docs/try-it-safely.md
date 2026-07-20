# Try Commitment Issues safely in five minutes

This walkthrough creates a repository in your system's temporary directory,
uses only project-local packages, and deletes that repository when you finish.
It does not need or modify an existing project.

You need Git, npm, and Node.js 22.11.0 or newer. Check them before starting:

```bash
git --version
node --version
npm --version
```

Keep the same shell window open for the whole walkthrough. The
`tutorial_root` / `$tutorialRoot` variable identifies the exact temporary
directory used by the cleanup step.

## 1. Create the disposable repository

Choose the commands for your shell. Both versions create a uniquely named
directory below the operating system's temporary directory and print its full
path.

### POSIX shells (macOS, Linux, Git Bash)

```sh
tutorial_root="$(mktemp -d "${TMPDIR:-/tmp}/commitment-issues-tryout.XXXXXX")"
printf 'Disposable repository: %s\n' "$tutorial_root"
cd "$tutorial_root"
```

### PowerShell

```powershell
$tutorialRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("commitment-issues-tryout-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tutorialRoot | Out-Null
Write-Host "Disposable repository: $tutorialRoot"
Set-Location $tutorialRoot
```

Initialize Git, add a repository-local identity for the tutorial commit, and
create a minimal npm project:

```bash
git init -b tutorial
git config user.name "Commitment Issues Tutorial"
git config user.email "tutorial@example.invalid"
npm init -y
npm install -D commitment-issues "eslint@^9" "prettier@^3"
```

Everything is installed inside this disposable project's `node_modules`. No
global package or registry-downloading `npx` fallback is used.

The example needs a minimal ESLint flat config. A real project would put its
own rules here; this tutorial keeps lint quiet so the formatting suggestion is
easy to recognize.

### POSIX shells

```sh
cat > eslint.config.mjs <<'EOF'
export default [{ files: ["**/*.js"], rules: {} }];
EOF
```

### PowerShell

```powershell
@'
export default [{ files: ["**/*.js"], rules: {} }];
'@ | Set-Content -Encoding utf8 eslint.config.mjs
```

## 2. Preview setup before changing the project

Run the local binary with `--dry-run` first:

```bash
npx --no-install commitment-issues init --dry-run
```

The preview lists the package scripts, native Git hooks, configuration, and
ignore defaults it would add, then ends with `No files were written.`

Apply those exact setup changes only after reviewing the preview:

```bash
npx --no-install commitment-issues init
```

The success message confirms that the next commit will run advisory checks.

## 3. Make one intentionally imperfect file

The missing spaces and semicolons below are deliberate.

### POSIX shells

```sh
mkdir src
cat > src/example.js <<'EOF'
const greeting="hello from a disposable repo"
console.log(greeting)
EOF
```

### PowerShell

```powershell
New-Item -ItemType Directory -Path src | Out-Null
@'
const greeting="hello from a disposable repo"
console.log(greeting)
'@ | Set-Content -Encoding utf8 src/example.js
```

Stage only that example and commit normally:

```bash
git add src/example.js
git commit -m "Try Commitment Issues"
```

The pre-commit hook reports `Pre-commit suggestions found`, identifies one
file with formatting issues, and shows `npm run commit:fix` as the safe next
step. It also notes that the example has no test. Most importantly, it says
`Commit will continue.` and Git creates the commit: the default result is
advisory, not blocking.

## 4. Remove the disposable repository

First leave the repository and print the exact path that will be removed. The
guard accepts only the uniquely named tutorial directory created in step 1.

### POSIX shells

```sh
cd "$(dirname "$tutorial_root")"
printf 'Removing disposable repository: %s\n' "$tutorial_root"
case "$(basename "$tutorial_root")" in
  commitment-issues-tryout.*) rm -rf -- "$tutorial_root" ;;
  *) printf 'Refusing to remove unexpected path: %s\n' "$tutorial_root" >&2 ;;
esac
unset tutorial_root
```

### PowerShell

```powershell
Set-Location (Split-Path -Parent $tutorialRoot)
Write-Host "Removing disposable repository: $tutorialRoot"
if ((Split-Path -Leaf $tutorialRoot) -notlike "commitment-issues-tryout-*") {
  throw "Refusing to remove unexpected path: $tutorialRoot"
}
Remove-Item -LiteralPath $tutorialRoot -Recurse -Force
Remove-Variable tutorialRoot
```

The package, generated hooks, Git history, and example all lived inside that
printed temporary directory, so removing it completes the cleanup without
touching another repository.
