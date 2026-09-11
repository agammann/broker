import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
const paths = execFileSync(
  "git",
  ["diff", "--cached", "--name-only", "--diff-filter=ACM"],
  { encoding: "utf8" },
)
  .trim()
  .split("\n")
  .filter(Boolean);
const needles = [];
for (const name of ["setup", "internal"])
  if (existsSync(".secrets/" + name))
    needles.push(readFileSync(".secrets/" + name, "utf8").trim());
if (existsSync(".secrets/fixture-users.json"))
  for (const u of JSON.parse(
    readFileSync(".secrets/fixture-users.json", "utf8"),
  ))
    needles.push(u.password, u.totp.secret);
let failed = false;
for (const path of paths) {
  if (
    /(^|\/)(\.secrets|data|node_modules|test-results|playwright-report)(\/|$)|\.db(?:-|$)|\.backup$|\.env$/.test(
      path,
    )
  ) {
    console.error("Forbidden staged path: " + path);
    failed = true;
    continue;
  }
  const data = execFileSync("git", ["show", ":" + path], {
    maxBuffer: 10 * 1024 * 1024,
  }).toString();
  if (
    needles.some((s) => s.length >= 16 && data.includes(s)) ||
    /(gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|AKIA[A-Z0-9]{16}|-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----)/.test(
      data,
    )
  ) {
    console.error("Secret pattern in staged file: " + path);
    failed = true;
  }
}
if (failed) process.exit(1);
console.log(
  `PASS: ${paths.length} staged files checked; no runtime files or known generated secrets staged.`,
);
