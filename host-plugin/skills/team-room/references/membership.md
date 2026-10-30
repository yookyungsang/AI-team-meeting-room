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

## Busy work

Exclusion is blocked while the member has a pending/reserved job, an unanswered
question at either endpoint, unreleased file/Editor ownership or running
validation. Finish the work or use the existing explicit stopped-work recovery
and checkpoint handoff to another active member. Keep validation attempts,
blockers, required final images and usage intact. Do not silently cancel jobs,
mark them complete, release locks, waive checks or stop native chats to force a
roster edit. A roster edit alone never contacts participants.
