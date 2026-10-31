# Releases and automatic checks / 배포와 자동 검사

[Public beta releases / 공개 베타 배포](https://github.com/yookyungsang/AI-team-meeting-room/releases) ·
[Automatic checks / 자동 검사](https://github.com/yookyungsang/AI-team-meeting-room/actions/workflows/checks.yml)

The current release channel is **public beta**. Label new releases as GitHub
pre-releases and link the current beta explicitly from the README;
`releases/latest` can select an older release because it excludes pre-releases.
Do not describe passing automated tests as complete native-app validation.
Keep the [actual-host validation limits](host-validation.md) visible.

## What runs automatically

`Checks` runs on pushes to `main`, pull requests targeting `main`, or an explicit
manual Actions run. A funding-link-only edit is skipped. One Node 22 job runs on
Windows and one on Linux, each with a six-minute limit. A newer run for the same
branch/PR cancels the old run. There is no timer, automatic retry, AI review,
dependency installation, browser download or automatic publishing step.

Each job runs `npm run check:package` and `npm test`. The package check verifies
versions, plugin/server identity, license copies, local document links and
runtime-data exclusion. Regression tests use isolated synthetic data; they do
not contact workers, read real meeting history, use an AI API or run a real Unity
Editor. Actions has read-only repository permission, and the source checkout does
not persist its credential. Test failures appear in the Actions step log.

The optional `scripts/check-layout.mjs` remains an explicit UI-change check.
Automatic regression checks do not certify native Codex integration, actual
Editor/device behavior, or the correctness of a real project's generated assets.
Passing checks are evidence for the covered cases, not a claim that all bugs are absent.

## Publish the next version

1. Finish the authorized change. Update `package.json`, both plugin manifests,
   the UI app version and setup/user-guide version labels together when changing
   the installed plugin. Preserve `team-room@team-room-local` and MCP key `team-room`.
   The user-authorized 0.17.0 rename is documented in
   [installation-name migration](../host-plugin/MIGRATION.md); do not silently rename again.
2. Add bilingual `docs/releases/vX.Y.Z.md` with changes, installation/update
   commands and actual validation limits. Never include runtime data, real chat
   IDs, local paths, transcripts, tokens or conversation screenshots.
3. Run `npm run check:package` and `npm test`. For UI changes, run the documented
   browser harness too. Inspect the diff and commit only the intended source.
4. Push the commit to `main`. Wait for both GitHub check jobs on that exact commit
   to succeed; inspect failures instead of repeatedly rerunning unchanged tests.
5. Publish a GitHub Release only within the human's existing publishing
   authorization, targeting that exact tested commit. GitHub CLI example:

   ```sh
   gh release create vX.Y.Z --repo yookyungsang/AI-team-meeting-room --target TESTED_COMMIT_SHA --title "vX.Y.Z - Public Beta - Team Meeting Room" --notes-file docs/releases/vX.Y.Z.md --prerelease
   ```

   Replace the placeholders. If the tag/release already exists, inspect it and
   preserve it; do not move tags, overwrite published versions or force-push.
6. Verify the public release's commit, version, notes and source archive links.
   GitHub supplies source ZIP/tar archives from the tag; no manually collected
   workspace or installed-cache archive is uploaded. Reinstall locally through
   the supported Codex command only when the installed package changed.

## 사용자 안내

현재는 **공개 베타**로 배포하며 사용자의 실제 환경에서 의견과 오류 제보를 받습니다.
GitHub의 `Pre-release` 표시와 README의 현재 베타 링크를 확인하세요. 처음 팀 만들기,
작업·QA·중단 복구의 전체 흐름과 재시작·중복 탭 동작은 추가 실사용 검증이 필요합니다.
문제가 생기면 앱·플러그인 버전과 재현 순서를 GitHub Issues에 남겨 주세요.

**배포**는 버전별 변경 내용·설치법·업데이트 방법을 GitHub Releases에 모으는
것입니다. 최신 배포에서 설명을 읽고 안내된 명령으로 설치하세요. Source code
ZIP은 저장소 사본이며 설치 프로그램은 아닙니다. 기존 기록은 소스 폴더 밖에
보관되므로 코드 업데이트와 분리됩니다.

**자동 검사**는 코드를 올렸을 때 Windows·Linux에서 패키지와 기존 테스트를
돌리는 기능입니다. 평소에는 AI 토큰을 쓰지 않고, GitHub 실행 자원을 사용합니다.
같은 작업의 오래된 실행을 취소하고 예약 실행·자동 재시도는 추가하지 않습니다.
검사 통과·실패와 로그는 위의 자동 검사 링크에서 확인할 수 있습니다.

베타 배포는 검사 통과한 커밋을 대상으로 명시적으로 게시합니다. 검사가 통과해도
자동으로 사용자 설치를 바꾸거나 작업자를 호출하지 않습니다.
