# Official implementation references

Consulted during implementation on 2026-09-09 UTC (2026-09-08 Pacific). Package versions are authoritative in pnpm-lock.yaml; do not infer latest versions from this list later.

- Node release schedule and LTS: https://nodejs.org/en/about/previous-releases
- Node crypto / scrypt / authenticated encryption: https://nodejs.org/api/crypto.html
- Node SQLite: https://nodejs.org/api/sqlite.html
- Fastify validation and serialization: https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/
- Fastify static plugin: https://github.com/fastify/fastify-static
- Official MCP TypeScript SDK v1: https://ts.sdk.modelcontextprotocol.io/
- Playwright BrowserContext network routing: https://playwright.dev/docs/api/class-browsercontext
- Playwright WebSocketRoute: https://playwright.dev/docs/api/class-websocketroute
- Playwright Docker / sandbox guidance: https://playwright.dev/docs/docker
- otplib: https://otplib.yeojz.dev/
- RFC 6238: https://www.rfc-editor.org/rfc/rfc6238
- Vite: https://vite.dev/guide/
- Tailwind Vite integration: https://tailwindcss.com/docs/installation/using-vite

An initial audit found vulnerabilities in @fastify/static 8.3.0. The dependency was replaced with 10.1.3 before release checks. See final audit outcome in VERIFICATION.md.
