/**
 * Seed clients/projects from the legacy Python project's clients.yaml.
 * Idempotent by slug: clients are upserted; status is preserved across reseeds.
 *
 * NOTE Phase 2 will reference projects.id from reports rows; at that point
 * the delete-and-reinsert project strategy below must change to a real diff.
 */
import { readFileSync } from "node:fs";

import { config as loadEnv } from "dotenv";
import { parse as parseYaml } from "yaml";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

const YAML_PATH =
  "/path/to/private-source/clients.yaml";

type YamlProject = {
  name?: string | null;
  repos: string[];
};
type YamlClient = {
  name: string;
  slug: string;
  contact_name: string;
  contact_email: string;
  tone?: string;
  projects: YamlProject[];
};
type YamlFile = { clients: YamlClient[] };

async function main() {
  const { eq, sql } = await import("drizzle-orm");
  const { db } = await import("../src/db");
  const { auditLog, clients, projects } = await import("../src/db/schema");

  const raw = readFileSync(YAML_PATH, "utf8");
  const data = parseYaml(raw) as YamlFile;

  if (!Array.isArray(data?.clients)) {
    throw new Error(`Expected 'clients' array in ${YAML_PATH}`);
  }

  await db.transaction(async (tx) => {
    for (const yc of data.clients) {
      const tone = yc.tone ?? "friendly-professional";
      const [row] = await tx
        .insert(clients)
        .values({
          name: yc.name,
          slug: yc.slug,
          contactName: yc.contact_name,
          contactEmail: yc.contact_email,
          tone,
        })
        .onConflictDoUpdate({
          target: clients.slug,
          set: {
            name: yc.name,
            contactName: yc.contact_name,
            contactEmail: yc.contact_email,
            tone,
            updatedAt: sql`now()`,
          },
        })
        .returning({ id: clients.id });

      await tx.delete(projects).where(eq(projects.clientId, row.id));

      if (yc.projects.length > 0) {
        await tx.insert(projects).values(
          yc.projects.map((p, i) => ({
            clientId: row.id,
            name: p.name ?? null,
            repos: p.repos,
            position: i,
          })),
        );
      }

      const repoCount = yc.projects.reduce(
        (n, p) => n + (p.repos?.length ?? 0),
        0,
      );
      console.log(
        `[seed] upsert ${yc.slug} — ${yc.projects.length} project(s) / ${repoCount} repo(s)`,
      );
    }

    await tx.insert(auditLog).values({
      actorEmail: "seed-script",
      action: "seed.clients",
      entityType: "client",
      entityId: null,
      payload: { source: YAML_PATH, count: data.clients.length },
    });
  });

  console.log(`[seed] done.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[seed] failed:", err);
  process.exit(1);
});
