# PROJECT_STATE

## Protocol (basahin muna ito)
1. Basahin ayon sa pagkakasunod: PROJECT_STATE.md, CHECKPOINTS.md (huling entry), DECISIONS.md
2. Isulat ang plano sa PLAN_LOG.md BAGO gumalaw ng kahit anong file
3. read_file bago mag-edit. Gamitin ang search_code at offset/limit, hindi buong file
4. Pagkatapos ng bawat malaking hakbang: i-update ang CHECKPOINTS.md at git_commit
5. Bago tapusin ang session: i-update ang "Current status" at "Next steps" sa baba
6. Maximum 25 tool calls kada session. Huminto at mag-checkpoint kung malapit na

## Roles
- Organizer agent: list_files, read_file, create_folder, move_file, search_code, str_replace, write_file (para sa handoff files). WALANG delete_file.
- Builder agent: read_file, search_code, str_replace, write_file, git tools. delete_file lang kung kailangan, may confirm=true.

## Project
Maliit na to-do app (index.html, app.js, style.css). Layunin: ayusin ang folders, ayusin ang mga bug, magdagdag ng delete feature.

## Current status
Magulo pa ang workspace. Wala pang nagawa.

## Next steps
Session 1 (organizer): ayusin ang folders at ang mga bug.
