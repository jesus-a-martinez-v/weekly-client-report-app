import { defineConfig } from "@trigger.dev/sdk/v3";
import { puppeteer } from "@trigger.dev/build/extensions/puppeteer";

export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF ?? "",
  runtime: "node",
  maxDuration: 600,
  dirs: ["./src/trigger"],
  build: {
    extensions: [puppeteer()],
  },
});
