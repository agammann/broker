import { test, expect } from "@playwright/test";
import { fixture, ownerPassword, passphrase } from "../helpers.js";
test("fresh installation: private setup, dashboard, unlock, enroll, verify, grant, revoke and lock", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Keep control of account access" }),
  ).toBeVisible();
  await page
    .getByLabel("Private setup token")
    .fill("fixture-setup-token-not-a-real-secret-00000000000");
  await page.getByLabel("Owner password", { exact: true }).fill(ownerPassword);
  await page.getByLabel("Vault passphrase", { exact: true }).fill(passphrase);
  await page.getByLabel("Confirm vault passphrase").fill(passphrase);
  await page.getByRole("button", { name: "Create owner account" }).click();
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1536, height: 1024 });
  await page.screenshot({
    path: testInfo.outputPath("broker-overview.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Unlock vault", exact: true }).click();
  await page.getByLabel("Vault passphrase", { exact: true }).fill(passphrase);
  await page
    .locator("form")
    .filter({ has: page.getByLabel("Vault passphrase", { exact: true }) })
    .getByRole("button", { name: "Unlock vault", exact: true })
    .click();
  await expect(page.getByText("◉ Vault unlocked")).toBeVisible();
  await page.getByRole("button", { name: "Accounts", exact: true }).click();
  await page.getByLabel("Account label").fill("Synthetic test account");
  await page.getByLabel("Account username").fill(fixture.username);
  await page.getByLabel("Account password").fill(fixture.password);
  await page
    .getByLabel("Authenticator secret or otpauth URI")
    .fill(fixture.totp);
  await page.getByRole("button", { name: "Save account privately" }).click();
  await expect(page.getByText("unverified", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Test connection" }).click();
  await expect(page.getByText("connected", { exact: true })).toBeVisible({
    timeout: 60000,
  });
  await expect(page.getByLabel("Account password")).toHaveValue("");
  await page
    .getByRole("button", { name: "Agents & grants", exact: true })
    .click();
  await page.getByLabel("Agent name").fill("Fixture invoice reader");
  await page
    .getByLabel("Agent expires", { exact: true })
    .fill("2027-01-01T00:00");
  await page
    .getByRole("button", { name: "Register agent", exact: true })
    .click();
  await expect(page.getByLabel("New agent credential")).toHaveValue(/.+/);
  await page.getByRole("button", { name: "Dismiss credential" }).click();
  await page
    .getByLabel("Agent", { exact: true })
    .selectOption({ label: "Fixture invoice reader" });
  await page
    .getByLabel("Account", { exact: true })
    .selectOption({ label: "Synthetic test account" });
  const startsLocally = await page.getByLabel("Access starts").inputValue();
  const minutesFromNow = await page.evaluate(
    (value) => Math.abs(Date.now() - new Date(value).getTime()) / 60000,
    startsLocally,
  );
  expect(minutesFromNow).toBeLessThan(2);
  await page.getByLabel("Access starts").fill("2026-01-01T00:00");
  await page.getByLabel("Access expires").fill("2026-12-31T00:00");
  await page.getByRole("button", { name: "Create grant", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Revoke grant" }),
  ).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Revoke grant" }).click();
  await expect(
    page.getByRole("button", { name: "Revoke grant" }),
  ).toBeDisabled();
  for (const name of ["Approvals", "Sessions", "Activity"] as const) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(
      page.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
  }
  await page
    .getByRole("button", { name: "Vault & maintenance", exact: true })
    .click();
  await page.getByRole("button", { name: "Lock vault now" }).click();
  await expect(page.getByText("Your vault is locked")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("broker-mobile.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
