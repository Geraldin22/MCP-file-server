# CHECKPOINTS
(isang entry kada natapos na hakbang, may petsa)

## 2026-10-17 — Organizer session 1
- Sinunod ang Protocol: binasa ang PROJECT_STATE, CHECKPOINTS, DECISIONS; plano nasa PLAN_LOG.md.
- Nilipat: index.html, app.js, style.css → src/; ideas.txt, meeting-notes.md, scratch.md → notes/; logo.svg → assets/.
- Hindi ginagalaw ang mga link sa src/index.html (style.css at app.js, magkapatid pa rin sa src/). style.css walang image path.
- Inayos ang 2 bug sa src/app.js (str_replace): toggleTask ngayon ay nagto-toggle; ang count ay remaining incomplete tasks. Hindi ginagalaw ang pangatlo (addTask ay tumatanggap pa ng empty text).
- Walang delete_file.

## 2026-10-17 — Builder session 2
- Sinunod ang Protocol: binasa ang PROJECT_STATE, CHECKPOINTS, DECISIONS; plano nasa PLAN_LOG.md bago mag-edit.
- Inayos ang pangatlong bug sa src/app.js addTask: blank o whitespace ay hindi na idinadagdag; naka-trim ang text bago i-save.
- Delete button sa bawat task: deleteTask, at button (class delete, text Delete) sa render. Ang text span lang ang nagto-toggle. CSS sa src/style.css para sa row at delete button.
- Walang delete_file.
