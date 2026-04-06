import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./auth", () => ({
  logout: vi.fn(),
}));

import { logout } from "./auth";
import { performLogout } from "./logout-action";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("performLogout", () => {
  it("logs out before redirecting to the login page", async () => {
    const navigate = vi.fn();
    vi.mocked(logout).mockResolvedValue(undefined);

    await performLogout(navigate);

    expect(logout).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith("/login");
  });
});
