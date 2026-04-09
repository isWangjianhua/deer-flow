type BffURLConfig = {
  DEER_FLOW_INTERNAL_BFF_BASE_URL?: string;
  NEXT_PUBLIC_BFF_BASE_URL?: string;
};

export function getInternalBffBaseURL(
  config: BffURLConfig = process.env as BffURLConfig,
) {
  const internal = config.DEER_FLOW_INTERNAL_BFF_BASE_URL?.trim();
  if (internal) {
    return internal.replace(/\/+$/, "");
  }

  const configured = config.NEXT_PUBLIC_BFF_BASE_URL?.trim();
  if (configured?.startsWith("http://") || configured?.startsWith("https://")) {
    return configured.replace(/\/+$/, "");
  }

  return "http://127.0.0.1:9000";
}
