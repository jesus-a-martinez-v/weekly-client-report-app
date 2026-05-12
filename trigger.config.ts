import { defineConfig } from "@trigger.dev/sdk/v3";
import { puppeteer } from "@trigger.dev/build/extensions/puppeteer";

const projectRef = process.env.TRIGGER_PROJECT_REF;
if (!projectRef) {
  throw new Error("TRIGGER_PROJECT_REF must be set (see Trigger.dev dashboard)");
}

export default defineConfig({
  project: projectRef,
  runtime: "node",
  maxDuration: 600,
  dirs: ["./src/trigger"],
  build: {
    extensions: [puppeteer()],
  },
});
