import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveSafe } from "../src/sandbox.js";

// Gumagawa ng pansamantalang workspace + "labas" folder para hindi masira ang totoo mong files
const base = await fs.mkdtemp(path.join(os.tmpdir(), "sandbox-test-"));
const root = path.join(base, "workspace");
const outside = path.join(base, "outside");
await fs.mkdir(root, { recursive: true });
await fs.mkdir(outside, { recursive: true });
await fs.writeFile(path.join(root, "ok.txt"), "ok");
await fs.writeFile(path.join(outside, "secret.txt"), "secret");

const blocked = (p: string) =>
  assert.rejects(() => resolveSafe(p, root), /outside the workspace/);

test("allows normal paths", async () => {
  await resolveSafe("ok.txt", root);
  await resolveSafe("new/folder/file.md", root); // wala pa, pero valid
  await resolveSafe(".", root);
});

test("blocks ../ traversal", async () => {
  await blocked("..");
  await blocked("../outside/secret.txt");
  await blocked("a/../../outside/secret.txt");
});

test("blocks absolute paths", async () => {
  await blocked(path.join(outside, "secret.txt"));
  await blocked("C:\\Windows\\win.ini");
  await blocked("/etc/passwd");
});

test("blocks sibling folder with same prefix", async () => {
  // halimbawa: workspace-evil ay hindi dapat ituring na nasa loob ng workspace
  await fs.mkdir(root + "-evil", { recursive: true });
  await blocked("../workspace-evil/x.txt");
});

test("blocks symlink escape", async (t) => {
  const link = path.join(root, "link");
  try {
    await fs.symlink(outside, link, "junction"); // "junction" para gumana sa Windows nang walang admin
  } catch {
    t.skip("Hindi makagawa ng symlink sa system na ito");
    return;
  }
  await blocked("link/secret.txt");
  await blocked("link");
});