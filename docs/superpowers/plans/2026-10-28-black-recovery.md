# BLACK Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild a Windows-runnable Korean BLACK console compatible with the surviving backup.
**Architecture:** React SPA, Express authenticated API, original PostgreSQL tables and separate session storage. Embedded PostgreSQL for a repeatable local runtime, explicit safe restore and backup tools.
**Tech Stack:** Node 22+, React, Vite, Express, pg, embedded-postgres 18.4, ExcelJS.
**Spec:** docs/superpowers/specs/2026-10-28-black-recovery-design.md

## Global Constraints
- Never commit backups, env credentials, real records or logs containing them.
- Preserve original backup files and IDs; restore only to an empty dedicated database.
- No claim of original visual fidelity beyond the limited text available.
- No additional worktree; current cloud checkout is isolated and on work.
- Source implementation is authorized by the user's new request, superseding onboarding-only source protection for this task.

## Review Focus
- Legacy encrypted phone fields must decrypt correctly, not be silently treated as plaintext.
- Partial-name matches and deleted people must not become exact matches.
- Unauthenticated requests, CSRF and staff privilege escalation must fail.
- Bulk import validation must happen before writes; failed batches must not partially persist.
- Restore must reject a populated DB and backups must be independently restorable.

### Task 1: Data and recovery
Files: server/runtime.mjs, server/domain.mjs, scripts/restore.mjs, scripts/backup.mjs, tests/domain.test.mjs, tests/recovery.test.mjs.
Interfaces: startDatabase() -> {pool, stop, binary}; normalizePhone, encryptPhone, decryptPhone, classifyApplicants.
- [ ] Write failing tests for phone validation, authenticated encryption and matching classifications; run npm test to observe failure.
- [ ] Implement runtime and helpers, install packages, restore original dump in an empty local DB, verify aggregate counts and key compatibility.
- [ ] Run domain and recovery tests; verify second restore is rejected.

### Task 2: Authenticated API
Files: server/app.mjs, server/index.mjs, tests/api.test.mjs.
Interfaces: createApp({pool, config}) -> Express app; API /api/session, /api/login, /api/logout, /api/people, /api/compare, /api/bulk, /api/dashboard, /api/users, /api/audit.
- [ ] Write integration tests for authentication, CSRF, staff/admin permissions, CRUD audit and atomic duplicate batch rejection; run failing suite.
- [ ] Implement API with validation, session invalidation, parameterized SQL, transactions, encryption and audit.
- [ ] Run integration suite against a disposable DB; verify existing account hashes separately without printing credentials.

### Task 3: UI and Windows handoff
Files: src/App.jsx, src/styles.css, src/roster.mjs, index.html, vite.config.mjs, scripts/dev.mjs, windows/*.cmd, README.md, tests/roster.test.mjs, tests/ui.spec.mjs.
Interfaces: Korean screens matching confirmed workflows; client API sends CSRF token and credentials.
- [ ] Write failing roster parser and UI workflow tests including XLSX download, validation, logout, mobile navigation.
- [ ] Implement dark sidebar/light workspace, dashboard, searchable editable list, form, bulk/compare, results, audit and user management.
- [ ] Build and run browser tests, create source-only ZIP and concise Windows instructions.
- [ ] Fresh-context review then fix material findings and rerun full tests; save reusable install/start configuration for actual runtime.
