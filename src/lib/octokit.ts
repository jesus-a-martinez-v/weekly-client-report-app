import { Octokit } from "@octokit/rest";

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

export type ProjectActivity = {
  name: string | null;
  repos: RepoActivity[];
  totals: { prs: number; issues: number; commits: number };
};

export type ClientActivity = {
  client: string;
  slug: string;
  contact_name: string;
  contact_email: string;
  tone: string;
  window: { start: string; end: string; label: string };
  totals: { prs: number; issues: number; commits: number };
  projects: ProjectActivity[];
};

let _octokit: Octokit | null = null;

function octokit(): Octokit {
  if (_octokit) return _octokit;
  const auth = process.env.GITHUB_PAT;
  if (!auth) throw new Error("GITHUB_PAT is not set");
  _octokit = new Octokit({ auth, userAgent: "weekly-client-report-app" });
  return _octokit;
}

function toIsoZ(d: Date): string {
  // GitHub search expects 'YYYY-MM-DDTHH:MM:SSZ' (no fractional seconds).
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function searchLabels(item: { labels?: Array<{ name?: string } | string> }): string[] {
  if (!item.labels) return [];
  return item.labels
    .map((l) => (typeof l === "string" ? l : l.name ?? ""))
    .filter((s) => s.length > 0);
}

function searchAuthor(item: { user?: { login?: string; type?: string } | null }): Author {
  const u = item.user;
  return {
    login: u?.login ?? "",
    is_bot: u?.type === "Bot",
    name: null,
  };
}

async function fetchMergedPRs(repo: string, start: Date, end: Date): Promise<MergedPR[]> {
  const q = `repo:${repo} is:pr is:merged merged:${toIsoZ(start)}..${toIsoZ(end)}`;
  const items: MergedPR[] = [];
  const iterator = octokit().paginate.iterator(octokit().rest.search.issuesAndPullRequests, {
    q,
    per_page: 100,
    advanced_search: "true",
  });
  for await (const page of iterator) {
    for (const item of page.data) {
      const mergedAt = item.pull_request?.merged_at ?? item.closed_at ?? "";
      items.push({
        number: item.number,
        title: item.title,
        body: item.body ?? "",
        labels: searchLabels(item),
        mergedAt,
        author: searchAuthor(item),
        url: item.html_url,
      });
    }
  }
  return items;
}

async function fetchClosedIssues(repo: string, start: Date, end: Date): Promise<ClosedIssue[]> {
  const q = `repo:${repo} is:issue is:closed closed:${toIsoZ(start)}..${toIsoZ(end)}`;
  const items: ClosedIssue[] = [];
  const iterator = octokit().paginate.iterator(octokit().rest.search.issuesAndPullRequests, {
    q,
    per_page: 100,
    advanced_search: "true",
  });
  for await (const page of iterator) {
    for (const item of page.data) {
      items.push({
        number: item.number,
        title: item.title,
        body: item.body ?? "",
        labels: searchLabels(item),
        closedAt: item.closed_at ?? "",
        author: searchAuthor(item),
        url: item.html_url,
      });
    }
  }
  return items;
}

async function fetchCommits(repo: string, start: Date, end: Date): Promise<CommitSummary[]> {
  const [owner, name] = repo.split("/");
  if (!owner || !name) throw new Error(`Invalid repo: ${repo}`);
  const commits = await octokit().paginate(octokit().rest.repos.listCommits, {
    owner,
    repo: name,
    since: toIsoZ(start),
    until: toIsoZ(end),
    per_page: 100,
  });
  return commits.map((c) => ({
    sha: c.sha.slice(0, 7),
    message: (c.commit.message ?? "").split("\n")[0],
    author: c.commit.author?.name ?? "",
    date: c.commit.author?.date ?? "",
  }));
}

async function fetchRepo(repo: string, start: Date, end: Date): Promise<RepoActivity> {
  const [merged_prs, closed_issues, commits] = await Promise.all([
    fetchMergedPRs(repo, start, end),
    fetchClosedIssues(repo, start, end),
    fetchCommits(repo, start, end),
  ]);
  return { repo, merged_prs, closed_issues, commits };
}

export type FetchClientActivityInput = {
  client: {
    name: string;
    slug: string;
    contact_name: string;
    contact_email: string;
    tone: string;
  };
  projects: Array<{ name: string | null; repos: string[] }>;
  window: { start: Date; end: Date; label: string };
};

export async function fetchClientActivity(
  input: FetchClientActivityInput,
): Promise<ClientActivity> {
  const projects: ProjectActivity[] = [];
  for (const p of input.projects) {
    const repos = await Promise.all(p.repos.map((r) => fetchRepo(r, input.window.start, input.window.end)));
    const totals = {
      prs: repos.reduce((n, r) => n + r.merged_prs.length, 0),
      issues: repos.reduce((n, r) => n + r.closed_issues.length, 0),
      commits: repos.reduce((n, r) => n + r.commits.length, 0),
    };
    projects.push({ name: p.name, repos, totals });
  }

  const totals = {
    prs: projects.reduce((n, p) => n + p.totals.prs, 0),
    issues: projects.reduce((n, p) => n + p.totals.issues, 0),
    commits: projects.reduce((n, p) => n + p.totals.commits, 0),
  };

  return {
    client: input.client.name,
    slug: input.client.slug,
    contact_name: input.client.contact_name,
    contact_email: input.client.contact_email,
    tone: input.client.tone,
    window: {
      start: input.window.start.toISOString(),
      end: input.window.end.toISOString(),
      label: input.window.label,
    },
    totals,
    projects,
  };
}
