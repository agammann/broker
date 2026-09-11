# Compatibility matrix

| Adapter                          | Version      | Authentication                                  | Operation                      | Verification                                                                                          | Unattended status        |
| -------------------------------- | ------------ | ----------------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------- | ------------------------ |
| Bundled test portal              | 1.0.0        | Password + TOTP, expected username check        | Read synthetic invoice records | Actual bundled server and Chromium, not an external service; see verification date in VERIFICATION.md | Opt-in fixture mode only |
| First owner-selected real portal | Not selected | Investigate official API/delegated access first | Read invoices                  | Not implemented or tested                                                                             | Disabled / unavailable   |
| Second real portal               | Not selected | To be evaluated after first integration         | Read invoices                  | Not implemented or tested                                                                             | Disabled / unavailable   |

Fixture origins are exactly `http://127.0.0.1:<configured port>` for native tests or `http://test-portal:4313` on the isolated fixture Compose network. No redirects to another origin, WebSockets, service workers, popups or arbitrary browser commands are permitted. Required privileges: fixture user login and read-only access to its synthetic invoices. Known limits: one fixed portal layout, two synthetic invoices, 6/8 digit TOTP, SHA-1/256/512, 15–120 second periods, secrets of at least 128 bits, two-decimal monetary values. QR decoding is not implemented; private base32 or otpauth enrollment is supported.

## Add a real integration

1. Owner selects the exact portal and desired invoice workflow. Do not choose a service or assume compatibility on their behalf.
2. Review official API, delegated access, service-account and export options. Prefer a supported scoped API when it fits; do not force browser authentication into a service with a better supported delegation method.
3. Document privileges, identity check, login origins, all required network destinations, expected challenges and safe logout verification. Every external origin must use HTTPS. The initial proxy supports one exact origin; multi-origin services require an explicit versioned network policy extension and bypass tests, not a wildcard.
4. Implement bounded schemas and adapter-specific fixtures including wrong credentials, challenge handling, redirects, identity mismatch, changed markup, missing records, pagination and output validation.
5. Keep the adapter unavailable for unattended use until the owner privately enrolls secrets in Broker and low-volume authorized tests pass against the actual service. Never request secrets in chat.
6. Record actual service test date, adapter version, limitations, and evidence. A fixture pass is not an external service pass. After verified first integration, select a second compatibility milestone with the owner.

External adapters are intentionally absent from the registry. The normal configuration cannot enable a local exception for an arbitrary URL supplied by an agent.
