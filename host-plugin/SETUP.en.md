# After installation: create and configure your team

[한국어](SETUP.ko.md) | **English** | [Full user guide](USER_GUIDE.en.md)

For version 0.16.2. Follow this sequence: **install → open the project you will work on → request staff chats → choose models → use the room in the same chat → assign the first task**.

A new team has **one director, one planner, one designer, TWO programmers and one QA participant**. The chat where setup starts becomes the director, preserving its history and current model/effort. Only the other five participants get new chats. Setup starts with a written request in a Codex project chat.

## Jump to a step

- [Check installation](#check-installation)
- [Open the project you will work on](#open-the-project-you-will-work-on)
- [Use this chat as director](#use-this-chat-as-director)
- [Team setup progress and recovery](#team-setup-progress-and-recovery)
- [Choose models by role](#choose-models-by-role)
- [Verify connection and open the room](#verify-connection-and-open-the-room)
- [Assign work and send corrections](#assign-work-and-send-corrections)
- [Connect existing staff](#connect-existing-staff)
- [Resume or troubleshoot](#resume-or-troubleshoot)
- [Updates and usage](#updates-and-usage)

## Check installation

If the latest plugin is installed and you have restarted Codex, continue to [project selection](#open-the-project-you-will-work-on).

For a first installation, you need Node.js 22 or later, Git, a Codex host supporting local plugins and MCP Apps, and the `codex` command. Run these commands in order in a terminal; PowerShell works on Windows.

```sh
git clone https://github.com/yookyungsang/AI-team-meeting-room.git
cd AI-team-meeting-room
codex plugin marketplace add .
codex plugin add jyfood-room@jyfood-local
```

The installation ID is `jyfood-room@jyfood-local`; the display name is **팀 회의실** (Team Meeting Room). Run the last command inside the downloaded `AI-team-meeting-room` directory.

Finish active work, then **fully quit and reopen Codex**. A successful installation does not guarantee that an already open conversation immediately reloads the new tools.

**Checkpoint:** installation finishes without an error and the restarted Codex host can use the plugin. If commands are missing, see [troubleshooting](#resume-or-troubleshoot).

## Open the project you will work on

Open the **actual project folder you want to build or change** in Codex. If it is not registered yet, open that folder as a Codex project first. Open an ordinary chat belonging to that project and make the setup request there.

The downloaded plugin repository is installation source. Select your game project for game work or your web app project for web app work. Select this repository as the work target only when developing the meeting plugin itself.

You can first ask:

```text
Check that this is the project I intend to work on.
Tell me the verified project name before creating staff or a meeting room.
```

If several projects match, select the intended one. **You do not need to locate or type chat IDs or edit meeting configuration files.** The agent verifies actual project and chat information.

## Use this chat as director

For a first local connection, you may instead use **메뉴 → 기본 팀 만들기 → 설명 확인 · 요청문 준비**. Review the prepared request and send it yourself in the project chat, or copy/paste it there if editable drafts are unsupported. Direct submission renames the original chat to `Project name · 총괄 디렉터` and creates only the five other staff chats with the displayed settings. After connection, assign work in the same original chat. Preparation invokes no AI; creation has normal usage. Existing setups are not duplicated. See [menu setup](skills/team-room/references/menu-team-setup.md). The conversational path below also supports explicit model selection.

Paste this into the **Codex chat for the intended project**. A meeting room does not need to exist yet.

```text
Set up Team Meeting Room for this project.
Use this chat as director and rename it to Project name · 총괄 디렉터.
Preserve its history and current model/reasoning settings.
Create only one planner, one designer, TWO programmers and one QA chat.
Give new chats clear titles containing the project and role.
First show a table of role names, new versus existing chats,
recommended models and reasoning levels.
After I choose models, create the chats, add role instructions,
and connect them to the meeting room.
Check and preserve any participants already connected to this project.
Only set up the team for now; do not start implementation yet.
```

The agent checks the actual project, native chat-creation capability and available model options. The selection table appears **as a chat reply**. You may use either the basic-team menu or this conversational workflow.

| Role | Responsibility |
| --- | --- |
| Director | Overall design, priorities, assignments, conflicts, integration and acceptance |
| Planner | Systems/balance/level planning, specifications and completion criteria |
| Designer | UI, characters, backgrounds, 3D and other visual deliverables |
| Programmer 1 | Initially oriented toward core logic and data |
| Programmer 2 | Initially oriented toward UI and interaction |
| QA | Independent validation, reproduction, regression checks and evidence |

The director assigns actual scopes and separate editable files to the programmers. Developer self-checks precede independent QA. Only participants needed for a particular task are assigned actual work.

**Checkpoint:** the table contains six roles with two programmers, the intended project, and correct new/existing choices. Correct any mismatch in the same conversation before creation.

## Choose models by role

Use the **models and reasoning levels actually available on that host**. Recommendations are not applied automatically, and availability can vary by host/account. This guide does not require a fixed model list.

### Option A: keep your defaults

```text
Keep my default model and default reasoning settings for every new role.
Create the chats and connect the team using the configuration we just reviewed.
```

Defaults mean the **user defaults Codex applies to a new chat**. This does not copy a per-conversation model override from the chat you are currently using. Reused existing chats retain their current settings.

### Option B: accept the displayed recommendations

After reviewing a table showing concrete model names and reasoning levels, reply:

```text
I choose the exact model and reasoning level shown for each role in your last table.
Proceed with creating the new chats, setting role instructions,
and connecting the meeting room using those choices.
```

### Option C: choose each role yourself

Copy exact model names and supported reasoning levels from the displayed options, and send your role-by-role choices in a sentence or table. Specify programmer 1 and programmer 2 separately when desired. Unsupported settings need clarification; the agent must not silently select another model.

Reasoning effort controls how much effort the model spends on judgment. Higher settings for all work do not guarantee better efficiency. Start with defaults or choose based on actual integration, implementation and validation difficulty. Recommendations do not guarantee quality or a usage reduction.

**Checkpoint:** model choices for the new chats are settled and creation proceeds with those choices. Already concrete instructions do not need repeated approval.

## Verify connection and open the room

Codex creates actual new chats, sets/verifies titles and role instructions, and connects their real IDs. A title could look like `My project · Programmer 1`; this is a synthetic title example, not a screenshot or an actual user's project.

**The original setup chat is now the director. Stay here to assign work.** Check its updated title and the five connected worker chats. Older in-progress plans and existing rooms keep their original director.

After connection, opening the Team Meeting Room tab in that director chat automatically selects its single connected room on supported local Codex versions. New projects require initial connection; multiple rooms or unavailable/unsupported project context retain the chooser with guidance. Alternatively, in that director chat, ask:

```text
Open Team Meeting Room for this project.
```

| Where to check | What to check |
| --- | --- |
| Project selector at the top | The intended project is selected |
| **메뉴 → 팀과 회의 제어** (Menu → Team and meeting controls) | Director, planner, designer, two programmers and QA are connected |
| Native chat list or created-chat links | New participants exist as separate chats |

When extending an existing room, extra participants may remain in the list. Setup preserves the existing director and staff.

**Checkpoint:** real chats and the correct room roster are present, and you can submit a request in the intended room. The room's project selector changes displayed records; it does not switch the current native Codex chat to another director.

## Assign work and send corrections

Send actual work through the **bottom input field in the room**. Enter sends; Shift+Enter inserts a line break. Replace the example goal with your actual task.

```text
Improve the readability of the settings screen.
Preserve existing button behavior and saved data.
Assign the necessary connected participants to this task.
I authorize participant messaging for this project's assignments,
work questions and result sharing.
When useful, split the two programmers' work across separate files.
Have developers self-check, then hand the affected scope to QA.
Show intermediate images only when needed for a decision.
The creator should attach the final screen image to their own final report.
```

The director assigns needed staff and integrates their results. Participants post their own meaningful questions, progress and results. Stating the allowed collaboration scope helps the director verify human authorization for peer messaging.

For a correction during work, use the **same meeting input field**:

```text
Also make the settings screen readable on a phone.
Keep button positions and adjust text size and spacing first.
```

Additions link to the latest active original request and must be handled before completion. If several tasks are active, name the task you mean. A running tool is not guaranteed to stop immediately: Codex may steer the active work or queue a later message. A finished original request needs a new request.

**작업 상세 보기** (Show work details) contains technical prose such as paths, settings and validation evidence. **Attached images appear outside the folded details**, so you can see them without expanding it. A written file path alone is not an image attachment.

### Listen to attached audio

Audio attached by a participant appears in a card **outside folded work details**. Select **▶ 음원 미리듣기**, then the play control in the dialog. There is no autoplay, AI listening or transcription. See [audio attachments and preview](USER_GUIDE.en.md#attach-and-preview-audio) for requests and supported formats.

## Connect existing staff

If you already have participant chats, use this request instead and include the actual chat titles when known:

```text
Find this project's existing director, planner, designer, programmer and QA chats.
Show their actual titles and proposed roles so I can select them.
Connect the verified existing chats to this project's meeting room.
I authorize messaging for project assignments, work questions and result sharing.
Do not create new staff chats.
```

Select the intended chats if several candidates match. An existing team can use its actual roster; it does not have to fill the six-role new-team template.

Use **메뉴 → 팀과 회의 제어 → 구성원 편집** to select/add/exclude existing participants, edit meeting labels and **변경 저장** (Save changes). The editor directly loads the current local project’s existing chats; excluded members return to its picker. Refresh after creating a chat. This read-only metadata compatibility adapter reports unsupported environments rather than listing other projects. Selecting and saving invoke no AI or chat creation. Busy jobs, unanswered questions, ownership and validation must be completed or explicitly handed off before removal. Conversational edits remain supported; labels do not automatically change native titles or models.

Choose a standard role for common plus professional guidance, or **직접 입력** (Custom) for common rules plus task conditions. All programmers use the same kind, with distinct names when there are several. Saving never wakes participants; read relevant guidance at the next actual assignment. Finish/hand off busy work before changing kind. See the [role guide](skills/team-room/references/role-guidance.md).

## Resume or troubleshoot

| Symptom | Next step |
| --- | --- |
| `node`, `git` or `codex` is not found | Check installation and terminal paths. In a fresh terminal, try `node --version`, `git --version`, `codex --version`. |
| `codex plugin` is unsupported | Check plugin support in that Codex installation. Share the exact error and verify a supported installation route. |
| You cannot find team creation after installing | Install the latest version, fully restart Codex, then send the creation request in a project chat. |
| Native creation tools are unavailable | Use a Codex host supporting them, or request connection of real existing chats. |
| Setup waits for model selection | Choose option A/B above or provide concrete role-by-role selections. |
| Only some chats were created | Resume the saved setup and verify actual native results. Do not repeatedly request a fresh team. |
| Setup targets the wrong project | Stop the current setup and specify the correct project. Do not automatically delete or replace chats. |
| The room shows another project | Check both the room selector and the native director chat; open the room in the intended director chat. |
| Usage is unavailable | Matching records may be absent or incomplete. Unavailable does not mean zero. |

In the conversation that was performing setup, send:

```text
Check this project's interrupted team setup and continue it.
Distinguish chats already created from creation results still unverified.
Do not recreate a chat merely because its delivery result is uncertain.
Verify the existing native results and connect them to the original plan.
```

A new attempt requires verified absence and an explicit human retry request, with any model change specified. Silence or elapsed time is not proof that no chat was created.

## Updates and usage

From the downloaded `AI-team-meeting-room` directory, run:

```sh
git pull --ff-only
codex plugin add jyfood-room@jyfood-local
```

Finish active work, then fully quit/reopen Codex. Updating the plugin does not require creating a new staff team.

Storing/reading setup records invokes no separate model. The orchestrating conversation, each new chat's initial role turn, actual work, image generation/analysis and reporting have ordinary usage. Setup adds no recurring AI status checks. Completed participant usage is shown only when actual matching records are available; missing values are not guessed.

Connections and setup journals normally live under the user's `~/.codex/team-room`, or the configured `TEAM_ROOM_HOME`. Do not publish actual chat IDs, project paths or records to GitHub or configuration examples.

## Further reading

- [Full user guide](USER_GUIDE.en.md): menus, images, details, validation, usage and records
- [Complete collaboration policy](skills/team-room/references/collaboration-policy.md): role, ownership, programmer and QA rules (Korean)
- [Detailed designer workflow](skills/team-room/references/design-collaboration.md): specifications, candidate review, revisions and developer handoff (Korean)
- [Agent team-creation workflow](skills/team-room/references/team-creation.md): tool protocol and recovery details

For everyday setup, use the copyable requests above. The last reference is technical material for plugin developers and agents.

To remove a room from the active list, use **메뉴 → 회의실 삭제** and confirm. Restore it under **삭제된 회의실 → 복구**. Native chats stay; unfinished work blocks deletion. [Delete/restore guide](USER_GUIDE.en.md#delete-and-restore-a-room).

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


## Import a ZIP backup

Open the room from the **original local project chat**, then choose **Menu → Import backup → Choose ZIP file**. File selection supports 16 MiB; use **Import from a local path** for an absolute local ZIP path up to 128 MiB. Review the room name, participant and record/media counts, then explicitly click **Restore reviewed room**. Selecting a file and previewing it do not change meeting records.

Recovery requires a missing room/registration, finished backup work and verified original staff chats still in that native project. Existing records are never overwritten or merged. Soft-deleted rooms use **Archived rooms → Restore** instead. Unfinished backups remain readable through their offline index.html; no old job is automatically re-executed.

New requests are paused after recovery. Select the restored room above, inspect its staff, original posts and attachments, then explicitly resume new requests if needed. Use **Check earlier recovery → Continue checking** after an interruption. Uncertain results are reconciled only through another explicit confirmation of the same original recovery, never an automatic retry.

Workspace authorization, project source files, QA/work-control ledgers, usage sources and native Codex chats are not imported. Existing local ownership, attempt history and usage records remain untouched; missing usage remains unavailable. See [recovery scope and guards](skills/team-room/references/backup-recovery.md).

[日本語 guide](USER_GUIDE.ja.md) · [简体中文 guide](USER_GUIDE.zh-Hans.md) · [繁體中文 guide](USER_GUIDE.zh-Hant.md) · [Actual-host checks and duplicate-tab limitations](skills/team-room/references/host-validation.md)
