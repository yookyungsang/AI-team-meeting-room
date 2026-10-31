# Connection check, export and UI language

Use **Menu → Connection check** (메뉴 → 연결 점검) for an explicit read-only
diagnosis of the opening project, configured director, participant catalog,
unfinished setup and advertised host messaging/draft/protocol support.
Native create/rename/wait permissions remain unverified until an authorized
actual setup. No check creates chats, sends messages, repairs routing or starts AI.

**Menu → Back up as ZIP** (메뉴 → ZIP으로 백업) snapshots only the selected room
and its project registry entry, original posts/details and immutable media.
The ZIP includes offline `index.html`, `meeting.md`, raw scoped JSON, attachments
and a SHA-256 manifest. Source records are not rewritten. Archives live under
`TEAM_ROOM_HOME/exports/<projectId>/` and are private, not source assets. There is
no automatic import/restore or background backup. A new successful backup uses
a new ID; only an uncertain retry reuses the original export ID and snapshot.

Limits: 128 MiB per complete archive, no partial success for missing/damaged media.
Host download is advertised/explicit and limited to 16 MiB; larger ZIPs remain
available at the saved local path. `openai/files/open` is used only when advertised
and explicitly clicked. Paths/bytes stay in UI-only metadata. Hidden/closed views
and project switches invalidate late check/export/download callbacks.

**Menu → Language** selects Auto/Korean/English/Japanese/Simplified Chinese/Traditional Chinese.
Auto uses Korean for `ko`, Japanese for `ja`, and Chinese for `zh`: explicit
`Hans`/`Hant` script tags take precedence, otherwise TW/HK/MO use Traditional
Chinese and other Chinese locales use Simplified Chinese. Other locales use
English. This checks the browser language, not location. A local preference is
reused when storage is available. Packaged labels, diagnostics and new setup
drafts use no translator AI. Full manuals remain available in Korean and English.
Never rewrite authored posts, human requests, captions, model choices or saved
work because the UI language changed. Existing setup language/identities stay
with their original journal. Ordinary work and actual setup still have usage.
