export type ActivitySource = "github" | "linear";

export type ActivityTotals = {
  prs: number;
  issues: number;
  commits: number;
  issuesCompleted?: number;
  issuesInProgress?: number;
  issuesCreated?: number;
};

export type Author = {
  login: string;
  is_bot: boolean;
  name: string | null;
};

export type MergedPR = {
  number: number;
  title: string;
  body: string;
  labels: string[];
  mergedAt: string;
  author: Author;
  url: string;
};

export type ClosedIssue = {
  number: number;
  title: string;
  body: string;
  labels: string[];
  closedAt: string;
  author: Author;
  url: string;
};

export type CommitSummary = {
  sha: string;
  message: string;
  author: string;
  date: string;
};

export type RepoActivity = {
  repo: string;
  merged_prs: MergedPR[];
  closed_issues: ClosedIssue[];
  commits: CommitSummary[];
};

export type GithubProjectActivity = {
  name: string | null;
  repos: RepoActivity[];
  totals: ActivityTotals;
};

export type LinearIssueSummary = {
  id: string;
  identifier: string;
  title: string;
  description: string;
  state: string;
  url: string;
  createdAt: string;
  completedAt?: string | null;
};

export type LinearProjectActivity = {
  name: string | null;
  teamKey: string;
  projectId?: string;
  completed: LinearIssueSummary[];
  inProgress: LinearIssueSummary[];
  created: LinearIssueSummary[];
  totals: ActivityTotals;
};

export type GithubActivityDetail = {
  source: "github";
  projects: GithubProjectActivity[];
};

export type LinearActivityDetail = {
  source: "linear";
  projects: LinearProjectActivity[];
};

export type ClientActivity = {
  source: ActivitySource;
  client: string;
  slug: string;
  contact_name: string;
  contact_email: string;
  tone: string;
  window: { start: string; end: string; label: string };
  totals: ActivityTotals;
  detail: GithubActivityDetail | LinearActivityDetail;
};

export function isQuietActivity(activity: ClientActivity): boolean {
  const baseTotal =
    activity.totals.prs + activity.totals.issues + activity.totals.commits;
  if (activity.source === "github") return baseTotal === 0;

  return baseTotal === 0 && (activity.totals.issuesCompleted ?? 0) === 0;
}
