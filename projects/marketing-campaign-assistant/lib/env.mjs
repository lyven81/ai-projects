// Reads ANTHROPIC_API_KEY from the environment, or from ~/.env when unset.
// The key is never written to any file, log or recording.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function loadKey() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  try {
    const line = fs.readFileSync(path.join(os.homedir(), ".env"), "utf8")
      .split(/\r?\n/).find((x) => /^\s*ANTHROPIC_API_KEY\s*=/.test(x));
    if (line) process.env.ANTHROPIC_API_KEY = line.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");
  } catch { /* no ~/.env */ }
  return process.env.ANTHROPIC_API_KEY || "";
}
