import type { NextConfig } from "next";

function getGatewayBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_GATEWAY_BASE_URL?.trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  return "http://127.0.0.1:8001";
}

const nextConfig: NextConfig = {
  devIndicators: false,
  async rewrites() {
    const gatewayBaseUrl = getGatewayBaseUrl();

    return [
      {
        source: "/api/:path*",
        destination: `${gatewayBaseUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
