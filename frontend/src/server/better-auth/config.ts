import { betterAuth } from "better-auth";
import { genericOAuth } from "better-auth/plugins";

import { env } from "../../env.js";

type OidcEnvConfig = {
  BETTER_AUTH_OIDC_CLIENT_ID?: string;
  BETTER_AUTH_OIDC_CLIENT_SECRET?: string;
  BETTER_AUTH_OIDC_DISCOVERY_URL?: string;
  NEXT_PUBLIC_BETTER_AUTH_OIDC_PROVIDER_ID?: string;
};

export function resolveOidcPluginConfig(config: OidcEnvConfig) {
  const providerId = config.NEXT_PUBLIC_BETTER_AUTH_OIDC_PROVIDER_ID ?? "oidc";
  const clientId = config.BETTER_AUTH_OIDC_CLIENT_ID;
  const clientSecret = config.BETTER_AUTH_OIDC_CLIENT_SECRET;
  const discoveryUrl = config.BETTER_AUTH_OIDC_DISCOVERY_URL;

  const hasAnyOidcSetting = [clientId, clientSecret, discoveryUrl].some(
    (value) => value !== undefined,
  );
  if (!hasAnyOidcSetting) {
    return null;
  }

  if (!clientId || !clientSecret || !discoveryUrl) {
    throw new Error(
      "OIDC requires client ID, client secret, and discovery URL.",
    );
  }

  return {
    providerId,
    clientId,
    clientSecret,
    discoveryUrl,
    scopes: ["openid", "email", "profile"],
  };
}

const oidcConfig = resolveOidcPluginConfig(env);

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  emailAndPassword: {
    enabled: true,
  },
  account: {
    storeAccountCookie: true,
    updateAccountOnSignIn: true,
  },
  plugins: oidcConfig
    ? [
        genericOAuth({
          config: [oidcConfig],
        }),
      ]
    : [],
});

export type Session = typeof auth.$Infer.Session;
