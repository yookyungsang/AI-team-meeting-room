# One-use automatic tab opening / 한 번만 자동으로 탭 열기

`room_open` creates a short-lived one-use display ticket in UI-only metadata.
The UI claims it durably before requesting fullscreen once. Replayed cards,
state refreshes and visibility changes never mint tickets or resend a consumed
request. This is a local display guard, not native tab discovery or authorization
for any work, messaging, chat creation or model call.

The initial resource stays inline so historical cards cannot open tabs before
the guard runs. A fresh request may automatically move to fullscreen through
the supported host display-mode RPC. A manually opened fullscreen entrypoint
registers its display without requesting another transition.

The separate `TEAM_ROOM_HOME/room-views.json` keeps only hashed display scopes,
random ticket/view/instance IDs and ticket timestamps. Verified native project
membership shares a scope across sibling chats and initial team connection.
Unavailable local membership metadata fails closed instead of falling back to
a different key that could bypass an occupied scope. Explicit remote rooms use
their stable room ID.
No cwd/recency guessing, roster change or transcript mutation occurs. The ledger
is excluded from meeting backup and import. Copying a backup is not a live-tab
receipt. Old/pruned/expired tickets cannot regain the ability to auto-open.

An occupied display never expires automatically: a hidden or restored tab may
still exist. A new card instead shows a nonmodal explanation. After personally
checking that **no existing room tab is present**, the user may choose
**기존 탭 없음 · 다시 열기 / No existing tab · reopen** once. The confirmation
is tied to the observed prior display. Competing/stale recovery and late cleanup
cannot overwrite or release a newer reservation. A lost native receipt is never
automatically retried. Storage errors leave the card usable and do not silently
open another tab. Director input, work, pause state and dispatch are unaffected.

An explicit host resource teardown or fullscreen-to-inline transition releases
only its own display reservation. `pagehide`, silence and elapsed time do not
prove closure. If the app exits abruptly or cleanup cannot reach the server,
the next fresh opening asks for the same human check. No heartbeat, extra polling,
model call, process shutdown or host-cache patch is added.

## Limits / 한계

This does **not** guarantee one native tab under every condition. The plugin
cannot enumerate, focus, merge or close native MCP tabs. Old installed versions,
tabs created before this guard, the host's own manual Expand/thread entrypoint,
other clients and an incorrect no-tab confirmation can bypass its knowledge.
Before first use after upgrading, finish work and manually close obsolete room
tabs. Normal native menu/Expand controls remain available; the recovery control
exists only for a blocked/uncertain one-use opening, not as a generic mode toggle.

Isolated tests validate durable claims, replay/restart suppression, recovery
races and safe UI teardown. They are not proof of native Codex tab counts, crash
restoration or display transitions; report actual-host verification separately.

## 한국어 사용법

1. 새로 **회의실 열어줘**라고 요청하면 열기 기록을 확인한 뒤 상단 탭으로
   한 번 전환을 요청합니다. 예전 카드가 다시 보이는 것만으로 재요청하지 않습니다.
2. 기존 열기 기록이 남아 있으면 자동으로 추가 탭을 만들지 않습니다. 상단의
   기존 회의실 탭을 사용하세요. 회의실 카드의 채팅 입력도 계속 사용할 수 있습니다.
3. 앱이 갑자기 종료되는 등 실제 탭이 없어진 경우에만 기존 탭이 없는지 확인하고
   **기존 탭 없음 · 다시 열기**를 누릅니다. 기록을 시간만으로 지우지 않습니다.

별도 AI 호출이나 담당자 알림은 추가하지 않습니다. 현재 앱의 기존 탭 조회·재사용
기능이 없어 모든 종류의 중복을 완전히 막거나 기존 탭으로 자동 이동하지는 못합니다.
