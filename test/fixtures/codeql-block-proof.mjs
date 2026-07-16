// Disposable CodeQL merge-protection proof for issue #177.
// This branch must never be merged.
import { exec } from "node:child_process";

exec(process.argv[2]);
