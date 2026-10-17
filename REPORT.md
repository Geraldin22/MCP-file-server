# MCP File Server: Midterms Pt 1 Report

**Course:** CS 3A / CS 3B, Week 06 (Model Context Protocol)
**Repository:** https://github.com/Geraldin22/MCP-file-server

## 1. Summary

I built and deployed an MCP file-server connector. It gives AI agents a sandboxed `workspace/` folder where they can list, read, search, edit, move, and commit files. It is served over HTTPS with token authentication, kept alive by pm2, and tested with a real MCP client (Cursor). I proved it with a two-session task: an Organizer agent restructured a messy to-do app and fixed bugs, then a fresh Builder agent with no memory continued the work using only the handoff files.

## 2. Stack and justification

| Layer | Choice | Why |
|---|---|---|
| Runtime / SDK | Node.js + official TypeScript MCP SDK | Reference stack from the course; the SDK handles the JSON-RPC protocol, so I only write tools. |
| Validation | zod | Every tool input has a typed, bounded schema, so bad calls fail before touching any file. |
| Transport | Streamable HTTP (Express), stateless | Needed so a remote client can connect. Stateless means a new server and transport per request, so a pm2 restart never leaves a broken session. stdio is kept (`src/index.ts`) for Inspector testing. |
| Exposure | ngrok with a static domain | Gives a stable public HTTPS URL without a VPS. |
| Process manager | pm2 | Auto-restarts the server and keeps it running after terminals are closed. |
| Config / secrets | `.env` via dotenv (git-ignored) | The token never appears in code. `.env.example` holds a placeholder only. |
| Testing | MCP Inspector, `node:test`, then Cursor | Inspector for tool-by-tool checks, automated tests for the sandbox, a real client for end-to-end. |

**Layout:** `sandbox.ts` (path safety), `tools.ts` (all tools), `logger.ts` (call log), `index.ts` (stdio entry), `http.ts` (HTTP entry and auth). Server, tools, and config are separate.

## 3. Tool design

There are 11 single-purpose tools:

- **Files:** `list_files`, `read_file` (offset/limit for chunked reads), `write_file`, `str_replace` (must match exactly once), `delete_file`, `create_folder`, `move_file`
- **Search:** `search_code` (plain-text search with a result cap, so agents do not read whole files)
- **Git-lite:** `git_status`, `git_commit`, `git_log` (run in a separate git repo inside `workspace/`, so agent commits never touch the server's own code)

Design decisions:
- Each description says what the tool does, when to use it, and how it fails. The description is the prompt the model reads.
- Inputs use strict zod schemas (`min`/`max`, integer limits, defaults).
- All failures return `isError: true` with a readable message, never a stack trace. A shared `tool()` wrapper catches exceptions so the server cannot crash from a bad call.
- `str_replace` refuses ambiguous matches, and `move_file` refuses to overwrite an existing destination.

## 4. Security and threats

**Controls**
1. **Sandbox root.** Every tool resolves paths through `resolveSafe()`. It rejects `../`, absolute paths, and sibling folders with the same prefix (such as `workspace-evil`). It also resolves real paths, so symlinks and junctions cannot escape. `Select-String` on `src/tools.ts` shows every file tool calls it.
2. **Automated tests.** Five traversal tests pass (`npm test`): normal paths allowed, `../`, absolute paths, same-prefix sibling, and symlink escape.
3. **Authentication.** The public `/mcp` endpoint requires `Authorization: Bearer <token>`. The token comparison uses `timingSafeEqual`, the server refuses to start without a token of at least 24 characters, and it binds to `127.0.0.1` so only the tunnel can reach it. Verified: no token returns 401, valid token returns 200.
4. **Gated destructive actions.** `delete_file` requires `confirm=true` and refuses to delete the four handoff files. `move_file` also refuses to move them.
5. **Audit log.** Every tool call is written as one JSON line (timestamp, tool, arguments, error flag). Long arguments are truncated so file contents are not logged.

**Threats and residual risks**
- **One shared token.** Anyone holding it has full access to the workspace. Mitigation: it is stored only in `.env` and the client config, and it can be rotated by editing `.env` and running `pm2 restart`. Per-agent tokens would be the next step.
- **Roles are soft.** The "no `delete_file` for the Organizer" rule is an instruction in `PROJECT_STATE.md`, not enforced by the server. Hard enforcement would need a tool allowlist per token.
- **Prompt injection through file contents.** A malicious file could tell an agent to misuse tools. The sandbox, delete gate, and protected files limit the damage, but do not remove the risk.
- **No rate limiting.** A leaked token could be used to spam writes. The request body is capped at 1 MB and file writes at 200,000 characters.
- **Public tunnel.** Anyone can reach the URL, but without the token they only receive 401.

## 5. Agent management and the handoff protocol

The workspace holds four handoff files:
- `PROJECT_STATE.md`: protocol, roles, current status, next steps
- `PLAN_LOG.md`: the plan, written before any change
- `CHECKPOINTS.md`: one entry per finished step
- `DECISIONS.md`: agreed conventions (folder layout)

The protocol tells each agent to read these first, plan before acting, read before editing, use search and chunked reads instead of whole files, checkpoint and commit after each major step, and stop at 25 tool calls.

**Session 1: Organizer** (no `delete_file`). It read the handoff files, wrote its plan, moved files into `src/`, `notes/`, and `assets/`, fixed two of the three seeded bugs with `str_replace`, deliberately left the third alone as instructed, updated the handoff files, and committed (`a6888c9`).

**Session 2: Builder** (new chat, no memory of Session 1). It read `PROJECT_STATE.md`, learned from "Next steps" what remained, fixed the empty-task bug, added a delete button to each task, updated the handoff files, and committed (`cde397a`).

Evidence: `evidence/session1-calls.log`, `evidence/session2-calls.log`, the `PLAN_LOG.md` and `CHECKPOINTS.md` files, and the workspace `git log`.

**Efficiency:** Session 1 used 25 tool calls and Session 2 used 20 (limit: 25). Both read before writing and used `str_replace` instead of rewriting files. *(Fill in N from the logs. `calls.log` also contains earlier manual test calls, so I counted from the first `PROJECT_STATE.md` read of each session.)*

## 6. What went wrong and what I learned

1. **First Session 2 attempt used the wrong agent mode.** The chat was set to a Cloud agent, which has no access to my local MCP server. It created unrelated files in its own copy of the repo. Nothing reached my machine, and I discarded the run. Lesson: run a connection check (`list_files`) before every agent session, and use Local mode. The prompt now tells the agent to stop if it cannot see the file-server tools.
2. **A secret appeared in a screenshot.** The token was visible once while I was configuring the project. I generated a new token, kept `.env` git-ignored, kept `.env.example` as a placeholder, and checked the repo with `git grep` for the token value. Lesson: treat screenshots as part of the attack surface.
3. **Wrong git repository.** An old git repo in my home folder meant `git status` showed my entire user directory. I caught it before committing and ran `git init` inside the project. Lesson: always read `git status` before `git add`.
4. **ngrok under pm2 on Windows.** pm2 could not reliably launch ngrok (alias and `cmd` problems), so it ran in its own process. pm2 still supervises the server. After a reboot, ngrok must be started again. A Windows service could automate that.
5. **Stale session after restart.** After a restart, Cursor showed a "Server not initialized" error until I cleared the old process and reconnected. This is why the server is stateless.

## 7. How to reproduce

See `README.md`: clone, `npm install`, create `.env` from `.env.example` with a random token, `npm test`, `pm2 start ecosystem.config.cjs`, run ngrok against port 3000, then add the URL and bearer header to the client's MCP config.

## 8. Stretch items not done

`if_version` locking, a repo map, per-agent tokens, and automatic ngrok start.
