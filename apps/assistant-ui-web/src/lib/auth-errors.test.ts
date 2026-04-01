import { describe, expect, it } from "vitest";

import {
  UnauthorizedError,
  throwIfUnauthorized,
  isUnauthorizedError,
} from "./auth-errors";

describe("auth errors", () => {
  it("throws UnauthorizedError for 401 responses", () => {
    expect(() => throwIfUnauthorized(401, "Authentication required")).toThrowError(
      UnauthorizedError,
    );
  });

  it("does not throw for non-401 responses", () => {
    expect(() => throwIfUnauthorized(500, "Internal Server Error")).not.toThrow();
  });

  it("recognizes UnauthorizedError instances", () => {
    expect(isUnauthorizedError(new UnauthorizedError())).toBe(true);
    expect(isUnauthorizedError(new Error("nope"))).toBe(false);
  });
});
