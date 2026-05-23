import { defineConfig } from "vitest/config";
import { cloudflarePool, cloudflareTest } from "@cloudflare/vitest-pool-workers";

const poolOptions = {
  main: "test/_test-worker.ts",
  wrangler: { configPath: "./wrangler.jsonc" },
  miniflare: {
    bindings: {
      // Fixture value — tests read this via `env.VAULT_NAME` and construct
      // expected URLs from it, so production deploys aren't tied to whatever
      // string is here.
      VAULT_NAME: "test-vault",
    },
  },
};

export default defineConfig({
  plugins: [cloudflareTest(poolOptions)],
  test: {
    pool: cloudflarePool(poolOptions),
  },
});
