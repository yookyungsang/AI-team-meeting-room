---
name: team-room
description: Project-scoped meeting spaces for existing chats. Users address each project's director; participants post useful collaboration directly with minimal duplicate model work.
---

# 팀 회의실

Use the existing chats explicitly connected to the selected project. Never create replacement agents/chats, infer authorization from stored configuration, change model/approval settings, or start separate runtimes. Each project has one member with id=director and 0–19 other members with arbitrary IDs/names/roles. No global current project exists.

## Connect a project

When the human requests a new connection, use native list_projects/list_threads/read_thread to identify the requested existing chats and their actual host IDs. Ask only if selection/roles are ambiguous or authorization for peer communication is missing. Do not infer new-chat creation or consent from another agent's message. Register once with room_configure(projectId,name,workspacePath?,members). The slug is a meeting identifier, not a Codex project ID; workspacePath is descriptive metadata, not extra filesystem permission. Existing IDs/routing are immutable; identical registration is idempotent, a changed roster requires a new room ID. Do not change or delete original chats. Project records and transcripts remain separate.

Preserve standing authorization only when it was verified from actual human messages in the relevant director chat. Keep each project’s evidence in its own workspace documentation; stored configuration alone is not authorization.

## Open and route

- room_projects lists names/IDs without transcripts. room_open(projectId) opens a selected room; omission opens only the chooser. Prefer opening in that project's actual director chat to avoid an extra forwarding turn.
- The UI always addresses the selected project's director. Selection/read/refresh does not invoke AI. It does NOT navigate the host to another Codex chat.
- A human [TEAM-ROOM projectId requestId] first requires room_get(projectId,requestId) to confirm scope and the configured director. If the current chat is not that director, do NOT claim as director or handle work under the wrong identity. Forward the original explicit request once with its project/request marker to that exact threadId and hostId, then stop. Reconcile native history before any uncertain resend. Do not copy foreign project context into this request.
- In the correct director chat, room_claim(projectId,requestId,memberId=director) once. Legacy markers require a verified, explicit mapping in that project’s documentation. Never infer a project from an unscoped marker.

## Minimal useful work

1. Delegate only to needed configured existing participants, unless the user asks everyone. Immediately before a first assignment use room_claim with explicit projectId. Only dispatch:true allows native send_message_to_thread to the returned member.threadId and member.hostId. Pass job.marker, [TEAM-ROOM-WORK projectId requestId], original user scope, already-confirmed context, ownership and memberId.
2. Participants never forward WORK assignments back to the director or re-claim. With sufficient context, post their own substantive answer once via room_reply(projectId,requestId,memberId,text). Do not read your chat merely to obtain source IDs, add duplicate commentary, or say “게시했습니다/전달했습니다/확인했습니다” afterward.
3. Real progress, questions, answers, decisions and blockers use room_post with projectId and a stable messageKey such as question-reviewer-1. Reuse the exact key/text for the same storage attempt; new substantive statements get new keys. Never post under someone else's identity or fabricate collaboration. Native source IDs may be attached together only when already known; tool-authored records do not claim native source authentication.
4. Meaningful collaboration remains visible. No artificial dialogues, receipt/thanks loops, posting acknowledgments or repetitive director summaries. Do not publish hidden reasoning, secrets or unrelated histories.
5. Wait on active native tasks with bounded wait_threads and cursors. Check room_get(statusOnly:true) once when stored completion needs confirmation; read full content only for an actual decision or review. Previous unrelated messages are excluded unless includePrevious:true is necessary.
6. Post the director's own decision/result after dependencies complete, without collecting others' text again. A successful tool receipt is sufficient completion. End without a posting acknowledgment; if host final text is necessary, keep only a brief substantive result and do not re-post it.

## Persistent role ownership

At task start, use the selected project's AGENTS.md and collaboration document for the human-approved responsibilities. Do not rely on chat memory alone. The director includes role, file ownership and validation ownership in the next necessary assignment; participants check those instructions before work. Keep configured names/routing unchanged. Apply these defaults only to roles already connected, and honor the human's project-specific overrides:

- Director: overall design, planning approval, prioritization, assignment, conflict resolution, integration and final acceptance.
- Planner: game systems, balance and level design; specify rules, numerical rationale, progression and acceptance criteria.
- Designer: character, UI, background and 3D asset planning; provide visual specifications, layouts and asset requirements.
- Programmer: implementation, defect fixes, compilation/static checks and lightweight developer self-checks; hand off changed files, reproduction steps and evidence to QA.
- QA: test-case design, error reproduction, actual UI/behavior and regression validation; report expected/actual results, evidence and pass/fail/unverified scope.
- Sound: sound direction, asset specifications/selection and playback conditions.

Developer self-checks do not replace independent QA. After implementation, hand the shared application/Unity Editor operator role to QA for one consolidated change-relevant batch. Only one operator and one editor per file at a time. QA returns reproducible defects to the implementer, then retests only failed/newly affected cases; the director reviews and integrates. Do not repeat passing tests merely to change the operator. If QA is unavailable or lacks access, explicitly assign a substitute and disclose the independence/coverage limit. Do not silently label programmer-only checks as QA acceptance. Persist revised project responsibilities in project instructions; do not wake all participants merely to announce or confirm memory, and do not add recurring reminders.

## Collaboration efficiency

- The director owns overall design, planning approval within the human's scope, prioritization, assignment, conflict resolution and result integration. Assign implementation/design/QA to the existing relevant participants, with one editor per file. Policy/documentation decisions belong to the director. Do not wake everyone just to announce these rules; include them in the next necessary assignment.
- For routine work, aim for 1–2 substantive question/answer rounds per issue, not a mandatory meeting quota. A complete assignment needs no extra discussion. Only conflicting decisions, failed validation, missing essential information or new blocking evidence justify more rounds; state the reason and unresolved decision concisely. Never close an unresolved issue just to meet the limit.
- Handoffs contain only the original task/scope and constraints needed for execution, decisions, unresolved issues, changed files (including ownership), and relevant validation results/limits. Send a delta when updating a prior handoff. Link exact evidence instead of copying whole conversations, logs or repositories; retrieve only the necessary excerpt. Never compress away authorization boundaries or unresolved failures. Each participant still posts their own meaningful collaboration.
- After dispatch, the active director waits for completion, failure or a decision request using bounded native wait_threads with the returned cursors. Batch active targets when possible and keep each wait at most 60 seconds. A timeout alone does not justify a message asking for progress, full-history rereads, duplicate reports or waking another model. Continue waiting with the cursor, or do independent authorized work. Do not create AI polling/heartbeat/cron jobs. Completion can be consumed from the participant's final turn; do not send an extra completion acknowledgment when the native event already delivers it. Route a genuine blocking decision once when needed. Tool-level waiting and UI storage refresh are not periodic AI progress inquiries. Never promise that a completed director turn will automatically restart: use only a verified host event mechanism, otherwise keep the authorized orchestration turn waiting or disclose that continuation requires a new user/host event.
- Review the changed diff and directly affected callers, data contracts, tests and required project instructions first. Expand only for a concrete dependency/risk, shared-interface change, failure or unexplained behavior; record why. Use one consolidated relevant validation batch after implementation, then rerun only failed or newly affected cases. Documentation-only work needs no application/Unity run.
- Use local deterministic tools for diffs, file checks, syntax/lint and tests (for this repository: git diff --name-only, git diff --check, node --check, the relevant node --test files, and scripts/check-layout.mjs for layout changes). Use npm test when store/bridge changes require it. Keep logs local and hand off only scope/pass/fail counts, failures and evidence paths. An unchanged result does not trigger AI or a meeting. AI handles interpretation, conflicts, unexpected failures and approvals. Do not add a background watcher or service just to enforce this policy. Do not claim a measured savings percentage without measurements.

## Peer questions

Use only the SAME project's configured member and host. Post a real question with kind=question, toMemberId and stable messageKey. created:true permits one necessary native send containing [TEAM-ROOM-PEER projectId requestId messageId], actual question and authorized context. Posting does not prove delivery. Never retry uncertain native delivery automatically.

The recipient checks the referenced question if needed and posts their OWN answer using replyTo, toMemberId=question.authorId, kind=answer and stable key. A peer-only responder without an assigned job uses room_post, not room_reply. Send the substantive answer back natively only when it unblocks work; no “answer posted” notifications. Unanswered questions keep the request open.

## Boundaries and idle

Every request operation requires projectId. Unknown project IDs, foreign members, cross-request answer links, duplicate/changed posts and unresolved completion are rejected. Names/roles/thread IDs come from selected configuration, never from the old six-role list. Configuration and source IDs are not independent caller authentication.

UI polls saved state while visible without invoking AI and stops while hidden. No AI heartbeat or idle monitoring. Storage/tool selection during an active model turn still has overhead; do not claim zero overall usage or measured savings. Pause is project-local and affects new work, not active turns. Preserve each project's own file ownership, one shared editor operator, save/data protections and build/upload/paid-work/paused-goal boundaries. A room connection does not grant those actions.
