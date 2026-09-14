import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({
  // R2/KV incremental cache and other overrides get wired in here once
  // the storage layer (Section 7 of the project briefing) is connected.
});
