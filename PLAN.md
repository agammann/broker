# Broker implementation checklist

- [x] Inspect workspace, instructions, runtime, official documentation and package registry.
- [x] Establish dashboard visual direction and service boundaries.
- [x] Implement encrypted vault, migrations, private owner setup and maintenance.
- [x] Implement authenticated agents, grants, exact approvals, sessions and revocation.
- [x] Implement restricted browser networking, fixture adapter and TOTP test portal.
- [x] Implement six strict MCP tools and a model-free client.
- [x] Connect responsive owner dashboard to real backend state.
- [x] Run security regression, integration, MCP and browser end-to-end tests.
- [x] Prepare installation, recovery, deployment and release evidence.
- [ ] Owner selects real portal; investigate supported delegation/API first.
- [ ] Privately enroll and verify selected real integration. External dependency.

## Decisions

Single trusted Fastify process owns SQLite, keys, policy and ephemeral browser contexts. Separate Fastify gateway forwards the agent bearer credential over an authenticated internal channel; only the trusted service resolves identity. Stdio bridge holds only its agent credential. Owner HTTP listener is separate from internal listener. Only fixture adapter is installed initially; no external compatibility is implied.

The application source is public at [agammann/broker](https://github.com/agammann/broker). The [public visitor website](https://broker-access.alx21.chatgpt.site/) is hosted separately on OpenAI Sites and includes a fictional browser simulation. Private customer vaults are not hosted there. Native Windows and Docker verification results are recorded in [verification evidence](docs/VERIFICATION.md).

## UI tokens

White content; gray #f5f6f8 navigation; ink #18232d; teal #087f72; amber vault notice; thin gray dividers; 8px corners; system sans-serif. 225px sidebar, table-focused account access and activity, three summary counts. Required forms extend this visual system; no fabricated records.
