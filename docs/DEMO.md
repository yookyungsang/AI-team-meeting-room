# Recorded product walkthrough / 실제 화면 사용 영상

[Watch or download the 1-minute WebM](media/team-room-demo.webm) ·
[English captions](media/team-room-demo.en.vtt) ·
[한국어 자막](media/team-room-demo.ko.vtt)

![Actual plugin UI with example records](media/demo-preview.png)

This is a recording of the actual packaged widget and local meeting-store
implementation, running in an isolated browser host with synthetic project/chat
metadata and example posts. The host label stays visible throughout. No live AI
participants, native Codex chat creation, generated mock screens or paid media
APIs are used. Local backup paths are hidden. This is not a recording of native
Codex approval or display transitions; those remain separate integration checks.

The video shows conversation and work details (0:00), image preview (0:12),
audio preview (0:17), language selection (0:22), connection checks (0:27) and
verified ZIP export/download (0:34). English captions are visible in the recording;
the VTT files provide English and Korean subtitle tracks in compatible players.

## 한국어

실제 플러그인 UI와 로컬 회의 저장 기능을 실행한 화면입니다. 공개용 예시
프로젝트·채팅 정보와 예시 발언을 사용하며 실제 에이전트는 호출하지 않습니다.
영상 전체에 예시 실행임을 표시하고 로컬 백업 경로는 가렸습니다.
없는 기능을 그린 목업이나 Codex의 실제 승인·새 채팅 생성 영상이 아닙니다.

대화·작업 상세·이미지 확대·음원 미리듣기·한영 전환·연결 점검·ZIP 저장과
다운로드를 보여 줍니다. [로컬 플레이어](media/demo.html)를 내려받은 소스에서
열거나 WebM 파일을 재생하세요. GitHub에서 HTML 링크는 소스 보기로 열립니다.

## Reproduce without live AI

Optional authoring dependencies: Playwright with an available Chrome/Chromium,
Python and OpenCV with VP8 encoding. These are not plugin runtime dependencies.
The scripts do not install browsers or packages automatically.

```sh
node scripts/record-demo.mjs
python scripts/encode-demo.py
```

Set `PLAYWRIGHT_MODULE` and `BROWSER_EXECUTABLE` when those dependencies are
outside normal module/browser discovery. The recording uses loopback only and
isolated `.local/demo-data` / `.local/demo-recording` directories. It never reads
the real room home or any user's Codex rollouts. Review public media before a
release; never replace the fixture with a user's roster or private transcripts.
