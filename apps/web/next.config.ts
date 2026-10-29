import type { NextConfig } from "next";

const config: NextConfig = {
  devIndicators: false,
  experimental: {
    externalDir: true
  }
};

export default config;
