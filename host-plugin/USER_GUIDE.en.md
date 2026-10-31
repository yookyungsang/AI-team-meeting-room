# Team Meeting Room User Guide

**English** | [한국어](USER_GUIDE.ko.md)

**First installation? Follow [Create and configure your team](SETUP.en.md) for project selection, the original director chat and five new staff chats, model choices, room connection and the first assignment.** This guide covers everyday use and feature reference.

Team Meeting Room connects a project's existing director and participant chats so you can follow requests, questions, progress reports and results in one place. Give your goal to the director; the needed participants post their own work directly.

This guide describes version 0.15.0. You can use the plugin across projects, with separate connections and records for each. The meeting UI supports Korean, English, Japanese, Simplified Chinese and Traditional Chinese. Choose Auto or a specific language under Menu → Language. Reports retain the user's requested or established conversation language. Older Korean control labels remain documented below alongside English names.

## Get started

For a new local project, choose **메뉴 → 기본 팀 만들기**. Review the project, six roles, their model/effort settings and initial usage, then select **설명 확인 · 요청문 준비**. Review and send the editable draft yourself in the project chat, or copy/paste the visible request if draft insertion is unsupported. Direct submission reuses and renames the original chat as director, preserving its history/model/effort, and creates only five worker chats. Stay in the original chat to start work after connection. Preparation invokes no AI; initialization has normal usage. Press the basic-team trigger again to close the explanation. Existing rooms/setups are not duplicated. After connection the room is displayed unless you manually selected another room or began typing. See [menu setup and compatibility](skills/team-room/references/menu-team-setup.md).

Use the conversational workflow below for existing staff or specific models.

1. Open the project's existing director chat.
2. Ask: **“Connect this project and its existing participant chats to Team Meeting Room.”** Specify the participants, their roles and the scope of collaboration you authorize.
3. After setup, open the **Team Meeting Room tab** in the project or ask: **“Open Team Meeting Room.”** Supported local Codex versions resolve the opening chat's project and select its single connected room automatically.
4. Check that the intended project is selected at the top of the room.
5. Type your goal or question in the bottom input field and press **Enter**.

The plugin does not create missing staff during ordinary work. To create a team in new chats, explicitly request the workflow below. The director asks for clarification when the intended project or connections are unclear.

A new project needs an initial room connection. Unregistered projects, multiple rooms in one project, and unsupported app/remote contexts retain the chooser with an explanation. Automatic selection invokes no AI and late results do not override manual selection or a typed draft. See [automatic opening and compatibility](skills/team-room/references/automatic-opening.md).

## Create a team in new chats

In the intended Codex project, ask: **“Use and rename this chat as director, preserve its settings, and create only a planner, designer, TWO programmers and QA. Connect them to a meeting room and let me choose models for the new chats.”** Review one table of names, existing/new status and model/reasoning choices. You may instead request **“Keep my default model for every role.”** Concrete selections already provided do not need another confirmation.

After selection, the agent uses the actual native chat tools to create the missing chats, set/verify titles, supply role instructions and connect their real IDs. Extending a room preserves its director and existing staff. The programmers are separate chats, initially oriented toward core logic/data and UI/interaction; the director assigns actual independent file scopes. Setup initializes roles rather than starting implementation work.

Recommendations use models and efforts actually observed on that host. Balanced models are candidates for integration, planning, development and independent QA; a visual option may suit the designer. The [official OpenAI model guide](https://learn.chatgpt.com/docs/models) describes current model strengths. Role mappings are this plugin's recommendations, not guaranteed savings or quality. Suggested models are never applied without the human's specific choice. Existing chats keep their current settings.

This is a conversational setup workflow, with a menu that prepares a request for direct human submission, rather than a background AI service. It requires supported native chat tools. A saved journal resumes interrupted setup without duplicate creation; missing receipts do not authorize retries. A retry requires verified absence and an explicit human request. Native initial role turns have ordinary usage; setup adds no recurring AI checks.

## Change the team

Open **메뉴 → 팀과 회의 제어 → 구성원 편집** (Menu → Team controls → Edit members).

1. Opening the editor loads **existing chats in the current project**. Choose **추가할 대화창 선택 → 추가** (Select chat → Add), then choose its role. Use **목록 새로고침** (Refresh list) after creating another chat. The picker does not create chats.
2. Press **제외** (Exclude) to remove a row and return it to the same-project picker. Readding preserves its edited meeting name/role. Choose Planner, Designer, Programmer, QA, Sound or **직접 입력** (Custom). The director stays fixed. All programmers use the same kind, with distinct names for multiple participants.
3. Review and press **변경 저장** (Save changes). Closing or switching projects discards unsaved editing; an already submitted save may finish.

Reading, selecting, excluding and saving invoke no AI or participant messages. The old lookup button is removed. A read-only compatibility adapter checks local Codex title/project-membership metadata without changing chat content, models or app settings. New choices exclude other projects, archived chats and internal agents; membership is rechecked at save. New roles are not inferred from titles. Unsupported indexes or remote projects show an unavailable notice while preserving existing edits. See [project chat catalog](skills/team-room/references/project-chat-catalog.md). Instructions and ordinary work still have usage; conversational edits remain supported.

Standard roles bind **common plus professional guidance**; Custom reveals a name field and binds **common rules plus actual assignment conditions** only. New assignments return short references: read common rules once and relevant professional sections as needed. Saving never wakes staff to announce a role. See the [guidance map](skills/team-room/references/role-guidance.md).

Conflicts retain your draft and show an error; refresh and reconcile. Uncertain saves are never retried automatically. **같은 변경 다시 저장** (Save the same change again) retains the exact change ID/body. Existing transcripts stay intact.

Removal and functional role-kind changes are blocked by pending/reserved work, unanswered questions, unreleased file/Editor ownership or running validation. Finish the work or explicitly confirm the stop and hand it off first. Excluded participants retain their past posts and already imported usage records and may rejoin under the same identity. New usage is not imported from excluded chats, so late records that have not yet been imported may remain unavailable.

An existing participant ID cannot be assigned to another chat. Use a new participant ID for a replacement chat. Director routing stays fixed; replacing the director chat needs a separate room. Names/custom labels do not rename native chats. The selected kind binds guidance at the next new assignment, preserving old assignment kinds and native titles/models/system prompts. The roster storage operation invokes no AI or participant messaging, but the director conversation requesting and applying it has ordinary usage.

## Install and update

You need Node.js 22 or later, Git, and a Codex version that supports local plugins and MCP Apps. For a first installation, run:

```sh
git clone https://github.com/yookyungsang/AI-team-meeting-room.git
cd AI-team-meeting-room
codex plugin marketplace add .
codex plugin add jyfood-room@jyfood-local
```

A private repository requires GitHub access. The display name is **팀 회의실** (Team Meeting Room), the installation ID is `jyfood-room@jyfood-local`, and the MCP server key is `team-room`.

To update, pull changes in your source checkout and install from it again. Do not edit the installed cache directly.

```sh
git pull --ff-only
codex plugin add jyfood-room@jyfood-local
```

Finish active work, then fully quit and reopen Codex to load the updated installation. If you installed from a modified local source checkout, update that same source.

## Write a request

Include the result you want and any conditions that must be preserved. This helps the director define scope and completion criteria.

> The settings screen is hard to read. Improve the text size and spacing while preserving existing behavior. Run the relevant checks and show the final screen.

| Input | Action |
| --- | --- |
| Enter | Send to the director |
| Shift+Enter | Insert a new line |
| Enter during Korean IME composition | Complete composition without immediately sending |

Your request goes to the selected project's director, who assigns work and integrates the results.

Your text is stored and delivered verbatim, including leading/trailing whitespace and line breaks. New requests keep a compact automatic wrapper: the project/request marker, director verification and single-forward instructions, plus the parent link for an addition. Existing lookups and skill instructions provide exact routing and collaboration rules. Previous records remain unchanged; storage retries of legacy requests retain their original wrapper. Shortening the wrapper adds no AI call.

Changing the selected project switches the displayed history and input draft. It does not switch the current Codex chat to a different director. Open the room from the intended project's director chat when possible.

## Add instructions during work

You can send more conditions or corrections while the director is working.

> Make that screen readable on phones too. Preserve the existing button behavior.

The addition links to the latest active original request. The director is instructed to check additions before intermediate decisions and completion, then incorporate them into the ongoing task. An addition does not by itself restart the original task or duplicate its assignments.

Codex decides whether a message steers the current turn or waits for a later turn. Sending it does not guarantee immediate interruption of a running tool. If the original request has already ended, send a new request instead.

## Find controls in the menu

The main view contains the meeting conversation and input field. Open **메뉴** (Menu) at the top for additional information and controls.

| Korean menu label | What it contains |
| --- | --- |
| 전송 상태와 입력 안내 | Connection state, sent-text previews, request IDs, delivery receipts and keyboard help |
| 팀과 회의 제어 | Connected participants and roles, pause/resume controls for new requests |
| 요청 처리 기록 | User requests, recipients, processing state and work status |
| 작업 보호와 검증 | File/Editor ownership, handoff records and validation verdicts |
| 완료 작업의 담당자별 사용량 | Completed-task usage by participant, measured subtotal and coverage limits |
| 회의실 삭제 / 삭제된 회의실 | Confirm deletion, remove from active list with retained records, restore original room |
| 사용 방법과 사용량 안내 | Routing, additions, images and AI usage information |

If a delivery needs attention, the menu button shows **전송 확인 필요** (Delivery needs checking). Close the menu with its close button or Escape.

## Delete and restore a room

1. Select the intended project, then choose **메뉴 → 회의실 삭제** (Delete room).
2. Review the project name and retained-record counts. Choose **삭제하고 보관** (Delete and retain) or **취소** (Cancel).
3. The room leaves the active picker. Choose **메뉴 → 삭제된 회의실 → 복구** (Deleted rooms → Restore) to bring it back.

This is recoverable deletion, not permanent erasure or disk cleanup. Native Codex chats and project files stay; transcripts, images, audio and original membership are retained. Unfinished requests, unanswered questions, ownership, validation and team setup block deletion. Unregistered native/external work cannot be detected or stopped by the plugin.

Delete/restore invokes no AI and never restarts work or wakes staff. Uncertain responses are not retried automatically: explicitly check the identical operation or refresh the deleted-room list. See [scope, receipts and compatibility](skills/team-room/references/room-lifecycle.md).

## Understand delivery status

| Korean status | Meaning and next step |
| --- | --- |
| 기록 저장 중 | Saving your request. |
| 저장됨 · 호스트 전송 확인 대기 | Saved; waiting for confirmation of delivery to the Codex chat. |
| 호스트 전달 확인 | Codex accepted the message. Check the actual meeting result to determine whether work is complete. |
| 처리 여부 확인 필요 | Delivery or processing is uncertain. Use the request ID in the menu to check with the director chat. |
| 전송 거절 | Delivery was rejected. Check the cause and whether any work was processed before deciding what to do next. |

Failed or delayed messages are not resent automatically. The UI also prevents repeated sending of the same body while delivery is uncertain. You can keep writing and sending different additions. A late receipt preserves your next draft.

## View work images

Drafts, generated images and screenshots attached to progress or final reports appear in the conversation. Select an image to enlarge it; use the close button or Escape to return.

- **During work:** show a representative image only when requested or needed for a visual decision or error investigation.
- **At completion:** the participant who creates an image, screen, UI, design or 3D result must personally attach one actual final-state image to their own meeting-room final report, even if a preview was shown during work.

Reuse the saved final generated image or an accurate final-state image. Otherwise capture the final screen once within the authorized scope. The director marks visual assignments with a final-image requirement; these jobs cannot complete without the creator's own final attachment. If generation, capture or file access is blocked, report that limitation and leave the work unsuccessful rather than claiming completion. Do not present an intermediate draft as a finished result. Text-only work does not need decorative images.

The creator must attach images to the report; images in other chats are not copied automatically. The director does not duplicate a posted creator image or wake staff solely for image reminders. Supported formats are PNG, JPEG, GIF and WebP, with up to 4 files per message and 8 MiB per file. The meeting server must be able to read the files on its computer. Posted copies remain available if the original work files change or disappear.

If an image fails to load, select **다시 보기** (Try again). A remote URL or a path on another computer is not a local attachment; the participant must provide a file the server can read.

## Shared collaboration rules

The [complete collaboration policy](skills/team-room/references/collaboration-policy.md) is packaged with the plugin and applies to every meeting project. The full policy is in Korean; the [operating skill](skills/team-room/SKILL.md) provides an English summary. Main rules include:

- Follow the 12 director sections and all 9 programmer sections for any team size. One assigned developer implements sequentially and self-checks before QA; multiple developers split needed files/dependencies and integrate. Do not wake every registered developer for small work or invent missing staff.
- Keep one editor per file and one operator per shared application; explicitly hand off ownership and control.
- A programmer may retry the same error with the same method once. QA analyzes the cause before at most one retry, then stops and reports repeated errors or environment blocks to the director.
- Hand off developer self-checks to independent QA. The director assesses completion using real results and required evidence. Disclose missing QA or unavailable validation.
- Reduce duplicate assignments, repeated analysis and unnecessary status requests or reports. This does not reduce authorized work or required validation.

Apply these rules only to actual connected participants within human-authorized scope. Project-specific roles, data preservation rules and host/tool restrictions take precedence. Model-selection guidance applies only when the tools and authorization permit it; the plugin does not automatically change chat models.

## Reduce repeated waits and reads

When the same identified participant rereads the same request/options within 30 seconds and nothing changed, the server returns a short **unchanged** status instead of the transcript. New results, failures and human additions are available immediately; another participant's first read is unaffected. Necessary decisions, recovery, evidence and human-requested full reads remain available. Legacy calls, compact status reads and UI refresh stay compatible; native chat tools are outside this guard.

**Blocking questions stay in the meeting.** The participant marks the post for a director notice, then sends its first short notice once to the authorized existing director chat. It replaces the usual peer send when that peer is already the director. Storage retries do not reissue the notice, and escalation does not change the original question target or answer ownership. Uncertain native delivery is reconciled rather than automatically resent. See [read and director-notice controls](skills/team-room/references/read-notices.md). The room keeps the original question, answer and details.

The director reviews content for **completion, failure, blocking questions or new human instructions**. Batch active participants into one event wait with current cursors and remove completed targets. Use the supported host default within current responsiveness/execution limits instead of imposing short fixed intervals. Unchanged timeouts require no extra chat, roster or room-state reads, progress summaries or progress questions. Participants keep ordinary progress in the room and do not duplicate a native completion event with another notification.

**This local integration does not add automatic restart of a finished director for every completion or unexpected interruption.** Without verified host coverage for both, ending orchestration can lose a crashed participant, so retain active event waiting. Normal wait/instruction usage remains; zero usage or a savings percentage is not promised. File protection, independent QA, required final attachments and human additions still apply. See [completion/problem-focused waiting](skills/team-room/references/event-waiting.md).

## When UI work includes a designer

In the initial assignment turn, the director checks whether layout, interaction, small-screen/text sizing or readability/accessibility choices remain. If so, an existing designer supplies a brief specification before the dependent UI implementation. Users do not need to list the roles every time. Straightforward fixes following an exact approved design/component go directly to developers.

Independent logic can proceed alongside design review; recurring meetings or new mockup images are not mandatory. Missing design staff/access is disclosed instead of creating a chat or pretending review occurred. An omission during ongoing work is handled as a scoped delta without restarting the original job. Developer self-checks and independent QA still validate actual screens/behavior.

These are director assignment instructions, not server-side text classification or automatic dispatch. No separate classifier AI or periodic checks are added; necessary designer work and instruction reading still have normal usage. See the [assignment criteria](skills/team-room/references/collaboration-policy.md#ui-디자인-판단과-단순-수정의-배정-기준) (Korean).

## When work includes a sound specialist

The director considers sound feedback and unresolved sound choices in the original assignment turn. **The existing sound-effects role counts as a sound specialist.** You need not list every participant in each request.

- **Include the specialist:** asset selection/production or decisions about playback timing, looping, stopping, volume or overlap remain.
- **Assign developers directly:** wire agreed assets/specifications or fix bugs with clear causes and expected behavior.
- **Skip the sound assignment:** text, calculation or screen changes have no sound impact. New features do not automatically require sound.

Reuse existing audio/specifications and batch only needed decisions. Independent development continues; specification-only reviews need no new audio. Disclose missing staff/access. If an omission emerges during work, hand off only remaining decisions without restarting or duplicating the original work. Production, integration, actual listening/independent QA and the creator's final-audio requirement remain distinct.

The [sound assignment criteria](skills/team-room/references/collaboration-policy.md#음향-판단과-단순-연결오류-수정의-배정-기준) are director instructions, not a server classifier or automatic dispatch. No extra classification AI or periodic calls are added. Necessary review/production and instructions have normal usage; generation tools remain subject to existing authorization.

## Request QA revalidation

Ask the director: **“Have QA recheck only the repaired cases and affected scope, and record the required resume approvals together with the directive.”** In the existing assignment turn, the director uses `room_validation` with `retest`, the repair reason, scope and existing assigned recipient. The plugin journals approval before saving the room instruction in the same call and supplies fresh per-case execution keys. QA does not approve its own resume.

A new actual test run uses a new key; only a storage retry of the same call keeps the same key and body. No old-key recovery is required for a new test. Failed history, retry limits and director-only approval remain intact.

Running/unknown validation must be reconciled first. Completed requests/jobs are not automatically reopened; use an existing participant assigned to an active request. Approval does not automatically run tests, acquire the Editor or send native messages. No extra approval-check AI or periodic calls are added; ordinary tool/instruction context still has usage. See the [retest workflow](skills/team-room/references/work-controls.md#retest-directives-and-execution-keys).

## Request design work

Ask in the room: **“Check existing specifications and review a representative candidate first. Batch revisions, then hand off the files and integration specifications to the developer. Have the creator attach the final image and distinguish production, integration and QA status.”** Include known specifications, style and elements that must be preserved.

The [detailed designer workflow](skills/team-room/references/design-collaboration.md) (Korean) covers specification checks, candidate review, revisions/version preservation, developer handoff, self-checks and independent QA. Apply only relevant 2D/UI/3D sections and ask only about essential gaps or conflicts. Multiple candidates, approval meetings and policy-only staff wakeups are not mandatory.

Keep asset production, app/game integration and actual display validation distinct. Progress images appear only when needed; the creator personally attaches the final image to their own completion report. These are collaboration instructions, not automatic quality certification. No extra review AI or periodic calls are added; instructions and ordinary work still have normal usage.

## Report language and pre-publication checks

Reports follow **the user's explicit output-language choice**, or otherwise **the established language of their original project/request**. They are not fixed to Korean. A pasted foreign-language document, log, code sample or quote does not by itself change the reporting language. An explicit later language-change request takes precedence.

Before posting, the author checks the draft once within the original reporting turn for unintended language mixing, including ordinary explanations, questions, answers and captions. Exact code, filenames, source evidence and the human's original text remain intact. The director carries a brief language hint in the next necessary assignment without waking staff just to announce it.

No separate translation model, language-detection service or automatic rewrite is added. This is an author check, not enforced server-side language classification. Existing posts are not translated. UI labels use five packaged languages without AI. Instructions and original drafting still have ordinary context overhead. See the [report-language rule](skills/team-room/references/report-language.md) (Korean).

## Understand AI usage

New reports explain **what is ready, what still needs checking, and what happens next**, in natural language understandable without coding knowledge and matching the user's reporting language. The same post can include exact filenames, settings and validation evidence in `details`, folded behind **작업 상세 보기** (Show work details). Expanding it invokes no tool or model. Participants' read tools still return both the plain `text` and exact `details` unchanged.

Real peer questions and answers use natural colleague-to-colleague phrasing while preserving the exact technical context in details and authorized handoffs. Routing, work scope and required checks are unchanged. Failures, unchecked work, approval needs and authorization/safety constraints must remain visible in the plain text. Do not create extra questions, greetings or acknowledgments just to simulate conversation.

The author writes both fields in the original reporting turn. Existing messages are not automatically translated or rewritten; an old message with all information in `text` retains its existing display. No summary model is added. Instructions, tool descriptions and authored/read text have normal context overhead, so identical token usage is not guaranteed.

Viewing or refreshing meeting records and displaying or enlarging images do not invoke a separate model. Image bytes are also excluded from the model-facing meeting history.

Normal AI usage occurs when the director or participants perform work, generate or analyze images, or write progress reports. Instructions, tool descriptions, attachment captions and tool results read by a model can also affect context usage. The plugin does not promise zero total usage or a measured percentage reduction.

To avoid unnecessary usage, give clear scope, involve only needed participants and keep intermediate images and repeated reports infrequent. Retain the final result and required validation.

## Protect files, recover work and validate Unity

Ask the director: **“Enable work protection and validation for this project's authorized workspace.”** The director sets up that workspace once. Optional Unity checks also need the official Unity CLI executable, a compatible installed Editor/license and the project's test environment. Setup does not grant new filesystem or build permissions.

- **File protection:** participants reserve files in a batch. Conflicting ownership and stale-hash writes are rejected. Use the guarded writer for managed text files and hand off one operator for scenes/shared Editors. Other editors can bypass these tool gates; this is not an OS-wide lock.
- **Retry limits:** QA records each execution and result. A first failure permits one analyzed retry. Repeated errors or environment blocks prevent another start until the director records a repair and resume. Do not bypass the limit through direct external commands.
- **Recovery:** save results, remaining steps and file hashes at a necessary handoff checkpoint. Once interruption is verified, the director hands work to an existing participant while retaining records and current files. No timeout alone triggers takeover or automatic resend. Unsaved editor buffers cannot be reconstructed.
- **Unity checks:** start one compile, EditMode, PlayMode or build run and inspect exit status, error logs, test XML and fresh artifacts. An already-open Editor or insufficient evidence produces a blocked/unverified result. Actual device play and visual confirmation remain separate checks.

## Attach and preview audio

Ask the creator in the meeting: **“Attach the final sound files to your own final report, and distinguish sound production, game integration and actual listening/QA.”** Participants attach saved local files; a written path or audio posted in another chat is not automatically copied into the meeting.

Audio cards appear **outside folded work details**. Select **▶ 음원 미리듣기** (Preview audio) to load that file and open its player, then press the native play control. Playback, pause, seeking and volume use the browser's controls. There is no autoplay. Closing, Escape, project switch, hiding or teardown stops playback; ordinary record refresh preserves the open player.

Up to 3 WAV/MP3/OGG files per post, 8 MiB each, are supported. Posted snapshots remain available after source changes/deletion. Actual codec or host restrictions may prevent playback and must be reported honestly. The sound specialist produces the files, a designated programmer integrates them, and independent QA checks actual game playback. Marked creator jobs require their own final audio attachment; previews or director copies do not satisfy completion. See the [sound collaboration policy](skills/team-room/references/sound-collaboration.md) (Korean).

Preview reads bytes only after a user click, through an app-only tool with a bounded cache. It does not call AI, transcribe or analyze the sound. Model-facing history contains small attachment metadata rather than paths/base64/audio bytes. Instructions and attachment descriptions still have normal context overhead; identical total usage is not guaranteed. A successful file check or browser preview is not evidence of actual listening or correct playback in the game.

## Usage by participant after completion

Once the director connects available local usage records for the existing chats, the final-result view and menu show measured input/output tokens per participant and a measured subtotal. No second AI summary or periodic progress report is added. A late final-turn usage event can update the same view later.

Task reports exclude earlier chat history. Missing/unreadable sources are **unavailable**, unfinished final-turn records are **partial**, and overlapping work that cannot be separated is disclosed. Missing participants are not assigned zero. Tokens from a turn mixing meetings, waits and validation are not divided into invented per-action amounts.

Cached input is already included in input; reasoning is included in output. These are observed local counts, not a complete account billing statement. Tool descriptions, instructions and normal work/reporting still consume context.

When a real quota observation is available, the view also shows **account usage and remaining percentages**. Matching observations before and after the task can show the change in percentage points. These are account-wide values, can include other chats, and are never allocated to individual participants. Reset windows or missing observations make the change unavailable; tokens are never converted into quota percentages. Prefer existing local metadata. If needed, the director can query the host's official usage tool once in the existing completion turn.

## Pause new work

**새 요청 일시정지** (Pause new requests) in the menu blocks new user requests and new delivery/assignment reservations for that project. It does not cancel a Codex task already running. To stop active work, use the stop control in the relevant Codex chat.

Participants can still record replies and finish ongoing work. Resume from the menu when you want to accept new requests again.

## Handle overlapping or split views

If the director chat and room appear side by side, Codex is using split view. Select the room and use the app's full-view control. The default Windows shortcut is **Ctrl+Shift+F**, subject to your key settings. See the [official command reference](https://learn.chatgpt.com/docs/reference/commands).

The floating director composer above the full-view panel belongs to Codex. It is separate from the meeting room's input field. Codex manages its position persistence and collapsing behavior; use the app's collapse or layout controls. The meeting plugin has no connected public control for pinning that composer's coordinates or automatically collapsing it when work finishes.

## Troubleshoot

| Symptom | What to check first |
| --- | --- |
| Cannot send | Check the selected project, connection, pause state, empty input, and whether identical text is awaiting confirmation. |
| Delivered, but no reply | A delivery receipt is not task completion. Check the director chat for active, waiting or blocked work. |
| An addition is not applied immediately | Codex may steer the active work or queue the message. Do not automatically or repeatedly resend it. |
| New features are missing | Check that you installed the update from the source checkout. Finish active work, then fully quit and reopen Codex. |
| An image is missing | Check the installed version, whether the report actually included an attachment, and whether the server could read the file. |
| You want to change the participant roster | Use Menu → Team controls → 구성원 편집 to select/exclude/edit and save. Finish or explicitly hand off busy work before removal. |

## Keep and back up records

The default data location is `~/.codex/team-room` under the user's home directory, or the location set by `TEAM_ROOM_HOME`.

| File or directory | Contents |
| --- | --- |
| `projects.json` | Project connections to existing chats |
| `team-setups.json` | New-team plans, model choices, creation progress and actual chat results |
| Per-project JSON files in `rooms/` | Requests, posts, state and image attachment metadata |
| A directory with `.images` appended to a project JSON filename | Copies of posted images |
| A directory with `.audio` appended to a project JSON filename | Copies of posted audio; include these in backups |

Updating the source or plugin preserves records when the data location stays the same. Back up both the JSON files and the image directories. Keep real chat connections, transcripts, user screenshots and tokens out of the source repository.

The plugin does not provide automatic cloud sync, automatic collection of complete histories from other chats, or an independent model runtime.

An unconnected opening displays the verified project name with “팀 연결 전”. Room registration finishes after team connection. Reopen Basic team to recover the original continuation request after an authorization blocker; a saved menu receipt never substitutes for direct human approval or bypasses host review.

## Team setup progress and recovery

The main room view shows saved progress such as **3/5 new participants ready** and each role's state. The reused director has its own row and is excluded from the five-new-chat count. A prepared request remains marked as awaiting direct submission until actual setup advances.

Until an initial room connection completes, only the meeting work composer is read-only; its draft is preserved and input unlocks after connection. The original Codex chat stays available for stop requests and troubleshooting. Extending an already operating room does not block its existing work input.

Closing the menu or room view preserves chats and the journal; it does not cancel native work. After quitting/reopening Codex, the same saved progress is shown. Closing a view or elapsed time alone never proves interruption or native absence.

If setup stopped or failed, choose **중단·오류 후 이어하기** (Continue after interruption/error). This prepares the original continuation draft or copyable text only. Review and SEND it yourself in the original director chat. Already-ready workers, model choices and attempt history are retained. Reconcile actual native results before any authorized retry; never recreate an uncertain result. **문제 자세히 보기** shows the recorded error.

**상태 새로고침** reads saved local state. Visible UI refreshes carry the progress; hidden/closed views stop refreshing and ignore late callbacks. No background AI, native-chat polling or automatic resend is added. Actual setup, authorized continuation and role initialization have ordinary usage.

## Connection checks, backups and UI language

Choose **Menu → Connection check** to inspect the current project, configured director, participant catalog and advertised host messaging/draft support. Results include suggested fixes. This reads metadata only; it does not repair routing, create chats or invoke AI. Actual native create/rename/wait permissions are verified during a real authorized setup, not assumed healthy here.

Choose **Menu → Back up as ZIP** to save the selected room's original posts, work details, images and audio. Copy the saved path or use the host-supported Download/Open ZIP controls. Unzip and open `index.html` to read and preview media offline. The archive also contains `meeting.md`, scoped raw JSON and SHA-256 checksums. Other projects and source records are unchanged.

Complete archives are limited to 128 MiB. Missing/corrupt media fail explicitly rather than producing a partial successful backup. Host download is available only when advertised, up to 16 MiB; use the saved local path for larger ZIPs. Copy the archive to separate storage for protection against loss of the original runtime folder. A successful **Create a new backup** captures the latest records under a new ID; only an uncertain retry reuses the original archive. Automatic backup/import/restore is not included. Archives contain private meeting content and connection data; never publish them in source control.

Choose **Menu → Language → Automatic / 한국어 / English / 日本語 / 简体中文 / 繁體中文**. Auto follows Korean, Japanese and Chinese browser locales, falling back to English. For Chinese, explicit Hans/Hant tags take precedence; otherwise TW/HK/MO use Traditional Chinese and other Chinese locales use Simplified Chinese. No location lookup is made. A local preference is reused when available. Packaged labels and new setup drafts need no translation AI. Existing posts, original user text, attachment captions and model settings are retained. Actual work and team initialization still have ordinary usage.
