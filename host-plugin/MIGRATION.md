# 설치 이름 이전 / Installation-name migration · 0.17.0

**새 설치 이름은 `team-room@team-room-local`입니다.** 처음 설치한다면
[한국어 설치 설명서](SETUP.ko.md) 또는 [English setup guide](SETUP.en.md)의
새 설치 명령을 사용하세요. 아래 과정은 예전 이름으로 설치한 사용자에게만 필요합니다.

| 구분 / Component | 이전 / Previous | 새 이름 / New |
| --- | --- | --- |
| 플러그인 / Plugin | `jyfood-room` | `team-room` |
| 마켓플레이스 / Marketplace | `jyfood-local` | `team-room-local` |
| 설치 선택자 / Install selector | `jyfood-room@jyfood-local` | `team-room@team-room-local` |
| MCP 서버 키 / MCP server key | `team-room` | `team-room` |

## 기존 설치를 옮기는 방법

진행 중인 작업을 마치고 Codex 앱을 완전히 종료합니다. 처음 다운로드했던
`AI-team-meeting-room` 소스 폴더에서 PowerShell 또는 터미널을 열고 한 줄씩 실행하세요.

```sh
codex plugin remove jyfood-room@jyfood-local
codex plugin marketplace remove jyfood-local
git pull --ff-only
codex plugin marketplace add .
codex plugin add team-room@team-room-local
```

ZIP으로 설치했다면 `git pull --ff-only` 대신 새 소스를 다운로드하고 압축을 풉니다.
이전 플러그인·마켓플레이스 제거 뒤, 새 소스의 `host-plugin`과 README가 있는
최상위 폴더에서 마지막 두 명령을 실행하세요. 설치 파일은 소스 폴더에 있으며
회의실의 개인 데이터 폴더와 별개입니다.

Codex를 다시 실행하고 새 **팀 회의실** 플러그인으로 기존 프로젝트의 회의실을
여세요. 메뉴의 **연결 점검**에서 올바른 프로젝트와 총괄이 연결되는지 확인합니다.
기존 담당자를 다시 만들거나 회의실을 다시 등록할 필요는 없습니다. 예전 탭이나
채팅의 플러그인 링크를 자동으로 새 이름으로 바꾸지는 않습니다.

회의실 데이터는 기본 `~/.codex/team-room`, 또는 기존 `TEAM_ROOM_HOME`에 그대로
저장됩니다. 이 변경은 그 경로·프로젝트 ID·담당자 연결·회의 기록·이미지·음원·작업
소유권·검증 이력·사용량 자료를 이동하거나 다시 쓰지 않습니다. 기존 사용자 설정의
`TEAM_ROOM_HOME`을 사용한다면 새 설치에서도 같은 설정을 유지하세요.

두 이름을 동시에 활성화하면 같은 회의실 서버가 중복 제공될 수 있으므로 이전
설치를 먼저 제거합니다. 제거 명령은 플러그인과 설치 캐시를 대상으로 하며, 회의실
개인 데이터 폴더를 수동으로 삭제하지 마세요. 명령이 실패하면 그 줄에서 멈추고
오류를 확인합니다. 설치 확인을 위해 새 팀을 생성하거나 AI 작업을 시작하지 않습니다.

## Moving an existing installation

The install selector changes to `team-room@team-room-local` in 0.17.0. Finish
active work and fully quit the Codex app. Run the five commands above, one at a
time, from the original source checkout. They remove the old installation and
marketplace, update the source, register the new marketplace and install the
renamed plugin. Stop at any failed command and inspect its error.

For a ZIP installation, download and extract the updated source instead of
running `git pull --ff-only`. After removing the old plugin and marketplace,
run the final two commands from the new source root containing `host-plugin`
and the README. Do not keep both installation names enabled.

Reopen Codex, open the room through the new **Team Meeting Room** plugin in the
existing project and run **Menu → Connection check**. Do not recreate the team
or re-register existing participants. Saved tabs and old plugin links are not
rewritten automatically.

The MCP server key remains `team-room`. Data stays at `~/.codex/team-room`, or
the existing `TEAM_ROOM_HOME` override. Keep that override for the new install
if you use one. The rename does not move or rewrite project IDs, chat routes,
history, attachments, work ownership, validation attempts or usage sources.
Plugin removal targets the installed package and its cache; do not manually
delete the separate meeting-data directory.

This is a package identity change, not an automatic migration of host-managed
state. The source/package checks do not certify a restart and migration in
every Codex installation. See [actual-host validation limits](skills/team-room/references/host-validation.md).
