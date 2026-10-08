import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
const directory = resolve(
  process.argv.slice(2).find((value) => value !== "--") ||
    "consumer-output/fresh",
);
const source = execFileSync(
  process.env.BROKER_PYTHON || "python",
  ["scripts/unpack-release.py", directory],
  { encoding: "utf8", windowsHide: true },
).trim();
const pnpmPath = process.env.BROKER_PNPM || process.env.npm_execpath;
if (!pnpmPath) throw Error("Run this check using pnpm test:consumer.");
const pnpm = (args) =>
  execFileSync(process.execPath, [pnpmPath, ...args], {
    cwd: source,
    stdio: "inherit",
    windowsHide: true,
  });
const version = execFileSync(process.execPath, [pnpmPath, "--version"], {
  encoding: "utf8",
  windowsHide: true,
}).trim();
if (version !== "11.19.0") throw Error("Consumer checks require pnpm 11.19.0.");
pnpm(["install", "--frozen-lockfile"]);
pnpm(["exec", "playwright", "install", "chromium"]);
pnpm(["check"]);
console.log(
  "Fresh Broker source consumer installed and passed lint, types, real stdio MCP/Chromium integration, production build and owner browser recovery workflow. No existing vault or installed service changed.",
);
