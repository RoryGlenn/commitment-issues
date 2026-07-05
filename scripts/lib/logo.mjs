import pc from "picocolors";

// A little broken heart (commitment issues — get it?) beside the wordmark,
// shown at the top of `init` to greet a fresh setup. Kept in scripts/lib so it
// stays out of the missing-test check.
const HEART = [
  "   .-.   .-.",
  "  (   \\ /   )",
  "   `.  X  .'",
  "     `.|.'",
  "       V",
];

/**
 * Render the branded init banner: a broken-heart mark plus the wordmark and
 * tagline. Colors follow the terminal's support (picocolors no-ops when piped).
 * @returns {string} The banner, ready to print.
 */
export function renderLogo() {
  const sideText = [
    null,
    pc.bold("commitment-issues"),
    pc.dim("git hooks that nudge, not block"),
    null,
    null,
  ];
  const lines = HEART.map((line, index) => {
    const mark = pc.magenta(line.padEnd(15));
    return sideText[index] ? `${mark}  ${sideText[index]}` : mark;
  });
  return `\n${lines.join("\n")}\n`;
}
