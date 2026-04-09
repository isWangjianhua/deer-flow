import assert from "node:assert/strict";
import test from "node:test";

const { resolveOidcPluginConfig } = await import(
  new URL("./config.ts", import.meta.url).href,
);

void test("returns null when no oidc settings are configured", () => {
  assert.equal(
    resolveOidcPluginConfig({
      BETTER_AUTH_OIDC_CLIENT_ID: undefined,
      BETTER_AUTH_OIDC_CLIENT_SECRET: undefined,
      BETTER_AUTH_OIDC_DISCOVERY_URL: undefined,
      BETTER_AUTH_OIDC_PROVIDER_ID: undefined,
      NEXT_PUBLIC_BETTER_AUTH_OIDC_PROVIDER_ID: undefined,
    }),
    null,
  );
});

void test("throws when oidc settings are only partially configured", () => {
  assert.throws(
    () =>
      resolveOidcPluginConfig({
        BETTER_AUTH_OIDC_CLIENT_ID: "client-id",
        BETTER_AUTH_OIDC_CLIENT_SECRET: undefined,
        BETTER_AUTH_OIDC_DISCOVERY_URL:
          "https://issuer.example.com/.well-known/openid-configuration",
        BETTER_AUTH_OIDC_PROVIDER_ID: undefined,
        NEXT_PUBLIC_BETTER_AUTH_OIDC_PROVIDER_ID: undefined,
      }),
    /OIDC requires client ID, client secret, and discovery URL/,
  );
});

void test("resolves a complete oidc configuration", () => {
  const config = resolveOidcPluginConfig({
    BETTER_AUTH_OIDC_CLIENT_ID: "client-id",
    BETTER_AUTH_OIDC_CLIENT_SECRET: "client-secret",
    BETTER_AUTH_OIDC_DISCOVERY_URL:
      "https://issuer.example.com/.well-known/openid-configuration",
    BETTER_AUTH_OIDC_PROVIDER_ID: undefined,
    NEXT_PUBLIC_BETTER_AUTH_OIDC_PROVIDER_ID: "oidc",
  });

  assert.deepEqual(config, {
    providerId: "oidc",
    clientId: "client-id",
    clientSecret: "client-secret",
    discoveryUrl: "https://issuer.example.com/.well-known/openid-configuration",
    scopes: ["openid", "email", "profile"],
  });
});
