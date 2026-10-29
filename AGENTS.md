# Team Room development

- This repository owns the generic meeting plugin. Do not depend on a game or another project's source directory.
- Preserve the installed plugin ID jyfood-room@jyfood-local and MCP server key team-room unless the user explicitly requests an identity migration.
- Never commit real chat IDs, membership registries, room transcripts, local paths, tokens or screenshots from user conversations. Tests use synthetic members.
- Runtime data lives outside the repository in ~/.codex/team-room, or TEAM_ROOM_HOME. Tests must use isolated temporary data.
- Keep explicit project scope, immutable routing and message retries, director-only user input and each participant's own substantive posts.
- Do not add idle AI calls, automatic resend, replacement chats or model runtimes. Native chat tools are used only within verified human authorization.
- Inline layout must not depend on the iframe's viewport height. Handle display-mode context and teardown; late callbacks must never dispatch after closing.
- Run npm test for store/bridge changes. For layout changes run the documented browser harness when Playwright is available, and disclose if actual Codex display transitions remain unverified.

- Apply docs/collaboration-efficiency.md to every collaboration: routine 1–2 discussion rounds, delta handoffs, event waiting instead of AI polling, change-focused review and deterministic local checks. Preserve explicit authorization and unresolved blockers. The director integrates; only needed existing participants are assigned.

- Persist role ownership in project instructions and follow the role/handoff section of docs/collaboration-efficiency.md: planner owns game systems/balance/level design; designer owns character/UI/background/3D asset planning; QA owns test cases/error reproduction/validation. Programmer self-checks precede an explicit handoff to QA, including the single shared-editor operator role. The director approves and integrates. Honor project-specific human overrides; do not create missing staff, relabel self-checks as independent QA, repeat passing tests, or wake everyone just for policy notices.

- The complete reusable collaboration policy is packaged at host-plugin/skills/team-room/references/collaboration-policy.md and linked from SKILL.md. Keep all 12 director sections, 9 programmer sections and 8 QA error rules available to every meeting project. Apply only to existing authorized participants; project-specific human instructions and host/tool restrictions take precedence. Preserve project independence and keep real rosters/paths/routing out of the package. Documentation-only policy changes require content/link/package checks, not unrelated application or game runs.
