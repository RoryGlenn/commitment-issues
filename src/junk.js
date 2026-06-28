// Junk fixture: intentionally violates ESLint (no-unused-vars) and Prettier
// formatting, and ships a deliberately failing sibling test (src/junk.test.js).
// Stage it (git add src/junk.js src/junk.test.js) to exercise the pre-commit
// hook, `npm run fix:staged`, and the opt-in staged-test runner.
//
// NOTE: deliberately fails `npm run lint` and `npm run format:check`.
// Scratch fixture only — do not commit it to main.

const unusedVariable = 42

export function   add( a,b ) {
return a+b
}
