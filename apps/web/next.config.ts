import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  transpilePackages: ["@moritzbrantner/speed-reading"],
};

export default nextConfig;
