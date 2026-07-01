// Shared setup constants so the pre-commit hook, pre-push hook, and doctor all
// agree on how a consuming project invokes this tool. Everything runs through
// the published `commitment-issues` bin (resolved from node_modules/.bin, which
// Husky and npm add to PATH), so consumers never vendor scripts or reference
// node_modules paths.

export const BIN = "commitment-issues";

// Hook files git executes (via Husky's `.husky/_` wrappers). Kept minimal: they
// just call the bin's subcommand.
export const HOOK_BODIES = {
  ".husky/pre-commit": `${BIN} precommit\n`,
  ".husky/pre-push": `${BIN} prepush\n`,
};
