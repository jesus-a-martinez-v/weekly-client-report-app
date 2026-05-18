// Phase A stub. Phase B populates this with task references and the
// concrete TASK_IDS list. Keep this file the single source of truth for
// the scope passed to auth.createTriggerPublicToken.

export const TASK_IDS = [] as const;

export type TaskId = (typeof TASK_IDS)[number];
