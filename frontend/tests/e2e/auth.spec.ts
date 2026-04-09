import { expect, test } from "@playwright/test";

test("account page restores auth state and fetches BFF user details", async ({
  page,
}) => {
  await page.route("**/api/bff/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "bff-user-1",
        email: "demo@example.com",
        username: "demo",
      }),
    });
  });

  await page.goto("/workspace/account");

  await expect(page.getByText("Status: unauthenticated")).toBeVisible();
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByText("Status: authenticated")).toBeVisible();
  await expect(page.getByText("Email: demo@example.com")).toBeVisible();
  await expect(page.getByText(/"username": "demo"/)).toBeVisible();

  await page.reload();

  await expect(page.getByText("Status: authenticated")).toBeVisible();
  await expect(page.getByText("Email: demo@example.com")).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByText("Status: unauthenticated")).toBeVisible();
});
