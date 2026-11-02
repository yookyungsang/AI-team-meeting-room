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
