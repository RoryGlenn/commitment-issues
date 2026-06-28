// Junk fixture: intentionally violates ESLint (no-unused-vars) and Prettier
// formatting so you can watch the pre-commit hook and `npm run fix:staged` /
// `npm run commit:fix` react. Stage it (git add src/junk.js) and commit.
//
// NOTE: this file deliberately fails `npm run lint` and `npm run format:check`.
// It is a manual scratch fixture — do not commit it to main.

const unusedVariable = 42;
const messy = "not   formatted";

function add(a,  b  ) {
  return a  + b;
}

console.log(
    add(1, 2), messy);
