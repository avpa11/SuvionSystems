import { test, expect } from "@playwright/test";

test("live instruments, report generation, and mobile layout", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your vessel. A clearer picture." }),
  ).toBeVisible();
  await expect(page.getByText("Receiving data", { exact: true })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByLabel(/^Fuel Flow:/)).not.toHaveAccessibleName(
    "Fuel Flow: no data",
  );
  await expect(page.locator(".cog-widget__footer polyline")).toHaveCount(6);
  if (process.env.CAPTURE_DOCS)
    await page.screenshot({
      path: "docs/images/dashboard-desktop.png",
      fullPage: true,
    });
  await page.getByRole("button", { name: "Navigation", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Navigation", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Vessel overview", exact: true })
    .click();
  await page.getByRole("button", { name: "Today (UTC)" }).click();
  await page.getByRole("button", { name: "Generate Report" }).click();
  await expect(
    page.getByRole("button", { name: "Download CSV" }),
  ).toBeVisible();
  await expect(page.getByText(/Fuel coverage:/)).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByText("Receiving data", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await expect(page.locator(".cog-widget__footer polyline")).toHaveCount(6);
  if (process.env.CAPTURE_DOCS)
    await page.screenshot({
      path: "docs/images/dashboard-mobile.png",
      fullPage: true,
    });
  expect(errors).toEqual([]);
});

test("offline state explains recovery and leaves missing readings blank", async ({
  page,
}) => {
  await page.route("**/socket.io/**", (route) => route.abort());
  await page.goto("/");
  await expect(
    page.getByText("API disconnected", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Get your first readings")).toBeVisible();
  await expect(
    page.getByLabel("Fuel Flow: no data", { exact: true }),
  ).toBeVisible();
});
