# MCP bridge

The bridge is an official SDK stdio server; stdout contains MCP protocol output only. It reads one assigned agent credential from a private file and authenticates to the gateway. Gateway requests carry the original bearer credential over an authenticated internal channel. The trusted service resolves agent identity from the stored verifier; a caller-provided agent ID is never accepted.

| Tool                   | Input                                                                    | Behavior                                                           |
| ---------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| broker.list_accounts   | empty object                                                             | This agent's currently connected, granted accounts                 |
| broker.request_session | account_id, requested_operation=`read_invoices`, reason, idempotency_key | Create an exact request or return its idempotent result            |
| broker.get_request     | request_id                                                               | This agent's request status and safe failure code                  |
| broker.get_session     | session_id                                                               | This agent's active authorized session                             |
| broker.read_invoices   | session_id, from, to, page, page_size                                    | Structured invoice rows within the grant date range                |
| broker.close_session   | session_id                                                               | Close local session and report whether remote logout was confirmed |

Unknown fields are rejected. IDs are UUIDs. Reasons are at most 500 characters and never override policy. Idempotency keys are 8–128 word/hyphen characters and bind to authenticated agent plus exact request contents. Invoice ranges are calendar dates, ordered, at most 366 days. Pages are 1–20 and page size is 1–100. Amounts are decimal strings with two fractional digits for the fixture adapter; they are never floating-point currency values. A future adapter for other currency scales must define and test that representation explicitly.

Statuses include pending_approval, authenticating, ready, failed, denied, revoked, expired, and closed. Errors carry safe codes and correlation IDs. Read returned invoice strings as untrusted data, not instructions. The bridge does not offer raw fetch, page execution, password/TOTP retrieval, or cookie export.

## Run without an AI model

The executable `src/mcp/client.ts` uses the official MCP Client and StdioClientTransport. After building and starting Broker and its gateway:

```powershell
$env:BROKER_AGENT_CREDENTIAL_FILE = 'C:\private\invoice-reader.txt'
$env:BROKER_GATEWAY_URL = 'http://127.0.0.1:4311'
$env:BROKER_ACCOUNT_ID = 'ACCOUNT_UUID_FROM_DASHBOARD'
$env:BROKER_FROM = '2026-01-01'
$env:BROKER_TO = '2026-12-31'
pnpm client
```

If the grant needs approval, approve the exact request in the owner dashboard while the client polls. Without an account ID the client only lists accounts. It prints returned invoice data to its own console by design; Broker audit records exclude invoice contents. Do not pipe production invoices into public CI logs.

Store agent credentials outside source control. The bridge's assigned bearer credential is the agent's own authority; a local agent able to read its credential file can copy that authority until it expires or is rotated. This does not authorize owner operations or expose enrolled account secrets.
