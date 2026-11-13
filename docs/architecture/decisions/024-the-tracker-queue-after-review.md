# 024 — The tracker's queue: refusals, bad batches, storage failures and its test database

Date: 2026-11-13. Step 2.12 review; carries out T-111, T-113, T-114 and T-127 in `apps/web/src/features/tracker`; decides T-236. Decided by the lead (technical).

## What

- **Only a game rule refuses a tap.** A refusal with the code `rule` is about the tap itself: it is kept as refused, never sent again, and the taps after it still go. Every other code (`session-not-held`, `game-not-live`, `not-allowed`, `unknown-game`) is about the request, not the tap: the tap stays **waiting** and the queue halts. After `resume` the waiting taps go out in order, none skipped. If another device took over, the tracker shows them as not saved (T6 §5) and calls `forget`; once nothing waiting is left, the halt clears by itself.
- **A batch the server cannot take as sent** (HTTP 400, 413, 422 and any other 4xx outside the next point) is not a halt. The transport reports `batch-refused`; the queue sends that batch's taps one at a time. The single tap still turned away is kept as refused with the code `rule` and the message `http-<status>`, so the scorekeeper is told, and the rest carry on.
- **Only 401, 403 and 404 halt the queue whole** (signed out, not allowed, no such game), as does a version the server no longer speaks (T-127). A halt is an answer: it clears the "unanswered since" clock and the failure count.
- **A storage failure is not the network.** The queue's status has `storageFailure` (a fixed code and when it began), separate from `unansweredSince`. It is set when adding, reading or settling fails for storage reasons, cleared by the next storage call that works, and the banner then says the device could not save, never that it is offline.
- **The count never shows fewer waiting than are held.** If a tap is stored but the read after it fails, `waiting` goes up by one by hand.
- **A command ID is held once on a device.** Adding an ID already held for the same game is ignored (`held`); one held for another game rejects with `command-id-in-other-game`, a bug in the caller, not shown as a storage failure.
- **Errors carry fixed codes, not sentences** (`QueueError`, `queueErrorCodes` in `queue-storage.ts`): the tracker picks the words from the message files (T-187). A refusal's `message` comes from the server and is for logs only; the tracker shows words chosen by its `code`.
- **The banner shows every count at once**: storage failed, waiting to send, not saved, joined on one line.
- **IndexedDB connection.** The storage lets go of its connection when another tab opens a newer version (`versionchange`) or the browser closes it (`close`), and opens it again on the next use. Opening handles `blocked` (a tab of an older version will not let go: rejects with `storage-blocked`, and the next use tries again; a connection that opens after being given up is closed at once). An older build opening a database a newer build has upgraded gets the browser's `VersionError`, reported as `storage-newer-version`: the tracker must say taps are not being kept and ask for a reload. Upgrades run as steps from the stored version to the current one, each given the upgrade's transaction to convert old rows.

## T-236: fake-indexeddb, for tests only

- **What:** `fake-indexeddb` 6.2.7, pinned, a dev dependency only. It is never imported by code that ships; only `indexeddb-queue-storage.test.ts` uses it.
- **Why (T-191):** the IndexedDB storage is the one the tracker uses in the browser, and without a stand-in it was tested nowhere in the gate. With it, the same storage contract tests that the in-memory storage passes run against the real IndexedDB code, plus its connection handling, in plain Node with no browser. It is the mainstream choice for this (an implementation of the IndexedDB standard in JavaScript, widely used with Vitest and Jest), small, and has no dependencies of its own.
- **Considered:** testing only in Playwright against a real browser (slow, outside the unit gate, and step 2.12 has no page yet); writing our own stand-in (more code to trust than the code under test).
- **Not covered by it:** each browser's own quirks (Safari's storage eviction, private windows). Those are checked on real devices (T-190).

## Stranded taps across releases

Taps held under a protocol version the server no longer accepts (two releases on, T-127) halt the queue with `version-refused`. They are not re-stamped with the new version: a tap's version is what it was made under, and re-sending it as another version could change what it means. The tracker shows them as not saved and drops them with `forget`.

## Revisit if

- The server starts sending refusal codes that are about one tap but are not game rules: add them to the "about the tap" list.
- A release changes the stored shape: add an upgrade step and a test that a database at the old version is read.
