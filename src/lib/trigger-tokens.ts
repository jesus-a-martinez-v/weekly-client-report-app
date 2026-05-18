import "server-only";

import { auth as triggerAuth } from "@trigger.dev/sdk/v3";

import { auth } from "@/lib/auth";
import { TASK_IDS } from "@/trigger/api";

export type OperatorTokenResult =
  | { token: string; expiresAt: string }
  | { token: null; expiresAt: null; reason: "no_tasks_yet" };

const EXPIRATION = "30min";
const EXPIRATION_MS = 30 * 60 * 1000;

export class UnauthorizedError extends Error {
  constructor() {
    super("unauthorized");
    this.name = "UnauthorizedError";
  }
}

export async function mintOperatorToken(): Promise<OperatorTokenResult> {
  const session = await auth();
  if (!session?.user?.email) {
    throw new UnauthorizedError();
  }

  if (TASK_IDS.length === 0) {
    // Phase A: no tasks deployed yet. createTriggerPublicToken requires
    // at least one task ID, so short-circuit rather than calling the API
    // with an empty list. Phase B will populate TASK_IDS.
    return { token: null, expiresAt: null, reason: "no_tasks_yet" };
  }

  const token = await triggerAuth.createTriggerPublicToken(
    [...TASK_IDS],
    { expirationTime: EXPIRATION, multipleUse: true },
  );
  const expiresAt = new Date(Date.now() + EXPIRATION_MS).toISOString();
  return { token, expiresAt };
}
