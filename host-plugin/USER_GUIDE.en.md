# Team Meeting Room User Guide

**English** | [한국어](USER_GUIDE.ko.md)

**First installation? Follow [Create and configure your team](SETUP.en.md) for project selection, six staff chats, model choices, room connection and the first assignment.** This guide covers everyday use and feature reference.

Team Meeting Room connects a project's existing director and participant chats so you can follow requests, questions, progress reports and results in one place. Give your goal to the director; the needed participants post their own work directly.

This guide describes version 0.7.1. You can use the plugin across projects, with separate connections and records for each. The current meeting UI and the reporting instructions use Korean. This guide includes the Korean control labels so you can find them; it does not add automatic translation or language switching to the app.

## Get started

1. Open the project's existing director chat.
2. Ask: **“Connect this project and its existing participant chats to Team Meeting Room.”** Specify the participants, their roles and the scope of collaboration you authorize.
3. After setup, ask: **“Open Team Meeting Room.”**
4. Check that the intended project is selected at the top of the room.
5. Type your goal or question in the bottom input field and press **Enter**.

The plugin does not create missing staff during ordinary work. To create a team in new chats, explicitly request the workflow below. The director asks for clarification when the intended project or connections are unclear.

## Create a team in new chats

In the intended Codex project, ask: **“Create a director, planner, designer, TWO programmers and QA in new chats, connect them to a meeting room, and let me choose each role's model.”** Review one table of names, existing/new status and model/reasoning choices. You may instead request **“Keep my default model for every role.”** Concrete selections already provided do not need another confirmation.

After selection, the agent uses the actual native chat tools to create the missing chats, set/verify titles, supply role instructions and connect their real IDs. Extending a room preserves its director and existing staff. The programmers are separate chats, initially oriented toward core logic/data and UI/interaction; the director assigns actual independent file scopes. Setup initializes roles rather than starting implementation work.

Recommendations use models and efforts actually observed on that host. Balanced models are candidates for integration, planning, development and independent QA; a visual option may suit the designer. The [official OpenAI model guide](https://learn.chatgpt.com/docs/models) describes current model strengths. Role mappings are this plugin's recommendations, not guaranteed savings or quality. Suggested models are never applied without the human's specific choice. Existing chats keep their current settings.

This is a conversational setup workflow, not a separate creation-button UI or background AI service. It requires supported native chat tools. A saved journal resumes interrupted setup without duplicate creation; missing receipts do not authorize retries. A retry requires verified absence and an explicit human request. Native initial role turns have ordinary usage; setup adds no recurring AI checks.

## Change the team

Ask the director to **“Add a QA participant to this room,” “Change this participant's meeting name and role,”** or **“Remove this participant after handing off their work.”** The director checks the current roster and updates the same room. The team menu reflects changes through its normal refresh, while conversation history and existing work remain intact. This workflow uses a request to the director rather than a separate roster editor UI.

Removal is blocked by pending/reserved work, unanswered questions, unreleased file/Editor ownership or running validation. Finish the work or explicitly confirm the stop and hand it off first. Excluded participants retain their past posts and already imported usage records and may rejoin under the same identity. New usage is not imported from excluded chats, so late records that have not yet been imported may remain unavailable.

An existing participant ID cannot be assigned to another chat. Use a new participant ID for a replacement chat. Director routing stays fixed; replacing the director chat needs a separate room. Meeting labels do not automatically rename native Codex chats. The roster storage operation invokes no AI or participant messaging, but the director conversation requesting and applying it has ordinary usage.

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
| 사용 방법과 사용량 안내 | Routing, additions, images and AI usage information |

If a delivery needs attention, the menu button shows **전송 확인 필요** (Delivery needs checking). Close the menu with its close button or Escape.

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

- Follow the 12 director sections and 9 programmer collaboration sections. Prefer independent parallel work when multiple programmers are already connected.
- Keep one editor per file and one operator per shared application; explicitly hand off ownership and control.
- A programmer may retry the same error with the same method once. QA analyzes the cause before at most one retry, then stops and reports repeated errors or environment blocks to the director.
- Hand off developer self-checks to independent QA. The director assesses completion using real results and required evidence. Disclose missing QA or unavailable validation.
- Reduce duplicate assignments, repeated analysis and unnecessary status requests or reports. This does not reduce authorized work or required validation.

Apply these rules only to actual connected participants within human-authorized scope. Project-specific roles, data preservation rules and host/tool restrictions take precedence. Model-selection guidance applies only when the tools and authorization permit it; the plugin does not automatically change chat models.

## Understand AI usage

New reports explain **what is ready, what still needs checking, and what happens next**, in natural Korean understandable without coding knowledge. The same post can include exact filenames, settings and validation evidence in `details`, folded behind **작업 상세 보기** (Show work details). Expanding it invokes no tool or model. Participants' read tools still return both the plain `text` and exact `details` unchanged.

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
| You want to change the participant roster | Ask the director to add, rename/change roles, remove or reactivate members in the same room. Finish or explicitly hand off busy work before removal. |

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
