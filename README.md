# AI Team Meeting Room

**English** | [한국어](README.ko.md)

A local Codex plugin that connects existing AI chats into project-based team meeting rooms. Send a goal to your project's director, then follow questions, progress reports, images and results from the participants doing the work.

Start with the [English user guide](host-plugin/USER_GUIDE.en.md) or the [한국어 사용 설명서](host-plugin/USER_GUIDE.ko.md) for installation, setup, everyday use and troubleshooting.

## Features and scope

- Connect one existing director chat and up to 19 existing participant chats per project.
- Keep each project's chat connections, meeting history and input drafts separate.
- Use a compact dark chat view with names and roles, Enter to send, Shift+Enter for a new line, and Korean IME composition protection.
- Link questions to answers, reject duplicate delivery reservations, and preserve the original content on retries.
- Send additions while the director is working. They link to the latest active original request and must be handled before the director completes it. A pending delivery receipt does not block new, different input.
- Read, save and refresh the meeting view without invoking a model. Actual work and reporting by the director and participants use AI normally.

The plugin combines participants' own posts with Codex's existing chat messaging tools. It does not collect every existing conversation or independently send network messages to participants. No separate API key, replacement agents or AI heartbeat is needed. Storage tools may be usable in other MCP hosts, but collaboration between existing Codex chats requires the host's chat messaging tools.

## Install

You need Node.js 22 or later, Git, and a Codex version that supports local plugins and MCP Apps.

```sh
git clone https://github.com/yookyungsang/AI-team-meeting-room.git
cd AI-team-meeting-room
codex plugin marketplace add .
codex plugin add jyfood-room@jyfood-local
```

The display name in Codex is **팀 회의실** (Team Meeting Room), and the MCP server key is **team-room**. The installation ID remains `jyfood-room@jyfood-local` to preserve existing installations. It does not restrict the plugin to any particular project. If Codex is already running, finish active work and fully quit and reopen it to load the updated installation.

A private repository requires GitHub access. Make source changes in this independent repository, update the version when releasing a plugin change, and reinstall from that source. Do not edit installed cache files directly.

## Connect a project and use the room

1. In the project's existing director chat, ask: **“Connect this project and its existing participant chats to Team Meeting Room.”** Specify the participants, roles and scope of collaboration you authorize.
2. The director verifies the real chat IDs, hosts, roles and human authorization, then registers them with `room_configure`. The [example configuration](examples/project.example.json) illustrates the format; replace its synthetic values with verified connections in your local runtime data.
3. Ask: **“Open Team Meeting Room.”** `room_open(projectId)` opens that room; omitting the ID opens the project chooser.
4. Send your goal in the room's input field. The director assigns work to the needed participants, who post their own substantive contributions.

Selecting a project changes the displayed history and draft; it does not switch the current Codex chat. Open the room in that project's director chat when possible. A request sent from another chat may require one forwarding turn to the verified director. Existing routing cannot be overwritten, protecting history and active requests. Register a different roster under a new `projectId`.

## Progress images and final results

Participants can attach saved drafts, generated images and screenshots to progress or final reports. Images appear in the meeting conversation and can be opened at a larger size.

Keep intermediate images infrequent: use them when the user asks, a visual decision is needed, or an error or substantial visual change needs evidence that text alone cannot convey. Prefer one representative image already available. Avoid unchanged views and extra generation or capture merely to fill a report. Required implementation and QA checks still apply.

For a completed visual deliverable, such as a screen, UI, design, generated image or 3D result, the collaboration instructions require one representative image of the actual final state in the final report. Reuse an accurate existing image; otherwise capture the final state once within the authorized workflow. Disclose unavailable capture or file access, and do not label an intermediate draft as a finished result. Text-only tasks do not need decorative images.

`room_post` and `room_reply` accept the optional field `images: [{path: ABSOLUTE_LOCAL_FILE, caption: DESCRIPTION}]`. A message supports up to 4 PNG, JPEG, GIF or WebP files, each up to 8 MiB. The meeting server must be able to read the files on its own computer. Images are copied at posting time, so later changes or deletion of the source do not change a posted snapshot. A retry with the same key keeps the original attachment; use a new `messageKey` for a new stage.

The UI loads and enlarges images without extra AI calls. Source paths and image bytes are excluded from the model-facing meeting history. Image generation, analysis and report writing use AI normally. Native chat images are not mirrored automatically, and the plugin does not record or stream your screen.

## Roles and validation

The packaged [complete collaboration policy](host-plugin/skills/team-room/references/collaboration-policy.md) contains 12 director sections, 9 programmer collaboration sections, 8 QA error rules, and rules for roles, skill selection, file/shared-app handoffs, model selection, reporting and completion. The full policy is currently in Korean; the [operating skill](host-plugin/skills/team-room/SKILL.md) also summarizes the main rules in English. Neither requires another project's source directory or roster.

Apply the rules only to existing connected participants within human-authorized scope. Prefer independent parallel work when multiple programmers are already connected; do not create missing staff. Each project's human instructions, preservation rules and actual host/tool restrictions take precedence. Read the policy at the first collaboration, then consult only changed or relevant sections and hand off deltas. No mass edits to other projects, policy-only wakeups or automatic model changes are added.

Persist ownership in project instructions. Planners own game systems, balance and level design; designers own character, UI, background and 3D asset planning; QA owns test cases, reproduction and validation. Programmers implement and perform lightweight self-checks before handing off to QA. The director approves, assigns and integrates. Follow the actual team's roles and human overrides.

The [collaboration efficiency rules](docs/collaboration-efficiency.md) give additional detail in Korean. Hand off the shared editor explicitly, and do not repeat passing checks merely because the operator changes. These instructions do not create staff or periodic AI calls.

## Storage and privacy

Runtime data defaults to `~/.codex/team-room`, outside this repository.

- `projects.json`: project connections to verified existing chats.
- `rooms/<projectId>.json`: requests, messages and pause state for each project.
- `rooms/<projectId>.json.images/`: posted image copies, identified by content hash.
- `TEAM_ROOM_HOME`: an environment variable for a different runtime data location.

Runtime files are not part of the source or installation package. Moving the source repository does not lose history if the data location remains the same. There is no automatic cloud sync or external upload. Examples and tests use synthetic data. Never commit real chat IDs, connection registries, transcripts, local user paths, tokens or conversation screenshots.

## Development and checks

```sh
npm test
npm start
```

`npm start` launches a JSON-RPC stdio MCP server, not an HTTP website. It cannot be opened directly at a browser address. The runtime uses Node's built-in modules; `npm install` is not required to run it.

- `host-plugin/`: MCP server, project/message storage, UI, operating skill and host manifests.
- `.agents/plugins/marketplace.json`: local marketplace registration.
- `test/`: isolated store and bridge regression checks.
- `scripts/check-layout.mjs`: optional Playwright browser layout harness.
- [UI lifecycle notes](docs/ui-lifecycle.md): teardown, inline height fixes and validation limits (Korean).

For the browser harness, install Playwright and Chromium separately. You can set `PLAYWRIGHT_MODULE` to the module path and `BROWSER_EXECUTABLE` to the Chromium executable.

```sh
node scripts/check-layout.mjs
```

## Current limitations

- The meeting UI and full collaboration policy currently use Korean. These English documents do not add automatic UI or report translation, location detection or a separate translation model.
- Stored configuration is not a substitute for human authorization or caller authentication. Follow the operating skill and verified human scope.
- Failed or uncertain delivery is not resent automatically. Check the exact project/request status first.
- The host decides whether additions steer an active turn or wait for a later turn. The director also checks saved additions at meaningful checkpoints and before completion. This does not add an idle AI call or model runtime.
- Pausing blocks new requests and assignments; it does not cancel active Codex turns.
- Full native-history mirroring, remote web/mobile access and an independent model runtime are not provided.
- Version 0.3.1 introduced teardown and inline height fixes. The standalone browser harness does not verify actual Codex display transitions or control the position of Codex's native floating composer.
