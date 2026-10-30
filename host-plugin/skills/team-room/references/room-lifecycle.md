# Delete and restore a meeting room

Use only when the human asks about deleting or restoring a room. The menu uses
the app-only `room_manage` tool; it invokes no model or native chat tool.

## Human controls

1. Select the intended room, then choose **메뉴 → 회의실 삭제**.
2. Review the project name, member/request/message/image/audio counts and any
   blockers. **취소** changes nothing. **삭제하고 보관** is the explicit confirmation.
3. The room disappears from the active project picker. Choose
   **메뉴 → 삭제된 회의실 → 복구** to return its original records and membership.
   Restoration selects that room only when no room is selected; another selected
   room stays selected.

This is recoverable deletion: records stay on disk in their original locations.
It is not permanent erasure or disk-space cleanup. Codex chats, native projects,
project files, models and titles are not deleted, stopped or changed.

## Scope and work protection

Deletion is rechecked under the setup, room, work-control and project-registry
locks, in the same order as setup connection. Unfinished requests/assignments,
unanswered questions, unreleased file/Editor ownership, running validation and
unfinished team setup block it. Finish or explicitly reconcile the existing work
using the existing controls; do not bypass ownership or erase attempt history to
make deletion succeed. Work in native chats or external editors that was never
registered with the plugin cannot be detected or stopped by this check.

An archived room accepts no new requests, assignments, posts, roster edits,
workspace writes, validation or team creation. Scoped historical reads and exact
stored message retries remain available without a new dispatch. No polling,
auto-resend, AI notification, replacement chat or usage estimate is added.

Original immutable routes, retired members, transcripts, media, workspace
authorization, leases/checkpoints, validation attempts and observed usage records
are retained. Restoring does not re-run work or resume a native chat. The original
pause state is also retained. An archived connection is not treated as a new
project by automatic opening or menu team creation; restore it explicitly.

## Receipts and panel lifecycle

Mutations require the observed project revision, exact displayed name,
`confirmed:true` and a fixed UUID `changeId`. Reusing a key with different input
fails. An exact retry reports the current archived state and its original applied
revision; it never rolls back a later restore/delete. An uncertain response is
never retried automatically: a second explicit click checks the identical
operation, or the human refreshes the deleted-room list to inspect current state.

Closing, hiding, switching projects or teardown invalidates pending UI handlers.
An already sent local mutation may finish, but its late response cannot navigate,
reopen a panel, send a native message or schedule work. The standalone Chromium
harness checks this UI contract; actual Codex display transitions require separate
host verification. Tests use isolated synthetic rooms and do not delete real rooms.
