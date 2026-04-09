import { betterAuth } from "better-auth";
import { genericOAuth } from "better-auth/plugins";

import { env } from "@/env";

const providerId = env.BETTER_AUTH_OIDC_PROVIDER_ID ?? "oidc";

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  emailAndPassword: {
    enabled: true,
  },
  account: {
    storeAccountCookie: true,
    updateAccountOnSignIn: true,
  },
  plugins: env.BETTER_AUTH_OIDC_DISCOVERY_URL
    ? [
        genericOAuth({
          config: [
            {
              providerId,
              clientId: env.BETTER_AUTH_OIDC_CLIENT_ID!,
              clientSecret: env.BETTER_AUTH_OIDC_CLIENT_SECRET!,
              discoveryUrl: env.BETTER_AUTH_OIDC_DISCOVERY_URL,
              scopes: ["openid", "email", "profile"],
            },
          ],
        }),
      ]
    : [],
});

export type Session = typeof auth.$Infer.Session;
