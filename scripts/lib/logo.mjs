import pc from "picocolors";

// A bold, split heart (commitment issues — get it?) with the wordmark, used as
// the header of the `init` box. Kept in scripts/lib so it stays test-exempt.
const HEART = [
  "  ▄██▄   ▄██▄",
  " ██████ ██████",
  " ▀█████ █████▀",
  "   ▀███ ███▀",
  "     ▀█ █▀",
];

// Top-to-bottom red→magenta gradient so the mark reads as a (broken) heart
// rather than an error box.
const SHADES = [pc.redBright, pc.red, pc.red, pc.magenta, pc.magentaBright];

/**
 * The branded logo as an array of lines: a split-heart mark with the wordmark
 * and tagline beside it. Intended to be spread into the top of the `init` box.
 * Colors follow the terminal's support (picocolors no-ops when piped).
 * @returns {string[]} The logo lines, ready to drop into a box.
 */
export function logoLines() {
  return HEART.map((row, index) => {
    const mark = SHADES[index](row.padEnd(15));
    if (index === 2) {
      return `${mark}  ${pc.bold("commitment-issues")}`;
    }
    if (index === 3) {
      return `${mark}  ${pc.dim("git hooks that nudge, not block")}`;
    }
    return mark;
  });
}
