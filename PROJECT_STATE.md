# PROJECT_STATE

## Protocol (read this first)
1. Read in this order: PROJECT_STATE.md, CHECKPOINTS.md (latest entry), DECISIONS.md
2. Write your plan in PLAN_LOG.md BEFORE touching any file
3. read_file before editing. Use search_code and offset/limit, not whole files
4. After each major step: update CHECKPOINTS.md and git_commit
5. Before ending the session: update "Current status" and "Next steps" below
6. Maximum 25 tool calls per session. Stop and checkpoint when you are close to the limit

## Roles
- Organizer agent: list_files, read_file, create_folder, move_file, search_code, str_replace, write_file (for handoff files). NO delete_file.
- Builder agent: read_file, search_code, str_replace, write_file, git tools. delete_file only when necessary, with confirm=true.

## Project
A small to-do app (index.html, app.js, style.css). Goals: organize the folders, fix the bugs, and add a delete feature.

## Current status
The workspace is still messy. Nothing has been done yet.

## Next steps
Session 1 (organizer): organize the folders and fix the bugs.
