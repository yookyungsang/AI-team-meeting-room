# Explicit membership changes

Use this reference only when the human requests a change to the meeting's team.
This is a local storage operation, with no model call, native message, new chat,
automatic resend or filesystem permission grant.

1. In the configured director chat, verify the human's intended project and
   change. Read `room_state(projectId)` once for the active `members` and
   `project.revision`. Verify any added chat's actual ID/host through native chat
   tools. A roster record does not authorize messaging or creating chats.
2. Prepare the complete desired active roster, preserving unaffected members and
   the director. A room has exactly one `director` and at most 20 active members.
   Names and roles change only their meeting labels; native chat titles and
   project instructions do not change automatically. Persist applicable role
   decisions in the project's authorized instructions during the necessary work.
3. Call `room_members(projectId,memberId="director",expectedRevision,changeId,members)`
   with the observed revision and a new UUID for this explicit edit. A retry of
   that storage operation uses the exact same ID and input. Do not automatically
   retry a failure. A revision conflict needs a fresh state read and reconciliation
   with the human's scope; never silently overwrite another edit.
4. The receipt reports `revision` for the current roster and `appliedRevision`
   for this operation. A delayed replay returns the current roster without
   rolling back later edits. A reused change ID with different content fails.

## Identity and history

Existing member IDs retain their original thread ID and host forever, including
after exclusion. A different chat needs a new member ID, with the old member
excluded after a real handoff when necessary. The director's routing stays fixed;
director-chat replacement still needs a separate room. The same chat cannot be
registered under a different active or retired member ID. An excluded member may
rejoin under the same ID and original routing.

Excluded members are retained only for history, original message retries,
ownership/recovery records and measured usage. They cannot receive new claims,
questions or handoffs, or write new posts. Their earlier exact post/reply retries
remain idempotent and never dispatch work. The active team menu updates through
its normal local refresh; past reports keep their authored names/roles and text.
Already imported usage remains available, but new discovery, attachments and
imports use active members only. Late unimported data for an excluded member may
remain unavailable; do not guess missing usage.

## Menu editor and existing-chat choices

The human can use **메뉴 → 팀과 회의 제어 → 구성원 편집**. The editor loads current local project chats through `room_roster(discover)`. Select a chat and **추가**, use **제외** to return an idle member to the picker, edit meeting labels/roles, then **변경 저장**. The director cannot be excluded. Nothing changes until save. Readding preserves draft labels. `apply` resolves IDs server-side and rechecks newly selected chats' current project membership, using roster/options revisions, a stable changeId and the same busy-work, immutable-routing and history gates as `room_members`. No model or participant message is invoked. Stale/rejected edits retain the draft. An uncertain save is never automatically retried; the same explicit retry retains its exact changeId/body. Closing or switching discards unsaved editing; an already submitted save may finish.

The old existing-chat lookup button is removed. Opening/refreshing explicitly reads local title/project metadata with the [compatibility adapter](project-chat-catalog.md), not a director AI task. Unavailable or ambiguous/remote indexes preserve existing editing and show a limitation rather than mix global chats. The adapter is read-only for Codex state; candidate preparation writes only the meeting runtime's options and never activates candidates. No background discovery or native message occurs, including after late responses to a closed/hidden/switched/removed view.

For an explicit conversational roster request, the verified director may still identify the intended native project and existing chats with native tools. Keep reads bounded; avoid unrelated histories. If the project is ambiguous, report the missing choice rather than mixing projects. Do not create/fork/rename/contact chats, change models or alter the active roster just to prepare choices. Stored configuration grants no such permission.

Save at most 100 candidates with `room_roster(operation="register", projectId, requestId, memberId="director", verified=true, candidates=[{name,role,threadId,hostId}])`. Use actual known roles or a neutral ‘담당자’ label, never invent role initialization. Registration keeps known IDs/routes and otherwise generates stable internal IDs. It requires an active director assignment, is idempotent for the same request/body and cannot replay over newer lists. Candidates do not activate themselves: the human selects them in the editor. Finish the request with one short substantive result in the user's established language; menu protocol text is not a language-change request.

Names/custom role text are meeting labels. The selected `roleType` also binds [common and role-specific guidance](role-guidance.md) for the next actual assignment. Standard choices are planner/designer/programmer/QA/sound, with director fixed and custom for common rules plus task conditions. The read response includes the static role catalog and effective kinds. `apply`/`room_members` accept optional `roleType`; old clients omitting it preserve a saved kind. Ambiguous legacy labels stay custom. Functional kind changes are blocked by active work/questions/ownership/validation; same-kind display edits remain allowed. A kind never grants director privileges or changes native titles/models/system prompts.

New assignments persist their roleType and return compact guidance refs on dispatch; retries keep the snapshot and do not send another policy message. Explicit recovery supplies the target's guidance without dropping the original scope or completion requirements. Carry actual role decisions into the next necessary authorized assignment and project record, without policy wakeups. Excluded members keep original IDs; choices remain project-scoped. The editor does not replace caller authentication or human authorization, and adds no background discovery/runtime.

## Busy work

Exclusion is blocked while the member has a pending/reserved job, an unanswered
question at either endpoint, unreleased file/Editor ownership or running
validation. Finish the work or use the existing explicit stopped-work recovery
and checkpoint handoff to another active member. Keep validation attempts,
blockers, required final images and usage intact. Do not silently cancel jobs,
mark them complete, release locks, waive checks or stop native chats to force a
roster edit. A roster edit alone never contacts participants.
