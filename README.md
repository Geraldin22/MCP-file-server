# MCP File Server

A Node.js and TypeScript Model Context Protocol (MCP) server that gives AI agents controlled file-system and Git access inside a sandboxed workspace. It uses the official MCP TypeScript SDK, stateless Streamable HTTP, Zod input validation, and bearer-token authentication.

## Features

- File and directory listing
- Chunked file reading and plain-text search
- File creation, editing (unique-match replace), moving, and folder creation
- Gated file deletion
- Git status, commit, and log in a separate repository inside the workspace
- Strict input validation using Zod
- Workspace path restriction and symlink escape protection
- Bearer-token authentication on the public endpoint
- JSON-lines audit log of every tool call
- Automated tests for sandbox security
- Handoff files for continuing work across agent sessions

## Technology Stack

| Component | Technology | Purpose |
|---|---|---|
| Runtime | Node.js | Runs the server |
| Language | TypeScript (run with tsx) | Typed application code |
| MCP SDK | Official TypeScript MCP SDK | Implements the MCP server |
| Transport | Streamable HTTP (stateless) | Connects remote MCP clients |
| Validation | Zod | Validates tool inputs |
| Web server | Express | Handles HTTP requests and routes |
| Configuration | dotenv | Loads environment variables |
| Process manager | PM2 | Keeps the server running and restarts it on failure |
| Tunnel | ngrok (static domain) | Provides public HTTPS access |
| Testing | Node.js test runner, MCP Inspector, Cursor | Sandbox tests, per-tool checks, real-client check |

## Requirements

- Node.js and npm
- Git
- An MCP-compatible client (MCP Inspector for testing, Cursor as the real client)
- PM2 (`npm install -g pm2`) and an ngrok account for the deployment setup

## Installation

```bash
git clone https://github.com/Geraldin22/MCP-file-server.git
cd MCP-file-server
npm install
```

Create a `.env` file in the project root based on `.env.example`:

```
MCP_TOKEN=<a random string of at least 24 characters>
PORT=3000
```

Generate a token with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

The server refuses to start if `MCP_TOKEN` is missing or shorter than 24 characters. `.env` is git-ignored. Never commit real tokens, and never show them in screenshots.

The workspace is the `workspace/` folder in the project root. Initialize its separate Git repository once (used by the git tools):

```bash
cd workspace
git init
git config user.name "agent"
git config user.email "agent@local"
cd ..
```

## Running the Server

Run the sandbox tests:

```bash
npm test
```

Run locally over stdio with MCP Inspector (no token needed):

```bash
npx @modelcontextprotocol/inspector npx tsx src/index.ts
```

Run the HTTP server in the foreground:

```bash
npm run start:http
```

Run it under PM2 (restarts on failure, survives closed terminals):

```bash
pm2 start ecosystem.config.cjs
pm2 status
pm2 save
```

The local MCP endpoint is `http://127.0.0.1:3000/mcp`. The server binds to `127.0.0.1` only, so the tunnel is the only way in from outside.

## Remote Access (ngrok)

ngrok runs as a separate process (see Known Limitations):

```bash
ngrok http --url=<your-static-domain>.ngrok-free.dev 3000
```

After a reboot, restart ngrok manually and run `pm2 resurrect` if the PM2 process list is empty.

## Connecting a Client (Cursor)

Add this to Cursor's user-level `mcp.json` (`~/.cursor/mcp.json`). Do **not** put it inside the repository, because it contains the token:

```json
{
  "mcpServers": {
    "file-server": {
      "url": "https://<your-static-domain>.ngrok-free.dev/mcp",
      "headers": { "Authorization": "Bearer <your token>" }
    }
  }
}
```

Use a Local agent in Agent mode. Cloud agents cannot reach your MCP server. Before any session, ask the agent to run `list_files` as a connection check.

## HTTP Endpoints

| Endpoint | Purpose |
|---|---|
| `POST /mcp` | Handles MCP requests; requires `Authorization: Bearer <token>` |
| `GET /mcp` | Returns 405 Method Not Allowed |
| `DELETE /mcp` | Returns 405 Method Not Allowed |

Requests without a valid token receive `401 Unauthorized`.

Quick check (PowerShell):

```powershell
$token = (Get-Content .env | Select-String "MCP_TOKEN").ToString().Split("=")[1].Trim()
curl.exe -i -X POST http://127.0.0.1:3000/mcp                      # expect 401
curl.exe -i -X POST http://127.0.0.1:3000/mcp -H "Authorization: Bearer $token" -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -d '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\"}'   # expect 200
```

## Available MCP Tools

The server exposes eleven tools:

| Tool | Purpose |
|---|---|
| `list_files` | Lists files and folders in a workspace directory |
| `read_file` | Reads a text file, with optional line offset and limit |
| `write_file` | Creates a file or overwrites it completely |
| `str_replace` | Replaces one exact occurrence of text; fails if the match is not unique |
| `delete_file` | Deletes one file; requires `confirm=true`; handoff files are protected |
| `create_folder` | Creates a folder and any missing parents |
| `move_file` | Moves or renames; refuses to overwrite or to move handoff files |
| `search_code` | Case-insensitive text search with a result cap |
| `git_status` | Shows uncommitted changes in the workspace repository |
| `git_commit` | Stages all changes and commits with a message |
| `git_log` | Shows recent commits |

Every tool validates input with Zod, returns `isError: true` with a readable message on failure, and is logged.

## Security and Sandboxing

- **Path validation:** every tool resolves paths through `resolveSafe()` and rejects `../`, absolute paths, and same-prefix sibling folders.
- **Symlink protection:** real paths are resolved and re-checked, so symlinks and junctions cannot escape the workspace.
- **Authentication:** bearer token compared with `timingSafeEqual`; server refuses to start without a strong token.
- **Network exposure:** server binds to `127.0.0.1`; only the tunnel reaches it.
- **Gated destructive actions:** `delete_file` needs `confirm=true`; `PROJECT_STATE.md`, `PLAN_LOG.md`, `CHECKPOINTS.md`, and `DECISIONS.md` cannot be deleted or moved.
- **Audit log:** each call is appended to `workspace/.logs/calls.log` as one JSON line (timestamp, tool, truncated arguments, error flag). The log is git-ignored.
- **Limits:** request body 1 MB, file writes 200,000 characters, search results capped.

These controls reduce risk but are not a guarantee against every attack. See the report for the threat discussion.

## Automated Tests

```bash
npm test
```

The sandbox suite (`test/sandbox.test.ts`) covers:

- Legitimate workspace paths are allowed
- `../` traversal is rejected
- Absolute paths are rejected
- A sibling folder with the same prefix (`workspace-evil`) is rejected
- Symlink escapes are rejected

Latest recorded run of the sandbox suite: 5 passed, 0 failed, 0 skipped. Re-run the tests before submission if the code changes.

## Project Handoff Protocol

Four files in `workspace/` carry context between agent sessions:

- `PROJECT_STATE.md`: protocol, roles, current status, next steps
- `PLAN_LOG.md`: the plan, written before acting
- `CHECKPOINTS.md`: one entry per finished step
- `DECISIONS.md`: agreed conventions

Each session reads these first, writes its plan before changing anything, reads before editing, uses `search_code` and chunked reads instead of whole files, updates the checkpoint and commits after each major step, and stops at 25 tool calls.

## Demo Task and Evidence

Two agent sessions completed one task on a messy to-do app:

1. **Organizer (Session 1):** sorted files into `src/`, `notes/`, and `assets/`, and fixed two of three seeded bugs.
2. **Builder (Session 2, new chat):** read the handoff files, fixed the remaining bug, and added a delete button.

Evidence is in `evidence/` (tool-call logs for both sessions, screenshots) and in the workspace Git history. The full write-up is in [`REPORT.md`](REPORT.md).

## Verification and Known Limitations

- Roles (for example, "the Organizer has no `delete_file`") are instructions in `PROJECT_STATE.md`, not enforced by the server. One shared token gives access to all tools.
- ngrok is not managed by PM2 (it could not be launched reliably under PM2 on Windows), so it must be restarted after a reboot.
- `pm2 startup` does not work on Windows; use `pm2 resurrect` after a reboot.
- The server is stateless, so it keeps no per-client session.
- The health of the live tunnel depends on ngrok being online; check it before use.
- Not implemented: `if_version` locking, a repo map, per-agent tokens.
