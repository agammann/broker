import http from "node:http";
import net from "node:net";
import { lookup } from "node:dns/promises";
import ipaddr from "ipaddr.js";
import { BrokerError, requireThat } from "../core/errors.js";
export type Destination = { origin: string; fixture?: boolean };
export function publicAddress(ip: string) {
  try {
    const p = ipaddr.process(ip);
    return p.range() === "unicast";
  } catch {
    return false;
  }
}
export function allowedUrl(raw: string, d: Destination) {
  try {
    const u = new URL(raw),
      base = new URL(d.origin);
    return (
      !u.username &&
      !u.password &&
      u.origin === base.origin &&
      (u.protocol === "https:" ||
        (d.fixture === true &&
          u.protocol === "http:" &&
          (u.hostname === "127.0.0.1" || u.hostname === "test-portal")))
    );
  } catch {
    return false;
  }
}
export async function resolveDestination(d: Destination) {
  const u = new URL(d.origin);
  requireThat(allowedUrl(d.origin, d), "destination_blocked");
  const rows = await lookup(u.hostname, { all: true, verbatim: true });
  requireThat(rows.length > 0, "destination_blocked");
  const fixture =
    d.fixture && (u.hostname === "127.0.0.1" || u.hostname === "test-portal");
  requireThat(
    rows.every(
      (r) =>
        publicAddress(r.address) ||
        (fixture &&
          (r.address === "127.0.0.1" ||
            (u.hostname === "test-portal" &&
              ipaddr.parse(r.address).range() === "private"))),
    ),
    "destination_blocked",
  );
  return rows[0];
}
// One fixed origin per proxy. DNS is resolved and checked for every connection,
// then the socket connects to that exact IP; the browser still validates TLS.
export async function createEgress(d: Destination) {
  const sockets = new Set<net.Socket>();
  const track = (s: net.Socket) => {
    sockets.add(s);
    s.once("close", () => sockets.delete(s));
    s.on("error", () => s.destroy());
    s.setTimeout(45000, () => s.destroy());
    return s;
  };
  const server = http.createServer(async (req, res) => {
    try {
      requireThat(
        d.fixture && allowedUrl(req.url ?? "", d),
        "destination_blocked",
      );
      const u = new URL(req.url!),
        address = await resolveDestination(d);
      const upstream = http.request(
        {
          hostname: address.address,
          port: u.port || 80,
          path: u.pathname + u.search,
          method: req.method,
          headers: { ...req.headers, host: u.host, connection: "close" },
        },
        (r) => {
          res.writeHead(r.statusCode ?? 502, r.headers);
          r.pipe(res);
        },
      );
      upstream.on("socket", track);
      upstream.on("error", () => {
        if (!res.headersSent) res.writeHead(502);
        res.end();
      });
      req.pipe(upstream);
    } catch {
      res.writeHead(403);
      res.end();
    }
  });
  server.on("connection", track);
  server.on("connect", (req, client, head) => {
    void (async () => {
      try {
        const u = new URL(d.origin);
        requireThat(
          u.protocol === "https:" &&
            req.url === `${u.hostname}:${u.port || 443}`,
          "destination_blocked",
        );
        const a = await resolveDestination(d),
          upstream = track(net.connect(Number(u.port || 443), a.address));
        upstream.once("connect", () => {
          client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
          if (head.length) upstream.write(head);
          client.pipe(upstream);
          upstream.pipe(client);
        });
      } catch {
        client.end("HTTP/1.1 403 Forbidden\r\n\r\n");
      }
    })();
  });
  server.on("upgrade", (_r, s) => s.destroy());
  await new Promise<void>((r, j) => {
    server.once("error", j);
    server.listen(0, "127.0.0.1", r);
  });
  return {
    url: `http://127.0.0.1:${(server.address() as net.AddressInfo).port}`,
    close: async () => {
      for (const s of sockets) s.destroy();
      await new Promise<void>((r) => server.close(() => r()));
    },
  };
}
export function assertDestination(raw: string, d: Destination) {
  if (!allowedUrl(raw, d)) throw new BrokerError("unexpected_navigation");
}
