# 메뉴에서 처음 팀 만들기

## 사용자가 보는 순서

아직 연결된 회의실이 없는 로컬 프로젝트의 기존 채팅에서 회의실을 열고 **메뉴 → 기본 팀 만들기**를 누릅니다. 프로젝트 이름, 여섯 역할별 모델·추론과 초기 사용량을 설명합니다. **설명 확인 · 팀 만들기**는 표시된 조합으로 새 채팅·역할 지침·회의실 연결을 진행하는 명시적 사용자 요청입니다. 설명 열기나 취소는 생성을 승인하지 않습니다.

| 역할 | 새 메뉴의 모델 | 추론 |
| --- | --- | --- |
| 총괄 디렉터 | GPT-6.1 Sol | Extra High (`xhigh`) |
| 기획자 | Codex 기본 설정 유지 | 기본 설정 유지 |
| 디자이너 | Codex 기본 설정 유지 | 기본 설정 유지 |
| 프로그래머 1·2 | GPT-6.1 Sol | High |
| QA | GPT-6 Luna | Medium |

이는 사용자가 선택한 생성 구성이고, 모든 호스트가 해당 조합을 지원한다는 보장이 아닙니다. 실제 native 지원 목록을 생성 전에 검증하며 미지원 조합은 대체하지 않고 중단·보고합니다. 기존 채팅이나 이미 저장된 설정 요청의 모델은 이 메뉴 변경으로 바꾸지 않습니다.

설명·취소·로컬 확인은 AI를 호출하지 않습니다. 적용은 현재 채팅에 한 번 전달하고, 그 채팅이 실제 native 도구로 생성·역할 초기화·연결을 수행합니다. 이 과정과 여섯 최초 역할 턴에는 일반 사용량이 있습니다. 상주 설정 에이전트·자동 재전송·주기적 AI 확인은 추가하지 않습니다. 실제 제작 작업은 연결 후 별도 사용자 지시로 시작합니다.

이 기능 구현 요청이나 문서 자체는 지금 실제 팀을 만들라는 승인이 아닙니다. 실제 메뉴 적용으로 생긴 사용자 요청 또는 직접 입력한 생성 지시가 필요합니다. 프로젝트·호스트·native 기능을 확인할 수 없는 환경은 한계를 설명합니다. 기존 회의실은 구성원 편집을 이용하며 담당자·총괄·기록을 자동 교체하지 않습니다.

## 요청을 받은 현재 채팅

1. `[TEAM-ROOM-SETUP projectId setupId]`의 정확한 키로 room_team(status)를 한 번 읽고 [기존 생성 절차](team-creation.md)를 따릅니다. requestedChoices가 있으면 사용자가 설명에서 확정한 조합입니다. 현재 native create_thread 설명에서 실제로 지원되는 모델 ID·추론을 확인해 room_team(catalog,models)에 필요한 목록을 한 번 등록하고, 같은 requestedChoices로 approve합니다. 지원되지 않으면 첫 생성 전에 중단·보고하고 대체하지 않습니다. 별도 모델 표·사용자 재확인·새 계획은 만들지 않습니다. default 역할은 native **model과 thinking을 모두 생략**하고 나머지는 저장된 정확한 값을 전달합니다. 예전 requestedChoices 없는 기본값 전용 메뉴 요청은 기존 승인과 기본 설정을 그대로 유지합니다.
2. native list_projects로 계획의 codexProjectId와 local 호스트가 실제로 존재하는지 확인합니다. 프로젝트 이름은 표시 자료입니다. ID가 없거나 다른 프로젝트이면 중단하고 보고합니다. 비슷한 이름·작업 폴더로 대체하지 않습니다. 관련 native 목록·프로젝트 지침에서 기존 역할 채팅이나 불확실한 생성 결과가 발견되면 원래 키로 먼저 대조합니다. 담당자 여부가 모호하면 새 생성 전에 확인하고 기존 채팅을 새 생성 결과로 가장해 record하지 않습니다.
3. 아직 planned인 역할만 claim → native create_thread → 실제 결과/제목 확인 → record를 진행합니다. dispatch:false는 다시 생성하지 않습니다. pending clientThreadId는 실제 threadId가 아니며 이벤트 대기로 완료를 확인합니다. 원래 setup marker·예약·기록과 block/retry 규칙을 유지합니다. 이미 만든 채팅을 바꾸거나 대체하지 않습니다.
4. 실제 여섯 ID가 준비되면 connect를 한 번 수행하고 실제 결과와 호스트가 요구하는 created-thread 첨부/지시문을 보고합니다. 완료 통보를 위해 담당자나 새 총괄에게 다시 메시지를 보내지 않습니다. 최초 native 프롬프트와 다음 실제 배정으로 역할 지침을 적용하며 기존 12/9/8 정책을 유지합니다.

## 로컬 기록과 중복 방지

UI 전용 room_team_setup(preview/apply)는 호스트 메타데이터의 여는 대화창과 [읽기 전용 프로젝트 소속](automatic-opening.md)을 확인합니다. 기존 회의실·이전 설정은 중복 생성하지 않습니다. preview는 외부 runtime의 team-menu.json에 설명 키와 모델 선택 스냅샷만 저장하고 TeamSetup 계획·채팅·회의 기록을 만들지 않습니다. apply는 원래 previewId/requestId, confirmed:true, 같은 대화창·프로젝트를 재검사한 뒤 TeamSetup에 requestedChoices로 의도를 보관합니다. 이것을 확인된 지원 목록으로 가장하지 않습니다. native 확인 후 catalog/approve를 같은 설정 턴에서 처리하며 추가 AI 턴·주기적 확인은 없습니다. 승인 선택은 설명과 정확히 일치해야 하고 지원 목록도 원래 값으로 재시도할 때만 재사용합니다.

최초 apply만 dispatch:true와 전달문을 반환합니다. 같은 저장의 재시도·서버 재시작·다른 창의 요청은 중복 전달을 허용하지 않습니다. 계획/승인 뒤 메뉴 영수증 저장 전에 중단되면 원래 setupId를 재사용합니다. 서버는 native 도구나 모델을 실행하지 않습니다. ui/message도 실제 적용 클릭 이후 살아 있는 화면에서만 한 번 수행하며 불확실한 전달은 자동 재시도하지 않습니다.

닫기·숨김·프로젝트 전환·teardown 후 늦은 결과는 메시지를 보내거나 화면을 다시 열지 않습니다. 적용했으나 전달 여부가 모호하면 처음 요청한 채팅에서 원래 setupId로 상태를 확인하고 명시적으로 이어갑니다. 버튼을 다시 눌러 대체 팀을 만들지 않습니다. team-menu.json과 team-setups.json은 실제 ID를 담는 외부 runtime 기록이므로 소스에 넣지 않습니다.

연결 완료 후 기존 로컬 갱신에서 승인한 projectId가 등록되면 회의실을 표시합니다. 수동 선택이나 입력을 시작했으면 자동 전환하지 않습니다. 호스트 채팅 자체는 새 총괄로 이동하지 않으며 이후 지시는 기존 총괄 확인·한 번 전달 규칙을 따릅니다. 실제 Codex의 native 생성·화면 전환은 별도 검증 항목이고 합성 테스트만으로 실사용 검증 완료를 주장하지 않습니다.

## Archived rooms

Deleted rooms retain their original connection and history. Use the human menu to restore them before new work or setup; never create a replacement team automatically. See [deletion and restoration](room-lifecycle.md).
