import fs from "node:fs";
import path from "node:path";

const LOG_DIR = path.resolve("workspace", ".logs");
const LOG_FILE = path.join(LOG_DIR, "calls.log");

/** Isang linya ng JSON kada tool call. Hindi kasama ang laman ng file (maikli lang). */
export function logCall(tool: string, args: Record<string, unknown>, isError: boolean) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    const safeArgs = Object.fromEntries(
      Object.entries(args).map(([k, v]) =>
        [k, typeof v === "string" && v.length > 80 ? `${v.slice(0, 80)}…(${v.length} chars)` : v]
      )
    );
    const line = JSON.stringify({ ts: new Date().toISOString(), tool, args: safeArgs, error: isError });
    fs.appendFileSync(LOG_FILE, line + "\n", "utf8");
  } catch {
    // hindi dapat mag-crash ang tool dahil lang sa log
  }
}