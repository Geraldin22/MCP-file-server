import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolveSafe, WORKSPACE } from "./sandbox.js";
import { logCall } from "./logger.js";

const run = promisify(execFile);

const ok = (text: string) => ({ content: [{ type: "text" as const, text }] });
const fail = (text: string) => ({ isError: true, content: [{ type: "text" as const, text }] });

// Mga file na hindi pwedeng burahin (handoff protocol)
const PROTECTED = new Set([
  "PROJECT_STATE.md", "PLAN_LOG.md", "CHECKPOINTS.md", "DECISIONS.md",
].map((n) => n.toLowerCase()));

const relPath = (describe = "Path relative to workspace root") => z.string().min(1).max(500).describe(describe);

async function git(args: string[]): Promise<string> {
  const { stdout, stderr } = await run("git", args, { cwd: WORKSPACE, timeout: 15_000, windowsHide: true });
  return (stdout + stderr).trim();
}

export function createServer(): McpServer {
  const server = new McpServer({ name: "file-server", version: "0.4.0" });

  /** Rehistro ng tool na may kasamang logging. Ang handler ay nagbabalik ng ok() o fail(). */
  function tool<S extends z.ZodRawShape>(
    name: string,
    description: string,
    inputSchema: S,
    handler: (args: z.infer<z.ZodObject<S>>) => Promise<ReturnType<typeof ok> | ReturnType<typeof fail>>
  ) {
    server.registerTool(name, { description, inputSchema }, (async (args: any): Promise<any> => {
      let result: ReturnType<typeof ok> | ReturnType<typeof fail>;
      try {
        result = await handler(args);
      } catch (e) {
        result = fail(`${name} failed: ${(e as Error).message}`);
      }
      logCall(name, args, "isError" in result && result.isError === true);
      return result;
    }) as any);
  }

  tool(
    "list_files",
    "List files and folders in a workspace directory. Use this first to see what exists " +
      "before reading or writing. Fails if the folder does not exist or is outside the workspace.",
    { path: z.string().max(500).default(".").describe("Folder path relative to workspace root") },
    async ({ path: rel }) => {
      const entries = await fs.readdir(await resolveSafe(rel), { withFileTypes: true });
      return ok(entries.map((e) => (e.isDirectory() ? `${e.name}/` : e.name)).join("\n") || "(empty folder)");
    }
  );

  tool(
    "read_file",
    "Read a text file from the workspace. Use before editing a file. Optional offset/limit " +
      "(in lines) let you read a chunk instead of the whole file. Fails if the file does not exist " +
      "or is outside the workspace.",
    {
      path: relPath("File path relative to workspace root"),
      offset: z.number().int().min(0).default(0).describe("Starting line (0-based)"),
      limit: z.number().int().min(1).max(2000).default(500).describe("Max lines to return"),
    },
    async ({ path: rel, offset, limit }) => {
      const text = await fs.readFile(await resolveSafe(rel), "utf8");
      const lines = text.split("\n");
      const chunk = lines.slice(offset, offset + limit).join("\n");
      const note = offset + limit < lines.length ? `\n[... ${lines.length - offset - limit} more lines]` : "";
      return ok(chunk + note);
    }
  );

  tool(
    "write_file",
    "Create a file or overwrite it completely with the given content. Creates parent folders " +
      "if needed. For small edits to an existing file, use str_replace instead. " +
      "Fails if the path is outside the workspace or content exceeds 200,000 characters.",
    { path: relPath("File path relative to workspace root"), content: z.string().max(200_000).describe("Full file content") },
    async ({ path: rel, content }) => {
      const target = await resolveSafe(rel);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, content, "utf8");
      return ok(`Wrote ${content.length} characters to ${rel}`);
    }
  );

  tool(
    "str_replace",
    "Replace one exact occurrence of old_str with new_str in a file. old_str must appear " +
      "exactly once or the call fails, so include surrounding text to make it unique.",
    {
      path: relPath("File path relative to workspace root"),
      old_str: z.string().min(1).describe("Exact text to find"),
      new_str: z.string().describe("Replacement text"),
    },
    async ({ path: rel, old_str, new_str }) => {
      const target = await resolveSafe(rel);
      const text = await fs.readFile(target, "utf8");
      const count = text.split(old_str).length - 1;
      if (count === 0) return fail("old_str not found in file.");
      if (count > 1) return fail(`old_str appears ${count} times; add more surrounding text to make it unique.`);
      await fs.writeFile(target, text.replace(old_str, () => new_str), "utf8");
      return ok(`Replaced 1 occurrence in ${rel}`);
    }
  );

  tool(
    "delete_file",
    "Permanently delete one file (not folders) from the workspace. Destructive: you must pass " +
      "confirm=true. Handoff files (PROJECT_STATE, PLAN_LOG, CHECKPOINTS, DECISIONS) cannot be deleted. " +
      "Fails if the path is a folder, protected, or does not exist.",
    { path: relPath("File path relative to workspace root"), confirm: z.boolean().describe("Must be true to actually delete") },
    async ({ path: rel, confirm }) => {
      if (confirm !== true) return fail("Refused: set confirm=true to delete.");
      const target = await resolveSafe(rel);
      if (PROTECTED.has(path.basename(target).toLowerCase())) return fail("Refused: this is a protected handoff file.");
      const stat = await fs.stat(target);
      if (!stat.isFile()) return fail("Path is not a file.");
      await fs.unlink(target);
      return ok(`Deleted ${rel}`);
    }
  );

  tool(
    "create_folder",
    "Create a folder (and any missing parent folders) in the workspace. Safe to call if the folder " +
      "already exists. Fails if the path is outside the workspace or a file exists at that path.",
    { path: relPath("Folder path relative to workspace root") },
    async ({ path: rel }) => {
      await fs.mkdir(await resolveSafe(rel), { recursive: true });
      return ok(`Folder ready: ${rel}`);
    }
  );

  tool(
    "move_file",
    "Move or rename a file or folder inside the workspace. Creates the destination's parent folders. " +
      "Refuses to overwrite an existing destination and refuses to move handoff files. " +
      "Fails if the source does not exist or either path is outside the workspace.",
    { from: relPath("Source path"), to: relPath("Destination path") },
    async ({ from, to }) => {
      const src = await resolveSafe(from);
      const dst = await resolveSafe(to);
      if (PROTECTED.has(path.basename(src).toLowerCase())) return fail("Refused: this is a protected handoff file.");
      await fs.stat(src); // itapon ang error kung wala
      try {
        await fs.stat(dst);
        return fail(`Destination already exists: ${to}`);
      } catch {
        /* wala pa, okay */
      }
      await fs.mkdir(path.dirname(dst), { recursive: true });
      await fs.rename(src, dst);
      return ok(`Moved ${from} -> ${to}`);
    }
  );

  tool(
    "search_code",
    "Search text files in the workspace for a plain-text query (case-insensitive). Returns up to " +
      "max_results matching lines as path:line: text. Use this instead of reading whole files. " +
      "Optional folder limits the search. Fails if the folder is outside the workspace.",
    {
      query: z.string().min(1).max(200).describe("Text to search for (not a regex)"),
      folder: z.string().max(500).default(".").describe("Folder to search, relative to workspace root"),
      max_results: z.number().int().min(1).max(100).default(30).describe("Max matching lines"),
    },
    async ({ query, folder, max_results }) => {
      const root = await resolveSafe(folder);
      const needle = query.toLowerCase();
      const hits: string[] = [];
      const skip = new Set([".git", ".logs", "node_modules"]);

      async function walk(dir: string) {
        if (hits.length >= max_results) return;
        for (const e of await fs.readdir(dir, { withFileTypes: true })) {
          if (hits.length >= max_results) return;
          if (skip.has(e.name) || e.isSymbolicLink()) continue;
          const full = path.join(dir, e.name);
          if (e.isDirectory()) {
            await walk(full);
          } else {
            const stat = await fs.stat(full);
            if (stat.size > 1_000_000) continue;
            const text = await fs.readFile(full, "utf8").catch(() => "");
            if (text.includes("\u0000")) continue; // binary
            const lines = text.split("\n");
            for (let i = 0; i < lines.length && hits.length < max_results; i++) {
              const line = lines[i];
              if (line && line.toLowerCase().includes(needle)) {
                const rel = path.relative(WORKSPACE, full).split(path.sep).join("/");
                hits.push(`${rel}:${i + 1}: ${line.trim().slice(0, 200)}`);
              }
            }
          }
        }
      }
      await walk(root);
      return ok(hits.length ? hits.join("\n") : "No matches.");
    }
  );

  tool(
    "git_status",
    "Show uncommitted changes in the workspace's git repository (short format). Use before git_commit. " +
      "Fails if the workspace is not a git repository.",
    {},
    async () => ok((await git(["status", "--short"])) || "Clean: nothing to commit.")
  );

  tool(
    "git_commit",
    "Stage ALL changes in the workspace and commit them with the given message. Use at the end of a " +
      "work step so the next session can see history. Fails if there is nothing to commit.",
    { message: z.string().min(3).max(200).describe("Commit message") },
    async ({ message }) => {
      await git(["add", "-A"]);
      return ok(await git(["commit", "-m", message]));
    }
  );

  tool(
    "git_log",
    "Show recent commits in the workspace repository, one per line. Fails if there are no commits yet.",
    { limit: z.number().int().min(1).max(50).default(10).describe("How many commits to show") },
    async ({ limit }) => ok(await git(["log", "--oneline", `-n`, String(limit)]))
  );

  return server;
}