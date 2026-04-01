function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

export function getGatewayBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_GATEWAY_BASE_URL?.trim();
  if (!configured) {
    return "";
  }

  return trimTrailingSlash(configured);
}

export function buildGatewayUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${getGatewayBaseUrl()}${normalizedPath}`;
}
