import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // R2 will serve originals/renders once the bucket is connected (see wrangler.jsonc).
    remotePatterns: [],
  },
};

export default nextConfig;

// Enables `getCloudflareContext()` (env bindings, cf object) in `next dev`.
// Safe to keep even before D1/R2/KV are actually bound.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
