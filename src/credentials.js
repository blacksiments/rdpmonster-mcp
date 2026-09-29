import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function credDir() {
  return process.env.RDPMONSTER_MCP_CRED_DIR || path.join(os.homedir(), ".config", "rdpmonster-mcp");
}

function readFile(name) {
  const p = path.join(credDir(), name);
  if (!fs.existsSync(p)) return "";
  return fs.readFileSync(p, "utf8").replace(/[\r\n]+$/, "");
}

/**
 * Default account from env or ~/.config/rdpmonster-mcp/{email,password}
 */
export function loadCredentials({ email, password } = {}) {
  const resolvedEmail =
    email ||
    process.env.RDPMONSTER_EMAIL ||
    process.env.RDPMONSTER_USERNAME ||
    readFile("email");
  const resolvedPassword =
    password || process.env.RDPMONSTER_PASSWORD || readFile("password");

  if (!resolvedEmail || !resolvedPassword) {
    throw new Error(
      `Missing credentials. Pass email/password or put them in ${credDir()}/{email,password}`,
    );
  }
  return { email: resolvedEmail.trim(), password: resolvedPassword };
}
