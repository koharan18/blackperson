# BLACK office operation plan

User requests source backup verification and restoration of the former office workflow: https://GB-8234 on the owner's Windows PC, usable when the PC is powered on, five named staff accounts with their supplied shared password. User has authorized configuration, but this task can execute only in cloud Linux; Windows changes must be applied by an explicit local installer.

## Constraints
- Preserve all existing records, encryption keys, administrators and unrelated accounts.
- Source repository koharan18/blackperson was verified empty with git ls-remote. Native Git HTTPS auth and push dry-run work; GitHub API metadata is forbidden, so visibility is unknown. Only sanitized source/history may be pushed; never records, env values, password seeds, TLS keys, dumps or logs.
- Password is entered once using Windows SecureString, passed to Node via stdin, stored only as bcrypt hashes. Never embed the supplied password in tracked files or packages.
- Existing five staff emails are updated only as requested; new accounts default USER, existing roles stay unchanged. Sessions for reset staff accounts are invalidated.
- Use existing installed directory. No live database file copy, reset, migration or automatic reimport.
- Server task runs AtStartup under the current Windows account using S4U, without requiring interactive sign-in or storing a Windows password. Actual Windows execution must be verified on the PC; no Linux evidence proves scheduled-task readiness.
- HTTPS 443, certificate for gb-8234, firewall Private/Domain + LocalSubnet only. Client installer receives only public certificate + server IPv4 + SHA256, adds a dedicated hosts block, imports that exact public certificate. No computer rename, VPN or router port forwarding.
- DNS/IP stability still needs a router DHCP reservation; fixed hosts entries require regeneration if server IP changes.
- Daily encrypted logical backup in a separate operator folder, with necessary key/config backups restricted to operator/SYSTEM/admins. Local backup is not an off-device backup. No database upload to GitHub.

## Tasks
- [x] Test-first staff upsert and audit/session behavior against a temporary DB.
- [x] Implement authenticated local IPC shutdown so scheduled operation can stop gracefully.
- [x] Refactor backup into reusable tested logic with explicit output directory and required key checks before starting DB or writing output.
- [x] Build Windows server bootstrap: preflight existing app and stopped ports, safe source update, staff setup, HTTPS/trust, hosts, firewall, AC sleep settings, boot/daily tasks, readiness request.
- [x] Generate staff client package at runtime using actual IPv4 and public certificate, never private credentials.
- [x] Run cross-platform DB/backup/IPC regressions and existing browser/build checks; static-review Windows scripts and package manifests.
- [x] Audit tracked history for secrets and personal data, push source to existing empty GitHub repo, verify exact remote commit.
- [x] Deliver operator ZIP with clear owner-PC and staff-PC steps; distinguish tested source/logic from Windows actions awaiting user execution.

## Verification
23 Node tests, production build and 7 browser tests passed. Fresh review fixed malformed local IPC input and restored prior backup-task enablement on installation failure, with explicit server recovery instructions. Client packaging uses five explicit public files. Windows installation, S4U boot and cross-PC trust remain unexecuted and must be verified locally. Source history was audited against private key/DB values and supplied roster phones before publication; Git remote verification is performed as the final publication step.
