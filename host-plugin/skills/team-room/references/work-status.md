# Saved work status and recovery guide · 0.20.0

## 한국어

회의실 위쪽 **작업 현황**은 현재 표시 중인 대화 페이지와 관계없이 전체 저장
기록에서 계산합니다. 진행 요청은 완료·실패하지 않은 원래 요청 수, 결과 대기는
배정이 예약된 담당자 수(여러 작업에 겹치면 한 명), 배정 대기는 아직 예약되지
않은 작업 수입니다. 미답변 질문은 진행 요청과 추가 요청에서 답변이 연결되지
않은 질문 수이고, 실패 기록은 보관된 원래 요청의 실패 수입니다. 숫자가 0이라고
모든 검증이 통과했다는 뜻은 아닙니다. 역할·담당자별 상태는 **작업·복구 안내**에서
확인합니다. 배정 기록은 실제 채팅이 현재 실행 중이거나 중단됐다는 증거가 아닙니다.

**작업·복구 안내**를 누르면 진행·실패 요청을 선택해 담당자, 저장된 체크포인트,
기록된 다음 작업, 파일·Editor 소유권, 관련 검증과 미답변 질문을 확인할 수 있습니다.
최근 20개를 우선 표시하고 선택한 요청은 유지합니다. 검증은 최대 30개, 질문은
최근 10개, 담당자별 점유 경로는 최대 30개를 표시합니다. 긴 본문은 일부만
표시하므로 총괄은 재개 전에 원래 요청과 전체 작업 기록을 확인해야 합니다.
원문은 수정하지 않습니다. 체크포인트가 없으면 없다고 표시합니다.

**총괄에게 확인할 요청문 준비 → 요청문 복사**로 확인 요청을 만들고, 선택한
프로젝트의 총괄 채팅에서 검토 후 직접 전송하세요. 회의실의 작성 중인 입력은
바꾸지 않습니다. 복구 안내 조회와 요청문 준비는 작업·메시지·소유권·승인 기록을
변경하지 않으며 담당자 호출, 자동 전송, 강제 점유 해제나 재실행을 하지 않습니다.
안내와 복사는 AI를 호출하지 않지만 실제 전송 후 총괄의 확인과 작업에는 정상
사용량이 발생합니다. 기존 화면 갱신을 재사용하며 추가 주기 조회를 만들지 않습니다.

총괄은 먼저 원래 작업과 검증 프로세스의 실제 중단 여부를 확인합니다. 중단이
확인된 경우에만 기존 승인 범위에서 [기존 복구 절차](work-controls.md#interrupted-work-and-handoff)를
진행합니다. 실행 상태가 불확실한 검증은 먼저 정리하고, 재검증은 기존 총괄 승인과
실행 키 규칙을 따릅니다. 참고 기록이나 준비된 요청문 자체는 승인 증거가 아닙니다.
이미 완료한 요청을 선택하면 상태만 보여주며 복구 요청문을 준비하지 않습니다.

## English

The overview uses complete saved room records, even while viewing an older page.
It counts active original requests, distinct reserved members, pending jobs,
unanswered questions in active requests/follow-ups, and stored failed original
requests. These are assignment records, not native liveness detection or a QA
pass verdict. The existing UI refresh supplies the counts; no new periodic calls
or AI are added. A failed refresh marks the last received counts as stale.

Open **Work & recovery** to choose a task and inspect recorded member states,
checkpoints, next steps, relative owned paths, checks and unanswered questions.
The latest 20 candidates plus the selected request are retained; display limits
are 30 checks, 10 questions and 30 owned paths per member. Long record excerpts
are clipped without altering originals. Missing checkpoints stay explicitly
missing. The guide is a read-only snapshot; refresh it explicitly as needed.

**Prepare a director review request → Copy request** creates text to review and
send manually in the selected project's director chat. It preserves the composer
draft and copies no checkpoint text into instructions. It never sends, recovers,
releases a lease, approves a test or wakes a participant. Only actual chat work
after submission has ordinary model usage. Completed tasks cannot prepare a
recovery request. Existing scopes, stop verification, durable ownership, retry
limits and director-only recovery/retest approvals remain mandatory.
