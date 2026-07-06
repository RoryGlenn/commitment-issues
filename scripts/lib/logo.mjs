import pc from "picocolors";

// An ASCII take on our anxious, bespectacled bird mascot, used as the header of
// the `init` box. Kept in scripts/lib so it stays test-exempt.
const BIRD = [
  '    .-""-.',
  "   / .-.-. \\",
  "  |=(o )(o )=|",
  "  |    v    |",
  "   \\  \\_/  /",
  '    "-..-"',
];

// Text shown beside the bird: the wordmark, the tagline, and the feature pills.
function sideText() {
  return [
    null,
    pc.bold("commitment-issues"),
    pc.dim("For developers who overthink every commit."),
    null,
    pc.dim("Tiny steps  ·  Safer history  ·  Less panic"),
    null,
  ];
}

/**
 * The branded logo as an array of lines: our bird mascot with the wordmark,
 * tagline, and feature pills beside it. Intended to be spread into the top of
 * the `init` box. Colors follow the terminal's support (picocolors no-ops when
 * piped).
 * @returns {string[]} The logo lines, ready to drop into a box.
 */
export function logoLines() {
  const beside = sideText();
  return BIRD.map((row, index) => {
    const mark = pc.magenta(row.padEnd(15));
    return beside[index] ? `${mark}  ${beside[index]}` : mark;
  });
}
