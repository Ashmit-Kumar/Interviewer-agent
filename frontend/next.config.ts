import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // FIX FIVE: Disable Strict Mode to prevent double mount/unmount in development
  // This prevents React from intentionally doubling effects during development
  // Does NOT affect production behavior
  reactStrictMode: false,
};

export default nextConfig;
