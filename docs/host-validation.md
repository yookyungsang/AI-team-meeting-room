# Actual-host validation / 실제 앱 검증

[검증 결과와 중복 탭 한계 · Host validation and duplicate tabs](../host-plugin/skills/team-room/references/host-validation.md)

The packaged report records the implementation, earlier checks and native-host
limits. The observations below were collected after installing v0.18.2. Native
crash/restoration, historical scrolling and end-to-end team creation remain
separate from these checks and from isolated browser tests.

## 2026-11-02 · 실제 앱에서 추가 확인한 범위

- 현재 채팅에서 열린 실제 MCP App 탭 하나를 확인했습니다. 새 설치본의 메뉴에서
  언어 설명과 선택 목록 사이 간격이 **12px**임을 측정했습니다. 영어 전환과
  원래 언어로 복귀, 초안 보존과 연결 점검 결과 표시도 확인했습니다.
- 기존 회의실의 **전송하지 않은 초안**에 가상 검사 문자열을 넣었습니다. 경고가
  표시돼도 전송 버튼은 활성화 상태였고, 추가 모달이나 작업 일시정지는 없었습니다.
  경고에 검사 문자열을 재노출하지 않았으며 초안을 원래대로 복원했습니다.
  실제 작업 지시나 담당자 AI는 호출하지 않았습니다.
- 실제 메뉴에서 가림 적용·해제 공유 ZIP을 각각 생성했습니다. ZIP 무결성,
  manifest의 선택값, 복구용 연결 JSON 미포함을 확인했습니다. 원문과 프로젝트
  설정 파일은 검사 전후 해시가 같았습니다. 메뉴를 닫은 뒤 기본 가림 선택과
  원래 프로젝트 선택·초안도 복원했습니다. 파일은 로컬에만 생성했습니다.
- 해당 기록에는 검사 대상 문자열이 없었습니다. 따라서 실제 앱 검사는 선택값
  전달·ZIP 생성·원문 보존의 증거이며, 문자열이 실제로 바뀌는 양성 가림 검사는
  가상 데이터의 저장소·브라우저 검사에서 확인한 결과입니다. 이를 실제 기록에
  비밀값을 넣어 검사한 것처럼 표시하지 않습니다.

반복 열기 요청 뒤에도 관측한 탭은 하나였지만, 두 번째 카드의 표시 요청은 당시
아직 소비되지 않았습니다. 이를 native 중복 방지 전체 통과로 계산하지 않습니다.
역사 카드 스크롤·앱 강제 종료·복원과 수동 호스트 기능까지 포함한 보장은 없습니다.
격리된 자동 검사는 273개, 브라우저 검사는 26개가 통과했으며 언어 선택 간격은
추가로 다섯 언어·세 화면 폭에서 확인했습니다. 검사에 사용한 실제 화면·로컬 경로·
회의 원문·담당자 식별자는 저장소에 넣지 않았습니다.

## English

Native v0.18.2 checks observed one MCP App tab, a 12px language-picker gap,
language switching/draft preservation and connection diagnostics. An unsent
synthetic token draft triggered a hint without disabling send or opening a modal;
the draft was restored. Native mask/keep sharing ZIPs preserved original records
and carried the correct policy, without recovery routing JSON. The source room
contained no detector matches, so positive redaction remains evidenced by
isolated fixtures. A second opening ticket was not yet consumed when observed:
the single tab count is not proof of native deduplication. Crash restoration,
historical scrolling and full team workflows remain unverified. No worker AI was
invoked and no real transcripts, paths or screenshots were published.


## 2026-11-02 · v0.19.0 readiness checks

사용자의 명시 승인을 받은 검증용 개발자·QA 대화 두 개만 만들었습니다. 개발자가
보호된 파일을 작성·자체 점검·체크포인트 저장 후 턴을 끝냈고, 총괄이 실제 native
completed/idle을 확인한 뒤 같은 담당자에게 명시적으로 복구를 지시했습니다. 같은
대화에서 최종 파일·점검·소유권 반환·완료 보고를 마쳤으며, 별도 QA가 원문·값·
마지막 개행·최신 체크포인트·점유 없음·복구 횟수를 독립 확인했습니다. 실제 MCP
App 화면에서 개발자·QA 각자의 보고 표시도 확인했습니다. 대기용 AI 호출이나
자동 재전송·대화 재생성은 추가하지 않았습니다.

이 과정에서 실제 사용자 입력은 로컬 서버를 통해 저장한 뒤 승인된 native 메시지
도구로 전달했습니다. 실제 회의실 Enter 입력 전송, 기본 6인 팀 전체 생성,
예기치 않은 OS/앱 강제 종료를 재현한 것으로 계산하지 않습니다.

실제 검증용 회의실 백업과 실제 native 프로젝트 메타데이터를 사용해 **격리된
빈 복구 대상**에서 원문·요청·담당자 연결의 일치, paused 복원, 작업 폴더 권한
미복원, 같은 apply의 중복 방지를 확인했습니다. 레지스트리 커밋에서 통제된 오류를
주입한 뒤 같은 복구 요청으로 이어지는 검사도 통과했고, 원본 설정·회의 파일은
해시가 같았습니다. 기존 실제 회의실에 복구를 적용하거나 긍정 경로의 native GUI
복구까지 실행한 것은 아닙니다. 실제 백업에는 미디어가 없으며 이미지·음원 복원은
기존 가상 데이터 검사 범위입니다.

복구 검사에서 **native create_thread로 만든 사용자 소유 대화가 목록에서 누락**되는
문제를 발견해 수정했습니다. `agent_created_thread` 출처도 명시적인 원래 프로젝트
소속을 확인한 경우에만 포함합니다. 내부 subagent·검토 대화, 다른 프로젝트·소속
불명 대화는 계속 제외하며, 출처 표시는 실행 승인으로 사용하지 않습니다.

로컬 자동 검사 277개와 격리 Chromium 검사 28개를 통과했습니다. 긴 기록 검사는
1만 건에서도 메시지 DOM을 100개로 제한하고, 이전/최근 이동·초안·활성 요청 연결·
변경 없는 DOM 보존을 확인했습니다. 100/1,000/10,000건 MCP 읽기+직렬화 비교에서
1만 건 전체 응답은 약 29MB·82ms, 첫 페이지는 약 292KB·50ms, 캐시된 페이지의
중앙값은 약 5ms, 변경 없는 갱신은 약 1.7KB·4ms였습니다. 한 환경의 가상 데이터
측정이며 실제 Codex 렌더 지연·AI 토큰 절약률을 증명하지 않습니다.

정식 배포 판단 전에는 지원 호스트의 깨끗한 신규 설치, 실제 메뉴 팀 구성부터
입력 전송까지의 전체 경로, 예기치 않은 재시작·탭 복원, native GUI 백업 복구,
긴 실제 기록 표시를 추가 확인해야 합니다. 이번 결과로 전부 검증됐다고 표시하지
않으며 공개 베타를 유지합니다. 실제 대화 식별자·원문·경로·스크린샷은 공개하지
않습니다.

### English: current scope

Two explicitly approved native worker chats completed a controlled checkpoint
stop → same-worker recovery → self-check → independent QA handoff. Their own
posts were observed in the real MCP App. The request was stored through local
instrumentation; native composer submission and unexpected crash recovery were
not exercised. No polling AI or replacement chats were added.

A backup of that actual test room was restored to isolated empty destinations
using real native membership, including a controlled registry-write interruption
and explicit same-import recovery. Records/routes matched, restore was paused,
workspace authority was absent, exact retries did not duplicate, and source hashes
were unchanged. This is not a positive native GUI restore or real-media backup.
The check revealed and fixed exclusion of native-created sidebar chats; explicit
project membership is still required and internal agent/review sources stay out.

277 local tests and 28 isolated browser cases passed. The 10,000-record load
comparison measures local MCP payload and serialization, not native latency or
model billing. Full onboarding, unexpected app/tab recovery, updated native long
history and positive GUI restore remain stable-release gates.
