# Security

## Supported release

Version 0.5.x is an early preview. Windows behavior has been exercised locally;
Linux is included in CI and needs validation on the intended server.

## Trust model

This is a single-owner desktop administration tool, not a multi-tenant service.
Launch profiles execute commands with the OS permissions of the owner.
Treat profiles, the data directory and the SSH account as trusted configuration.

- No local HTTP listener is required.
- Optional web access binds loopback by default and requires a separate random access
  key. The API uses expiring HttpOnly/SameSite cookies, Origin/custom-header checks,
  request limits and login throttling. Bot files, secrets and databases are not static assets.
- Web HTTP does not implement TLS itself. Use a preserving-Host HTTPS proxy or SSH
  tunnel for untrusted networks. A web key grants owner process-control privileges.
- Process control checks PID, creation time, executable and owner.
- Graceful stop is attempted before a separately confirmed forced stop.
- Electron renderer code has no Node integration; IPC methods are explicit.
- Raw Telegram updates, message bodies and bot tokens are not stored in telemetry.
- Opt-in application logs contain free-form text from the owner's existing logger.
  Known tokens and common secret assignments are redacted before storage; arbitrary
  personal data or unknown secrets in log messages cannot be identified reliably.
- Project discovery parses Python with AST without importing or executing it and
  checks only the existence of .env. Registration does not start a process.
- User identifiers are pseudonymized per bot, not claimed to be anonymous.
- Keep databases, environment files and private keys outside Git.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting from the repository's Security tab
when the owner has enabled it. Otherwise contact the repository owner privately
through their public GitHub contact details before publishing exploit details.
Never attach credentials, real chat content, runtime databases or SSH keys to an issue.

## Release verification

Release archives include SHA256 checksums. The current desktop build is unsigned;
code signing is a future release task. Upstream Electron licenses must remain with
the packaged application. See [third-party notices](THIRD_PARTY_NOTICES.md).
