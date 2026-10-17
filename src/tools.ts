import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveSafe } from "./sandbox.js";

const ok = (text: string) => ({ content: [{ type: "text" as const, text }] });
const fail = (text: string) => ({ isError: true, content: [{ type: "text" as const, text }] });

export function createServer(): McpServer {
  const server = new McpServer({ name: "file-server", version: "0.3.0" });

  server.registerTool(
    "list_files",
    {
      description:
        "List files and folders in a workspace directory. Use this first to see what exists " +
        "before reading or writing. Fails if the folder does not exist or is outside the workspace.",
      inputSchema: { path: z.string().max(500).default(".").describe("Folder path relative to workspace root") },
    },
    async ({ path: rel }) => {
      try {
        const entries = await fs.readdir(await resolveSafe(rel), { withFileTypes: true });
        return ok(entries.map((e) => (e.isDirectory() ? `${e.name}/` : e.name)).join("\n") || "(empty folder)");
      } catch (e) {
        return fail(`Could not list folder: ${(e as Error).message}`);
      }
    }
  );

  server.registerTool(
    "read_file",
    {
      description:
        "Read a text file from the workspace. Use before editing a file. Optional offset/limit " +
        "(in lines) let you read a chunk instead of the whole file. Fails if the file does not exist " +
        "or is outside the workspace.",
      inputSchema: {
        path: z.string().min(1).max(500).describe("File path relative to workspace root"),
        offset: z.number().int().min(0).default(0).describe("Starting line (0-based)"),
        limit: z.number().int().min(1).max(2000).default(500).describe("Max lines to return"),
      },
    },
    async ({ path: rel, offset, limit }) => {
      try {
        const text = await fs.readFile(await resolveSafe(rel), "utf8");
        const lines = text.split("\n");
        const chunk = lines.slice(offset, offset + limit).join("\n");
        const note = offset + limit < lines.length ? `\n[... ${lines.length - offset - limit} more lines]` : "";
        return ok(chunk + note);
      } catch (e) {
        return fail(`Could not read file: ${(e as Error).message}`);
      }
    }
  );

  server.registerTool(
    "write_file",
    {
      description:
        "Create a file or overwrite it completely with the given content. Creates parent folders " +
        "if needed. For small edits to an existing file, use str_replace instead. " +
        "Fails if the path is outside the workspace or content exceeds 200,000 characters.",
      inputSchema: {
        path: z.string().min(1).max(500).describe("File path relative to workspace root"),
        content: z.string().max(200_000).describe("Full file content"),
      },
    },
    async ({ path: rel, content }) => {
      try {
        const target = await resolveSafe(rel);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, content, "utf8");
        return ok(`Wrote ${content.length} characters to ${rel}`);
      } catch (e) {
        return fail(`Could not write file: ${(e as Error).message}`);
      }
    }
  );

  server.registerTool(
    "str_replace",
    {
      description:
        "Replace one exact occurrence of old_str with new_str in a file. old_str must appear " +
        "exactly once or the call fails, so include surrounding text to make it unique.",
      inputSchema: {
        path: z.string().min(1).max(500).describe("File path relative to workspace root"),
        old_str: z.string().min(1).describe("Exact text to find"),
        new_str: z.string().describe("Replacement text"),
      },
    },
    async ({ path: rel, old_str, new_str }) => {
      try {
        const target = await resolveSafe(rel);
        const text = await fs.readFile(target, "utf8");
        const count = text.split(old_str).length - 1;
        if (count === 0) return fail("old_str not found in file.");
        if (count > 1) return fail(`old_str appears ${count} times; add more surrounding text to make it unique.`);
        await fs.writeFile(target, text.replace(old_str, () => new_str), "utf8");
        return ok(`Replaced 1 occurrence in ${rel}`);
      } catch (e) {
        return fail(`Could not edit file: ${(e as Error).message}`);
      }
    }
  );

  server.registerTool(
    "delete_file",
    {
      description:
        "Permanently delete one file (not folders) from the workspace. Destructive: only use when " +
        "the task clearly requires removing a file. Fails if the path is a folder or does not exist.",
      inputSchema: { path: z.string().min(1).max(500).describe("File path relative to workspace root") },
    },
    async ({ path: rel }) => {
      try {
        const target = await resolveSafe(rel);
        const stat = await fs.stat(target);
        if (!stat.isFile()) return fail("Path is not a file.");
        await fs.unlink(target);
        console.error(`[audit] delete_file ${rel}`);
        return ok(`Deleted ${rel}`);
      } catch (e) {
        return fail(`Could not delete file: ${(e as Error).message}`);
      }
    }
  );

  return server;
}