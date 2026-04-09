import { env } from "../../env.js";

export function getOidcProviderId() {
  return env.BETTER_AUTH_OIDC_PROVIDER_ID ?? "oidc";
}

export function getBffBaseURL() {
  return env.NEXT_PUBLIC_BFF_BASE_URL?.replace(/\/+$/, "") ?? "/api/bff";
}
