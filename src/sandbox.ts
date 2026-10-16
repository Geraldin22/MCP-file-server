import fs from "node:fs/promises";
import path from "node:path";

export const WORKSPACE = path.resolve("workspace");

/** Resolve a user path against the workspace root. Throws if it escapes. */
export async function resolveSafe(rel: string, root: string = WORKSPACE): Promise<string> {
  const target = path.resolve(root, rel);
  const inside = (p: string) => p === root || p.startsWith(root + path.sep);
  if (!inside(target)) throw new Error("Path is outside the workspace.");

  // Symlink check: resolve the deepest existing parent and re-verify
  let probe = target;
  while (true) {
    try {
      const real = await fs.realpath(probe);
      const realRoot = await fs.realpath(root);
      if (!(real === realRoot || real.startsWith(realRoot + path.sep))) {
        throw new Error("Path is outside the workspace.");
      }
      break;
    } catch (e: any) {
      if (e.code !== "ENOENT") throw e;
      const parent = path.dirname(probe);
      if (parent === probe) break;
      probe = parent;
    }
  }
  return target;
}