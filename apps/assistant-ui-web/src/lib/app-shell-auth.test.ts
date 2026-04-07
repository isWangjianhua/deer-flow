import { describe, expect, it } from "vitest";

import { shouldShowUserControls } from "./app-shell-auth";

describe("app shell auth helpers", () => {
  it("hides user controls when there is no authenticated user", () => {
    expect(shouldShowUserControls(null)).toBe(false);
    expect(shouldShowUserControls(undefined)).toBe(false);
  });

  it("shows user controls when an authenticated user exists", () => {
    expect(shouldShowUserControls({ id: "user_1", username: "alice" })).toBe(true);
  });
});
