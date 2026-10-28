# Native Windows database execution verification

On 2026-10-28, GitHub Actions run 40640401240 tested commit d04476a on windows-latest with an explicitly confirmed elevated orchestrator. It passed restricted fixture initialization, PostgreSQL startup through pg_ctl, authenticated SQL, reuse without stopping the owner process, waited fast shutdown, and restart with persisted data. Synthetic records only; no user backup/keys were uploaded.

Observed output:

```
Elevated orchestrator confirmed.
Restricted fixture initialization passed.
PASS: elevated Windows Node -> restricted PostgreSQL, authenticated query, reuse, fast stop, persisted restart.
```

Evidence: https://github.com/koharan18/blackperson/actions/runs/40640401240

The obsolete Limited S4U installer worker failed before reading its request; both ends could then block writing. The installer no longer uses that protocol. PostgreSQL's native Windows pg_ctl launcher creates a restricted process independently of the installer's token.

This test verifies the database execution path, not all owner-PC OS configuration. Certificate trust, actual firewall profile, Task Scheduler boot after sign-out, stable LAN address and staff-client access still need verification on the office PCs. The repair script removes only abandoned setup helpers after checking no PostgreSQL or helper child process is running; it does not remove user data or keys.
