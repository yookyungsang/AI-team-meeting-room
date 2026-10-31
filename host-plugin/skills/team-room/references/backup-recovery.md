# Explicit ZIP recovery

Use **Menu → Import backup** only for a human-selected Team Room ZIP and its
original local project. The app-only `room_import` tool invokes no AI, native
messages, chat creation or code from the archive.

- `start` and ordered `chunk` calls stage a selected file of at most 16 MiB.
  Each chunk is at most 128 KiB. An explicit retry keeps the same import ID,
  original offset and exact bytes; this is not background AI polling.
- `from_path` stages an explicitly entered absolute local ZIP path, up to 128 MiB.
  No source file is changed. Paths and raw ZIP bytes are not returned in results.
- `preview` verifies the stored ZIP structure and central directory, unique safe
  names, manifest hashes/counts, raw record scope and image/audio headers. It
  verifies the opening project and original active participants through the
  read-only native metadata adapter. Missing/remote/foreign participants block
  restoration; do not create replacement chats or guess a destination.
- `apply` requires the preview's exact import ID, project ID, checksum, room name
  and `confirmed:true`. It restores only a missing, finished room. Existing room
  registration or history, another room for the same native project, unfinished
  work, active ownership/validation or incomplete setup block recovery. No merge,
  rollback, latest-record replacement or automatic job execution is provided.
- Restored records retain their message text/details, attachments, participant
  routes, roster revision and idempotency history. New requests are paused. The
  user checks the restored room, then explicitly resumes new requests if desired.
  Imported workspace paths do not grant filesystem authorization. The archive
  does not contain native chats, work-control/QA ledgers, usage sources or project
  source files. Existing local control/attempt and usage records stay untouched;
  missing measurements remain unavailable.

Staging and interrupted-apply journals live under `TEAM_ROOM_HOME/imports/`.
The registry is published after validated media and the paused room are saved.
After a crash, **Check earlier recovery → Continue checking** reopens that same
journal. An uncertain apply is reconciled only on another explicit confirmation.
Newer records are never overwritten. `list` reads only this opening chat's staged
imports; it does not enumerate chats or automatically resume uploads.

Closing, hiding, changing the selected room or tearing down the view invalidates
late callbacks. No later upload chunk, preview, host message or selection is
dispatched. A server write already accepted may finish; reopen the original
journal to inspect it rather than starting a replacement restore.

Unfinished or conflicting backups can still be read offline through the ZIP's
`index.html`. Soft-deleted rooms use **Archived rooms → Restore**, retaining their
existing records; importing a ZIP is not a substitute for that operation.
