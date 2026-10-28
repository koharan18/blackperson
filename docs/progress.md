# BLACK recovery progress

User authorized rebuilding on 2026-10-28 and asked to proceed using sensible defaults. Do not ask again for unavailable source or backups.
Ruling: use existing isolated work checkout; no extra worktree.
Ruling: proceed directly with documented scope; user explicitly requested rebuilding rather than more design questions.
Ruling: original images and early chat cannot be retrieved through the available read_thread response. Build confirmed text workflows, label styling as reconstruction.
Ruling: use npm cache at /workspace/.npm-cache because default home cache is unwritable.
Pre-flight: runtime.pool feeds API, API shapes feed React; original quoted PostgreSQL field names remain consistent across restore/API.

Task 1: complete. Original custom archive 1.16 data-only reader matches independent pgdumplib across every field of all four tables. SHA256 and counts 2/3/126 verified. Both initial credential hashes verified without output. All 3 phones authenticated and decrypted with original key. Encrypted backup roundtrip verified on an independent temporary DB. Existing DB overwrite rejected.
Task 2: complete. PostgreSQL integration tests cover login, auth/CSRF, CRUD/audit, optimistic update, deleted-match exclusion, rollback on duplicate bulk, disable session, last-admin self-protection, expired-session cleanup.
Task 3: complete. Production build passes; browser main flow, stale-upload regression and CSV/bulk persistence pass (3/3). API/domain/recovery/runtime suite passes (13/13). ZIP extracted to a new directory, npm ci --omit=dev executed, original data restored, actual existing account authenticated, dashboard and built UI served, live backup completed without stopping the server. Startup and clean SIGTERM shutdown returned exit 0 with no stderr. Windows execution remains unverified.
Final review: fresh reviewer recovery_review found stale async roster input and disabled session pruning. Both fixed. Regression tests failed first then passed. No unresolved Critical/Important findings from review. Windows execution remains unverified on this Linux machine.
Ruling: browser CDN is denied by network policy; use npm-distributed @sparticuz/chromium in Linux test tooling without weakening TLS verification. It is a dev dependency and excluded from Windows production installation.
Ruling: use authenticated data-only archive import rather than executing dump SQL; upstream embedded PostgreSQL package lacks pg_restore. Independent reader confirmed exact data compatibility. Only known BLACK tables/columns are accepted.
Ruling: preserve original timestamps as UTC across Windows/Linux, consistent with Prisma's storage convention.
Final: fixed shutdown race with embedded PostgreSQL's signal hook — subprocess regression failed before handling asynchronous idle-pool errors, passed after; never prints database client objects. Close session pruning on application shutdown.
Configuration: install_script and start_skill saved as a draft; not published. Future-task restoration has not been tested. Current source runtime starts on loopback 8234 and GET /api/session and /login return 200.
Packaging: source and built UI only; private files, user records, database files and secret values excluded and scanned. Original backups remain unchanged. Synthetic-account screenshots are included in docs/images.
