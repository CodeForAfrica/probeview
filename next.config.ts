import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // Type-check the build against a config that excludes the test suite, so
    // test code never gates `next build`. See tsconfig.build.json.
    tsconfigPath: "tsconfig.build.json",
  },
};

export default nextConfig;
