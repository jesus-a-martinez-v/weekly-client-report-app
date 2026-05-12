import { config as loadEnv } from "dotenv";
import type { Config } from "drizzle-kit";

loadEnv({ path: ".env.local" });

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is required for drizzle-kit");
}

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url, ssl: "require" },
  strict: true,
} satisfies Config;
