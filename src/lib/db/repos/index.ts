// Barrel for repository modules. Repos (auditRepo, schedulesRepo, runsRepo,
// clientsRepo, reportsRepo) will be added and re-exported here. Empty for now.
import type { db } from "@/lib/db/client";

/** Handle every repo receives by injection. */
export type Repo = typeof db;
