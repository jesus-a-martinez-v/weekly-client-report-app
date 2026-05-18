import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { reports, runs } from "@/db/schema";

const sql = postgres(process.env.DATABASE_URL!);
const db = drizzle(sql);

async function main() {
  const r = await db
    .select({ status: reports.status, err: reports.errorMessage })
    .from(reports)
    .where(eq(reports.runId, "601599fb-c479-4f55-97c4-2bd1b40136ee"));
  console.log("report:", JSON.stringify(r, null, 2));

  await db
    .update(runs)
    .set({ status: "failed", finishedAt: new Date() })
    .where(eq(runs.id, "601599fb-c479-4f55-97c4-2bd1b40136ee"));
  console.log("run marked failed");
  await sql.end();
}

main().catch(console.error);
