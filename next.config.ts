import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  outputFileTracingExcludes: {
    "*": ["./pipeline/.venv/**"],
  },
  experimental: {
    turbo: {
      watchExcludedDirs: ["pipeline"],
    },
  },
};

export default nextConfig;
