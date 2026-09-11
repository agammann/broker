import type { BrowserContext } from "playwright";
import { allowedUrl, type Destination } from "./network.js";
const methods: Record<string, string[]> = {
  "/login": ["GET", "POST"],
  "/challenge": ["GET", "POST"],
  "/invoices": ["GET"],
  "/logout": ["POST"],
};
export async function restrictFixtureContext(
  context: BrowserContext,
  destination: Destination,
) {
  await context.route("**/*", (route) =>
    allowedUrl(route.request().url(), destination) &&
    methods[new URL(route.request().url()).pathname]?.includes(
      route.request().method(),
    )
      ? route.continue()
      : route.abort("blockedbyclient"),
  );
  await context.routeWebSocket("**/*", (ws) => ws.close());
  let primary = false;
  context.on("page", (page) => {
    if (primary) void page.close();
    else primary = true;
  });
}
