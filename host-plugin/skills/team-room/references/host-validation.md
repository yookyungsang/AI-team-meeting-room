# Host validation and duplicate tabs / 실제 앱 검증과 중복 탭

## 확인한 것

- 설치된 Codex 호스트의 `room_open` 호출이 성공했고, 여는 대화의 프로젝트를 확인해 미연결 상태와 선택 화면 데이터를 반환했습니다. 회의실이나 담당자 채팅을 새로 만들지 않았습니다.
- 설치된 데스크톱 앱 버전 `26.1027.3384`의 로컬 MCP 진입점 코드를 읽기 전용으로 확인했습니다. 기본 열기 경로는 호출마다 새 인스턴스 식별자로 탭 ID를 만들며, 저장된 탭 복원은 기존 탭 ID를 유지합니다. 같은 회의실을 별도 탭으로 열 수 있는 구조입니다.
- 플러그인은 고정된 `ui://team-room/meeting.html` 리소스를 사용합니다. 화면 갱신은 `room_state`를 조회하며 `room_open`·채팅 생성·AI를 반복 호출하지 않습니다.
- 현재 제공된 호스트 도구에는 MCP 탭의 조회·활성화·통합·닫기 API가 없습니다. `open_in_codex`의 파일·브라우저 패널 열기를 MCP 탭 관리 권한으로 취급하지 않습니다.

## 2026-10-31 추가 확인과 화면 복원 보완

- 사용자가 펼친 실제 MCP App 패널이 검사 목록에 나타났고, 최초 DOM에서 여는 프로젝트의 미연결 안내와 자동 선택을 확인했습니다. 메뉴 열기를 실행한 뒤 사용자가 정상으로 열렸음을 확인했습니다. 이후 DOM 검사 연결은 시간초과됐으므로 언어 전환·연결 점검까지 실제 앱에서 통과했다고 표시하지 않습니다.
- 앱을 시작하다 다시 닫힌다는 보고에 따라 로컬 앱 로그, Windows 응용 프로그램·앱 시작 오류 기록과 충돌 보고 목록을 읽기 전용으로 확인했습니다. 확인한 실행에서는 화면 크기 관찰 오류가 회의실 sandbox 시작 전부터 나타났습니다. 종료 시 앱이 창과 연결을 정리한 뒤 내부 통신의 `EPIPE`가 기록됐으므로, 그 통신 오류를 종료의 원인으로 단정하지 않습니다. 해당 시간대의 직접적인 충돌 보고는 찾지 못했으며, 기록이 없다고 정상 종료나 무충돌을 증명하는 것은 아닙니다.
- v0.16.2는 회의실의 크기 처리에서 재현한 별도 문제를 보완합니다. 전체 화면에서는 호스트 viewport 높이를 다시 크기 알림으로 보내지 않고, 같은 정수 높이는 스타일을 다시 쓰지 않습니다. 숨겨진 패널은 최신 호스트 크기만 기억하고 다시 보일 때 한 번 반영합니다. 종료 후 늦은 응답 차단과 프로젝트별 기록·원문·입력 보존은 유지합니다.
- 격리된 검사에서 이전 동작의 크기 알림·중복 스타일 쓰기를 재현한 뒤 수정 결과를 확인합니다. 이 보완이 실제 앱의 첫 실행 종료를 해결했는지, 회의실을 닫은 상태와 열린 상태에서 재시작이 달라지는지는 아직 확인하지 못했습니다. 호스트 설치 파일·저장된 탭 상태·캐시·보안 설정은 변경하지 않았습니다.

## 아직 확인하지 못한 것

**앱을 종료했다가 여는 것만으로 중복 탭이 늘어나는 정확한 재현은 미완료입니다.** 코드에서 확인한 재열기 경로와 실제 재시작 재현을 구분합니다. 이 릴리스는 중복 탭을 수정했다고 주장하지 않습니다.

최초 검사에서는 실제 MCP App 패널이 DOM 검사 목록에 없었습니다. 이후 사용자가 상단 패널로 펼친 화면은 위 추가 확인 범위까지 접근했습니다. Windows Computer Use 지침은 ChatGPT 데스크톱 UI 자동화를 금지하므로 호스트 앱의 클릭·종료·재실행을 우회 자동화하지 않았습니다. 설치 파일이나 UI 상태 저장소도 수정하지 않았습니다.

새 기본 팀 생성·실제 담당자 간 메시지·중단과 재개·완료까지의 전체 native 흐름도 별도의 실사용 확인이 필요합니다. 저장소 테스트의 가상 참가자나 격리된 브라우저 호스트를 실제 Codex 에이전트 검증으로 표시하지 않습니다.

## 실사용 확인 순서

진행 중인 실제 작업이 끝난 뒤 필요한 항목만 한 번 확인합니다. 기능 공지를 위해 전원을 호출하거나 반복 AI 점검을 만들지 않습니다.

| 항목 | 확인 방법 | 통과 기준 |
| --- | --- | --- |
| 프로젝트 인식 | 대상 프로젝트의 기존 채팅에서 회의실을 한 번 열기 | 연결된 회의실 하나가 선택되거나 정확한 미연결 안내 |
| 메뉴·언어·연결 점검 | 회의실 패널에서 메뉴와 언어 변경, 연결 점검 실행 | 원문·입력 유지, 정확한 상태와 호스트 한계 표시 |
| 팀 설정 | 실제로 새 팀이 필요한 경우에만 설명 확인 후 직접 요청문 전송 | 원래 채팅을 총괄로 사용, 새 담당자 5명만 생성, 모델 선택 유지 |
| 추가 지시 | 실제 작업 중 변경 내용 하나를 직접 전송 | 원래 요청에 연결, 중복 배정 없이 반영 또는 명확한 대기 상태 |
| 중단 복구 | 실제 중단이 확인된 설정에서 이어하기 | 원래 계획·담당자·시도 유지, 불확실한 생성 재실행 금지 |
| 재시작 탭 | 종료 전 탭 수 기록 → 앱 종료·재시작 → 열기 동작 전후 비교 | 복원만으로 증가하는지, 다시 열 때 증가하는지 구분 |
| 백업 | 실제 데이터는 별도로 보관하고 먼저 예시 ZIP으로 검사 | 미리보기 후 명시 복구, 기존 기록·다른 프로젝트 유지 |

## 이번 로컬 검증의 범위

`npm test`는 가상 참가자와 임시 데이터를 사용합니다. 백업 검사는 실제 ZIP·원문·이미지·음원·파일 해시, 손상·경로 이탈 거절, 프로젝트 격리, 저장 중단 후 같은 요청 재확인과 새 기록 보존을 포함합니다. 브라우저 검사는 실제 플러그인 UI와 로컬 저장 도구로 업로드·미리보기·복구·일시정지 상태를 확인합니다. 이 과정에는 실제 채팅 생성·메시지 전송·AI 호출이 없습니다.

Official OpenAI documentation describes [desktop tab commands](https://learn.chatgpt.com/docs/app/commands) and [local MCP configuration](https://learn.chatgpt.com/docs/extend/mcp). These pages do not establish a specific duplicate-tab restart defect. The local source observation above is evidence of distinct tab instances, not proof of the entire restart sequence.

## English

Installed-host `room_open` succeeded and resolved the opening project to an unconnected chooser without creating a room or staff chats. Read-only inspection of desktop version `26.1027.3384` confirmed that the local MCP entrypoint can generate a fresh tab instance per opening, while restored tabs retain their stored IDs. The plugin uses one stable UI resource and never reopens it in its refresh loop.

On October 31, an expanded native panel became inspectable: its first DOM snapshot confirmed the opening project's unconnected selection, and the user confirmed that the requested menu opened. Subsequent panel-inspection calls timed out; native language/connection checks remain incomplete. Read-only startup diagnostics found renderer resize-observation errors before the meeting sandbox started, followed by transport disconnections during window cleanup. No direct crash report was found for that interval; neither absence nor shutdown-time EPIPE proves the exit cause.

Version 0.16.2 hardens independently reproduced meeting sizing behavior: fullscreen no longer echoes host viewport heights, unchanged rounded heights cause no style rewrites, and hidden panels defer layout until visible. These changes are not a confirmed fix for native startup exits. Actual restart-only duplication remains unreproduced. There is no supported native MCP tab deduplication API, and no host files or state caches were patched. Windows host-UI automation is restricted. Browser fixtures do not certify native team creation, human approvals, messaging or restart transitions. Those limits remain explicit.
