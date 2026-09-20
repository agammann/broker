# MCP bridge

[Documentation index](README.md) · [Installation and test portal](INSTALL.md)

Complete account enrollment, connection verification, agent registration, and a grant before running the client. The bridge runs on the agent side; it connects to the gateway, not the owner dashboard or public website.

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

The executable `src/mcp/client.ts` uses the official MCP Client and StdioClientTransport. After building and starting Broker, its gateway, and the test portal, open another PowerShell terminal in the repository directory. Replace the credential path below with the private file downloaded during agent registration. The file must contain only that agent's credential, not JSON.

First list this agent's available accounts:

```powershell
$env:BROKER_AGENT_CREDENTIAL_FILE = 'C:\private\invoice-reader.txt'
$env:BROKER_GATEWAY_URL = 'http://127.0.0.1:4311'
Remove-Item Env:BROKER_ACCOUNT_ID -ErrorAction SilentlyContinue
pnpm client
```

Copy the desired account's `id` from the result, or from the account row in the owner dashboard. An empty list means this agent currently has no connected, authorized account. Check the grant, its start/expiration, the agent expiration, and account verification.

Then request the synthetic invoices, replacing `ACCOUNT_UUID_FROM_DASHBOARD`:

```powershell
$env:BROKER_AGENT_CREDENTIAL_FILE = 'C:\private\invoice-reader.txt'
$env:BROKER_GATEWAY_URL = 'http://127.0.0.1:4311'
$env:BROKER_ACCOUNT_ID = 'ACCOUNT_UUID_FROM_DASHBOARD'
$env:BROKER_FROM = '2026-01-01'
$env:BROKER_TO = '2026-12-31'
pnpm client
```

If the grant needs approval, approve the exact request in the owner dashboard while the client polls. Without an account ID the client only lists accounts. It prints returned invoice data to its own console by design; Broker audit records exclude invoice contents. Do not pipe production invoices into public CI logs.

The client waits up to five minutes for approval/authentication. With the bundled test portal and the dates above, expect two synthetic invoice records dated January 15 and February 15, 2026, then a closed session. These invoice dates are independent of the grant's current access window. If approval times out, run the client again and approve the new request.

## Configure an MCP host

Use this entry in a host that supports stdio MCP configuration. Replace both filesystem paths with absolute paths on the machine running the host. Host-specific settings locations vary.

```json
{
  "mcpServers": {
    "broker": {
      "command": "node",
      "args": ["C:\\path\\to\\broker\\dist\\mcp\\bridge.js"],
      "env": {
        "BROKER_AGENT_CREDENTIAL_FILE": "C:\\private\\invoice-reader.txt",
        "BROKER_GATEWAY_URL": "http://127.0.0.1:4311"
      }
    }
  }
}
```

Restart or reconnect the host after saving its configuration. Confirm it discovers the six tools listed above. The generic configuration is not a claim that every MCP host has been tested. On another machine, loopback points to that machine; follow the [private HTTPS deployment guidance](INSTALL.md#private-remote-https) before using a remote gateway.

Store agent credentials outside source control. The bridge's assigned bearer credential is the agent's own authority; a local agent able to read its credential file can copy that authority until it expires or is rotated. This does not authorize owner operations or expose enrolled account secrets.
