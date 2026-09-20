# Release notes

## Unreleased

- Close the current delivery scope as a tested self-hosted release candidate with the bundled synthetic portal. Real external account integration is deferred; no additional provider is included.

- Fix MCP gateway URLs with a trailing slash producing a route-not-found response. The regression exercises both URL forms through the actual MCP and browser workflow.
- Make tests portable to a fresh checkout by using OS temporary directories and Playwright's artifact directory.
- Expand the disposable Compose check to enforce owner approval, denial and blocked access after revocation.
- Reorganize installation, MCP and troubleshooting instructions, and add a documentation index and development guide. Record the September 19 website, native and container verification with explicit real-service limitations.

## 0.1.0-rc.1

Initial self-hosted Broker core for a single owner, multiple accounts and multiple agents. Includes private enrollment, wrapped-key encrypted vault, owner administration, strict six-tool MCP bridge, authenticated gateway, trusted policy enforcement, single-use approvals, ephemeral browser sessions, fixed-destination networking, invoice retrieval, revocation, local audit/metrics, encrypted backup/restore, migration and deployment documentation.

The included adapter is **the bundled synthetic test portal only**. Real compatibility has not been implemented or inferred. The default installation does not enable fixture mode.

### Release blockers

- Owner must select a real invoice portal. Review official API/delegated-access options before implementing browser login.
- At least one real integration must be implemented and verified through privately enrolled, authorized access before calling the first usable release complete.
- A second owner-selected integration remains the next compatibility milestone.
- Private remote HTTPS deployment requires verification in the owner's network and certificate environment.
- No independent security audit or penetration test has been performed. Public repository visibility does not establish production security.
- Licensing and commercial distribution terms remain the owner's decision.

### Operational limitations

- Owner unlock is required after every restart. Lock cancels work and closes local sessions; remote logout is separately reported.
- No local QR decoding in this candidate. Use private base32 or otpauth URI enrollment.
- No external telemetry, scheduler, chatbot, cookie-export or arbitrary browser/fetch tools.
- Browser and vault share the trusted service boundary; host administrator compromise or a trusted worker compromise can expose secrets.
- Same-version restart/migration and encrypted recovery are tested. Cross-version database downgrade is not claimed tested because this is the first schema version.

See [verification evidence](docs/VERIFICATION.md) for exact checks and platform status.
