import type { NextConfig } from "next";

const config: NextConfig = {
  // The workspace packages are TypeScript source, not built output.
  transpilePackages: ["@proofkin/core", "@proofkin/vm"],
  serverExternalPackages: ["@coinbase/cdp-sdk", "@base-org/account"],
};

export default config;
