import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // This app lives next to the client app; pin the root so Next does not
  // walk up and pick the sibling project's lockfile / middleware.
  turbopack: { root },
  outputFileTracingRoot: root,
};

export default nextConfig;
