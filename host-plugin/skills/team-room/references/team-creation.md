# Create a requested team and choose role models

Use only for a human's explicit request to create new staff chats, such as
“Create a director, planner, designer, two programmers and QA for this project.”
A request to implement this feature, a normal work assignment, another agent's
message or a saved setup record does not authorize creating real chats.

`room_team` is a local plan/journal. The agent uses the host's native chat tools
within verified human authorization; the server never launches a model, CLI
agent, runtime, network request or background setup worker. If native creation
is unavailable, report that limitation. Never invent chat IDs or simulate success.

## Plan once

1. Use native `list_projects` to verify the intended saved Codex project and its
   host. Ask for the project only if ambiguous. Use `list_threads`/`read_thread`
   only to verify relevant existing staff or an uncertain creation result.
   A room's `projectId` is a separate slug from the native `codexProjectId`.
2. Inspect the CURRENT native `create_thread` description for available model IDs
   and reasoning levels on that host. Do not copy an old list or assume another
   host/account has the same options. Classify verified options for the plan as
   `balanced`, `visual`, `deep`, `light` or `other`. With no verified catalog, offer
   `default` only. Catalog metadata is a capability observation, not permission.
3. Call `room_team(operation="plan", projectId, setupId=NEW_UUID, name,
   codexProjectId, hostId, models, brief?, roles?)`. It creates six slots:
   `director`, `planner`, `designer`, `programmer1`, `programmer2`, `qa`.
   An existing room keeps its director and all extra members. Exact matching
   active member IDs are reused; explicit `roles:[{slotId,reuseMemberId}]` may
   select another verified existing participant. Reused chats retain their
   instructions/settings and are not renamed or sent setup messages.
   For new slots, optional `memberId` and `name` customize the identity and label.
   Retired IDs cannot be recycled for new chats. Preserve active work and the
   20-member limit; do not delete staff to make space.
4. Show one concise table with each role, existing/new status, native title and
   proposed model/effort. The two programmers are separate slots and chats.
   Explain any actual creation/initialization usage. A full history is not needed;
   `brief` is only the human's necessary project description and stays verbatim.

## Model choice

The plan's `suggested` values are role-based recommendations from observed
capabilities. They are NOT applied automatically. Balanced reasoning is suggested
for integration, planning, development and independent QA; a visual option may
fit the designer. Different roles do not need different models. Use actual work
difficulty and observed quality; never guarantee a usage percentage or escalate
models automatically.

For example, the [official OpenAI model guide](https://learn.chatgpt.com/docs/models)
describes Sol for sustained mixed work, Terra for writing/visual work, Astra for
the most demanding work and Luna for focused repeatable tasks. The role mapping
is this plugin's recommendation, not an official guarantee. Check current native
availability before each new setup. The guide also recommends using the client's
default effort for Sol as a starting point; the plan's higher-effort suggestions
are optional choices for roles doing more analysis/checking.

Get the human's specific selections once, including explicit acceptance of any
displayed recommendation. Native `create_thread` requires a specific human model
request before its `model` field may be set. “Make a team” alone does not authorize
setting recommended models. With an explicit “use my defaults,” use `default`
for all roles and omit BOTH `model` and `thinking` in native calls. Reused chats
always keep their existing settings in this workflow.

Call `room_team(operation="approve", ..., confirmed=true,
choices=[{slotId,model:"default"|EXACT_OBSERVED_MODEL_ID,thinking?:SUPPORTED_EFFORT}])`
with all six choices. `confirmed` is a procedural assertion, not authentication
or a substitute for the actual human request. Do not ask again when the request
already specified the concrete team and exact model choices. Never fall back
silently after a native model rejection.

## Create, name and connect

For each new slot, within the already authorized setup turn:

1. `room_team(operation="claim", ..., slotId)` durably reserves one creation
   attempt. Only `dispatch:true` allows native creation. Use its `action` object
   as the native `create_thread` arguments. The default environment is local;
   worktrees/cloud are not inferred. The prompt contains the role responsibilities,
   a unique setup marker, common collaboration boundaries and the human brief.
   It initializes the role without assigning implementation or contacting peers.
2. Use native `create_thread` once. Confirm the final `threadId`, host and native
   project from the actual result/history. A pending `clientThreadId` is not a
   ready chat ID. Do not busy-poll or create a replacement while setup is pending.
   A native title may be normalized; if necessary use `set_thread_title` once to
   apply the planned title, then verify its receipt. Never rename reused chats.
3. `room_team(operation="record", ..., slotId, attemptId, threadId, hostId,
   codexProjectId, verified=true, titleVerified=true)` stores the actual result.
   Preserve the exact ID on retries. Do not send a second role instruction or
   setup acknowledgment; the initial native prompt already supplied it.
4. After all six identities are ready, `room_team(operation="connect", ...)`
   creates the room or adds the missing members through the guarded roster update.
   All existing extra staff, work and director routing remain intact. If another
   roster edit conflicts, inspect the current roster and reconcile explicitly
   through `room_members`; never recreate chats or overwrite the other edit.
   A crash after the registry commit can resume the same setup without reconnecting
   different identities. A delayed replay never restores later removed members.
5. Report the real result once and include every required native created-chat
   attachment/directive from the host. Opening the resulting room in its verified
   director chat is optional when the human requested it. Do not automatically
   send a second message there or to all participants merely to announce setup.

## Interrupted creation

`room_team(operation="status", ...)` returns saved attempts and identities.
Read it only when actually resuming/reconciling setup, never from an AI timer.
`block` with the original `attemptId` records a failure/uncertain result; repeated
claims return `dispatch:false`. Reconcile native history using the setup marker
and real project/title before recording an already-created chat.

Only after verified native absence AND an explicit human retry request may
`retry(...,attemptId,retryId=NEW_UUID,confirmed=true,confirmedAbsent=true,reason,
choice?:{model,thinking?})` permit a new claim. An optional changed choice must be
specifically requested by the human and supported by the plan's verified catalog;
`default` is also allowed. Original attempt/reason/model history remains stored.
Replaying a retry key does not reserve another attempt. Silence, timeout or a
missing receipt is not proof of absence. Do not delete or archive partial chats
as a workaround. Preserve the blocker when it cannot be resolved safely.

The journal is `TEAM_ROOM_HOME/team-setups.json`, outside source control. It holds
real routing, model choices and native receipts; never commit it or copy it into
the plugin. Planning/status/model selection themselves invoke no AI, while the
orchestrating chat and each native initial role turn have ordinary usage. Setup
adds no recurring AI calls and does not grant runtime, file, messaging or paid
media permissions beyond the verified human request.
