# Local secret hints and sharing copies

Meeting messages and draft text are checked locally for selected API/access-token
patterns, private-key blocks and explicit credential assignments. Hints appear
only in the UI. **Continue ordinary work, posting and director completion.** A
hint is not a blocker, question, authorization decision or reason to wake any
participant. Do not add acknowledgments, extra reads, approval turns, resends or
an AI classifier. Existing permission, ownership and QA gates still apply.

The detector returns positions/types, never matched values. The warning text
contains no excerpts or token suffixes. The original message, details and media
remain unchanged and visible; this does not remove a value already sent to a
model. The detector does not inspect image/audio contents, embedded metadata,
other AI tools, workspace files or private data outside the meeting text. It can
miss secrets and flag examples. No required setup, popup or new timer is added.

For user-requested sharing, use Menu → Create sharing ZIP. Mask suspected secrets
is selected by default; the user can choose to keep original text in this copy.
`room_export(create, format="share", redact=true|false)` writes a separate local
ZIP with reading documents and unchanged attachments. Selected text in message
bodies, details, captions and display names is masked with `[REDACTED]` when
enabled. Counts are informational; review the copy before sharing. No upload is
performed. Other sensitive information, including names, is not automatically
anonymized unless it matches a supported secret pattern.

Sharing ZIPs omit `project.json` and `room.json`, are marked `purpose="share"`
and cannot restore a room. Original ZIP backups remain exact private recovery
copies and may contain secrets; never treat them as masked sharing copies.

The same export ID, format and choice return the same saved archive; changing
the choice needs a new export ID. Download with the saved format. The UI binds
the choice to each explicit operation and discards late results after close,
project change, hidden state or teardown. Only explicit user actions create or
download files. None of this invokes AI; ordinary instruction context still has
normal token overhead.
