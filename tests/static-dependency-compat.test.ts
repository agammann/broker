import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, sep } from "node:path";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { expect, it } from "vitest";

async function removeFixture(fixture: string) {
  const base = await realpath(tmpdir());
  const target = await realpath(fixture);
  const rel = relative(base, target);
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error("Refusing to remove fixture outside the temporary directory");
  }
  await rm(target, { recursive: true });
}

for (const wildcard of [true, false]) {
  it(`serves bounded static fixtures with wildcard=${wildcard}`, async () => {
    const fixture = await mkdtemp(join(tmpdir(), "broker-static-compat-"));
    const root = join(fixture, "public");
    await mkdir(join(root, "nested"), { recursive: true });
    await writeFile(join(root, "nested", "hello.txt"), "synthetic public file");
    await writeFile(join(fixture, "outside.txt"), "synthetic private sentinel");
    const app = Fastify({ logger: false });
    try {
      await app.register(fastifyStatic, { root, wildcard });
      const get = await app.inject({ method: "GET", url: "/nested/hello.txt" });
      expect(get.statusCode).toBe(200);
      expect(get.body).toBe("synthetic public file");
      expect((await app.inject({ method: "HEAD", url: "/nested/hello.txt" })).statusCode).toBe(200);
      expect((await app.inject({ method: "GET", url: "/missing.txt" })).statusCode).toBe(404);
      const traversal = await app.inject({ method: "GET", url: "/..%2Foutside.txt" });
      expect(traversal.statusCode).toBeGreaterThanOrEqual(400);
      expect(traversal.body).not.toContain("synthetic private sentinel");
    } finally {
      await app.close();
      await removeFixture(fixture);
    }
  });
}

it("preserves indexed, ignored, and dotfile routes with explicit glob options", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "broker-static-options-"));
  const root = join(fixture, "public");
  await mkdir(join(root, "nested"), { recursive: true });
  await writeFile(join(root, "nested", "index.html"), "synthetic index");
  await writeFile(join(root, ".visible.txt"), "synthetic dotfile");
  await writeFile(join(root, "ignored.txt"), "synthetic ignored file");
  const app = Fastify({ logger: false });
  try {
    await app.register(fastifyStatic, {
      root,
      wildcard: false,
      serveDotFiles: true,
      globIgnore: ["**/ignored.txt"],
    });
    const index = await app.inject({ method: "GET", url: "/nested/" });
    expect(index.statusCode).toBe(200);
    expect(index.body).toBe("synthetic index");
    expect((await app.inject({ method: "GET", url: "/.visible.txt" })).body).toBe("synthetic dotfile");
    expect((await app.inject({ method: "GET", url: "/ignored.txt" })).statusCode).toBe(404);
  } finally {
    await app.close();
    await removeFixture(fixture);
  }
});
