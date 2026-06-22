import type { DailySummary, DailySummaryInput } from "@/lib/clients/openrouter";
import type { FetchClientActivityInput } from "@/lib/clients/octokit";
import type { FetchLinearActivityInput } from "@/lib/clients/linear";
import type { ClientActivity } from "@/lib/activity/types";
import type { ClientWithLinearTokenAndProjects } from "@/lib/db/repos/clients";
import { dayWindow } from "@/lib/shared/window";
import { decryptSecret } from "@/lib/crypto/secret-box";

export type DailySummaryDeps = {
  activity: {
    fetchClientActivity: (input: FetchClientActivityInput) => Promise<ClientActivity>;
    fetchLinearActivity: (input: FetchLinearActivityInput) => Promise<ClientActivity>;
  };
  openRouter: {
    generateDailySummary: (input: DailySummaryInput) => Promise<DailySummary>;
  };
  clientsRepo: {
    findClientByIdWithLinearToken: (id: string) => Promise<ClientWithLinearTokenAndProjects | null>;
  };
};

export type DailySummaryResult = {
  summary: string;
  hoursEstimate: number;
  dateLabel: string;
  clientName: string;
  totals: {
    prs: number;
    issues: number;
    commits: number;
    comments: number;
  };
};

function countComments(activity: ClientActivity): number {
  if (activity.detail.source === "github") {
    return activity.detail.projects.reduce(
      (sum, p) =>
        sum + p.repos.reduce((rs, r) => rs + (r.comments?.length ?? 0), 0),
      0,
    );
  }
  return activity.detail.projects.reduce(
    (sum, p) => sum + (p.comments?.length ?? 0),
    0,
  );
}

function isQuietDay(activity: ClientActivity): boolean {
  const base =
    activity.totals.prs +
    activity.totals.issues +
    activity.totals.commits +
    (activity.totals.issuesCompleted ?? 0);
  return base === 0 && countComments(activity) === 0;
}

export async function generateDailySummary(
  input: { clientId: string; dateISO: string },
  deps: DailySummaryDeps,
): Promise<DailySummaryResult> {
  const found = await deps.clientsRepo.findClientByIdWithLinearToken(input.clientId);
  if (!found) throw new Error(`Client not found: ${input.clientId}`);
  const { client, projects } = found;
  if (projects.length === 0) {
    throw new Error(`Client ${client.slug} has no projects configured.`);
  }

  const window = dayWindow(input.dateISO);
  const activityWindow = { start: window.start, end: window.end, label: window.label };
  const identity = {
    name: client.name,
    slug: client.slug,
    contact_name: client.contactName,
    contact_email: client.contactEmail,
    tone: client.tone,
  };

  let activity: ClientActivity;

  if (client.source === "linear") {
    if (!client.linearTokenEnc) {
      throw new Error(
        `Client ${client.slug} is Linear-sourced but has no Linear token configured.`,
      );
    }
    const linearProjects = projects.map((p) => {
      const teamKey = p.linearTeamKey?.trim();
      if (!teamKey) {
        throw new Error(
          `Client ${client.slug}: project ${p.name ?? p.id} has no Linear team key configured.`,
        );
      }
      return { name: p.name, teamKey, projectId: p.linearProjectId ?? undefined };
    });
    activity = await deps.activity.fetchLinearActivity({
      client: identity,
      projects: linearProjects,
      window: activityWindow,
      token: decryptSecret(client.linearTokenEnc),
      includeComments: true,
    });
  } else {
    activity = await deps.activity.fetchClientActivity({
      client: identity,
      projects: projects.map((p) => ({ name: p.name, repos: p.repos })),
      window: activityWindow,
      includeComments: true,
    });
  }

  const commentCount = countComments(activity);

  if (isQuietDay(activity)) {
    return {
      summary: `No significant activity recorded for ${window.label}.`,
      hoursEstimate: 0,
      dateLabel: window.label,
      clientName: client.name,
      totals: { prs: 0, issues: 0, commits: 0, comments: 0 },
    };
  }

  const result = await deps.openRouter.generateDailySummary({
    clientName: client.name,
    dateLabel: window.label,
    activity,
  });

  return {
    summary: result.summary,
    hoursEstimate: result.hoursEstimate,
    dateLabel: window.label,
    clientName: client.name,
    totals: {
      prs: activity.totals.prs,
      issues: activity.totals.issues,
      commits: activity.totals.commits,
      comments: commentCount,
    },
  };
}
