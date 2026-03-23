import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingExcludes: {
    "*": ["./pipeline/.venv/**"],
  },
};

export default nextConfig;
