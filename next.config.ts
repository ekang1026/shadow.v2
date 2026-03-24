import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
