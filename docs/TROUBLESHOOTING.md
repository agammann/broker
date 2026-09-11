# Troubleshooting

| Symptom / code                              | Action                                                                                                                                                       |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| setup_required                              | Run private initialization and finish the owner setup form.                                                                                                  |
| invalid_setup_token                         | Read the setup file privately; verify you are using this installation's token.                                                                               |
| owner_authentication_required               | Sign in again. Owner sessions expire after one hour or another login.                                                                                        |
| csrf_failed / invalid_origin / invalid_host | Reload the exact configured owner URL. Check HTTPS proxy Host preservation and configured origin. Do not relax validation to wildcards.                      |
| incorrect_passphrase                        | Use the current vault passphrase; backups may use an older one. Broker cannot recover it.                                                                    |
| vault_locked                                | Unlock in the owner dashboard. Vault lock stops unattended access and cancels pending work.                                                                  |
| invalid_totp                                | Use canonical base32 or a TOTP otpauth URI, at least 128 secret bits; 6/8 digits, SHA1/SHA256/SHA512, period 15–120. HOTP is unsupported.                    |
| account_not_connected                       | Test the saved account identity; credential replacement and restore invalidate verification.                                                                 |
| incorrect_credentials                       | Check privately entered username/password and that the TOTP secret is enrolled at the destination. Avoid repeated attempts.                                  |
| human_action_required                       | Complete the service's supported human flow. Do not circumvent CAPTCHA, push approval or security-key requirements.                                          |
| account_lockout                             | Stop automated login attempts and use the destination's official recovery process.                                                                           |
| changed_website_layout                      | Adapter needs review against the actual current page; keep account disabled until reverified.                                                                |
| identity_verification_failed                | The authenticated account did not match enrollment. Close the session and investigate account selection.                                                     |
| timeout                                     | Check service availability, host time and required network destinations. Broker does not broadly guess adjacent TOTP codes.                                  |
| destination_blocked / unexpected_navigation | The page tried an unapproved destination. Review adapter origins; never add arbitrary agent-provided URLs.                                                   |
| invalid_agent                               | Check credential file, expiration and rotation/revocation. Agent UUIDs are not credentials.                                                                  |
| permission_denied / parameters_denied       | Owner must grant the exact account/operation/date range; reasons cannot override policy.                                                                     |
| concurrency_limited / busy / queue_full     | Close unused sessions or wait for bounded work to finish; do not retry in a tight loop.                                                                      |
| idempotency_conflict                        | A key was reused with different request contents. Preserve exact contents for retry or use a new key.                                                        |
| approval_expired_or_consumed                | Request has expired, been decided, or invalidated by policy/credentials. Request a new session.                                                              |
| service_restarted / operation_cancelled     | Service restart, lock, deadline or revocation interrupted work. Recheck current access before retrying.                                                      |
| local_only / remote logout not confirmed    | Local access ended; destination session invalidation was not confirmed. Use the service's own session-management controls if necessary.                      |
| adapter_failure                             | Inspect local safe activity categories; do not enable credential-bearing traces or raw page logging. Confirm the installed browser and host sandbox support. |

Check OS time synchronization for TOTP. Broker waits if the current code is near expiry or was recently used by that adapter; the fixture server rejects replay. No test portal recording is an acceptable substitute for real service verification.

PowerShell users with package cache access errors can place `XDG_CACHE_HOME` and pnpm's `--store-dir` inside an owner-controlled workspace directory. Do not commit caches or `.secrets`. Docker failures should be diagnosed with `docker compose ps` and health status; avoid sharing environment dumps or volume contents.
