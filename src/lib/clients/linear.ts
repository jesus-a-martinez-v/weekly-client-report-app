import {
  LinearClient,
  LinearErrorType,
  parseLinearError,
} from "@linear/sdk";

import type { LinearError, LinearErrorRaw } from "@linear/sdk";
import type {
  ActivityTotals,
  ClientActivity,
  LinearIssueSummary,
  LinearProjectActivity,
} from "@/lib/activity/types";

const PAGE_SIZE = 100;
const DEFAULT_RATE_LIMIT_RETRY_MS = 1_000;

type LinearIssueStateType = "completed" | "started";

type FetchLinearActivityClient = {
  name: string;
  slug: string;
  contact_name: string;
  contact_email: string;
  tone: string;
};

type FetchLinearActivityProject = {
  name: string | null;
  teamKey: string;
  projectId?: string;
};

export type FetchLinearActivityInput = {
  client: FetchLinearActivityClient;
  projects: FetchLinearActivityProject[];
  window: { start: Date; end: Date; label: string };
  token: string;
};

type StringComparator = {
  eq: string;
};

type IdComparator = {
  eq: string;
};

type DateComparator = {
  gte?: string;
  lte?: string;
};

type LinearIssueFilter = {
  team: {
    key: StringComparator;
  };
  state?: {
    type: StringComparator;
  };
  project?: {
    id: IdComparator;
  };
  completedAt?: DateComparator;
  createdAt?: DateComparator;
};

type LinearIssuesQueryVariables = {
  first: number;
  after?: string | null;
  filter: LinearIssueFilter;
};

type LinearIssuesQueryResponse = {
  issues?: {
    pageInfo: {
      hasNextPage: boolean;
      endCursor?: string | null;
    };
    nodes: LinearIssueNode[];
  };
};

type LinearIssueNode = {
  id: string;
  identifier: string;
  title: string;
  description?: string | null;
  state?: {
    name?: string | null;
  } | null;
  url: string;
  createdAt: string;
  completedAt?: string | null;
};

type LinearIssuesConnection = NonNullable<LinearIssuesQueryResponse["issues"]>;

export class LinearFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LinearFetchError";
  }
}

export class LinearAuthError extends LinearFetchError {
  constructor() {
    super("Linear token is missing, expired, or does not have access to the requested workspace");
    this.name = "LinearAuthError";
  }
}

export class LinearRateLimitError extends LinearFetchError {
  constructor() {
    super("Linear API rate limit exceeded");
    this.name = "LinearRateLimitError";
  }
}

const ISSUES_QUERY = `
  query ClientReportLinearIssues($first: Int!, $after: String, $filter: IssueFilter) {
    issues(first: $first, after: $after, filter: $filter) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        identifier
        title
        description
        state {
          name
        }
        url
        createdAt
        completedAt
      }
    }
  }
`;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function parseUnknownLinearError(error: unknown): LinearError {
  return parseLinearError(error as LinearError | LinearErrorRaw | undefined);
}

function baseFilter(project: FetchLinearActivityProject): LinearIssueFilter {
  const filter: LinearIssueFilter = {
    team: { key: { eq: project.teamKey } },
  };

  if (project.projectId) {
    filter.project = { id: { eq: project.projectId } };
  }

  return filter;
}

function issueFilter(input: {
  project: FetchLinearActivityProject;
  stateType?: LinearIssueStateType;
  completedWindow?: { start: Date; end: Date };
  createdWindow?: { start: Date; end: Date };
}): LinearIssueFilter {
  const filter = baseFilter(input.project);
  if (input.stateType) {
    filter.state = { type: { eq: input.stateType } };
  }
  if (input.completedWindow) {
    filter.completedAt = {
      gte: input.completedWindow.start.toISOString(),
      lte: input.completedWindow.end.toISOString(),
    };
  }
  if (input.createdWindow) {
    filter.createdAt = {
      gte: input.createdWindow.start.toISOString(),
      lte: input.createdWindow.end.toISOString(),
    };
  }
  return filter;
}

function retryAfterMs(error: unknown): number {
  try {
    const parsed = parseUnknownLinearError(error);
    const retryAfter = (parsed as { retryAfter?: unknown }).retryAfter;
    if (typeof retryAfter === "number" && Number.isFinite(retryAfter)) {
      return Math.max(retryAfter * 1_000, DEFAULT_RATE_LIMIT_RETRY_MS);
    }
  } catch {
    return DEFAULT_RATE_LIMIT_RETRY_MS;
  }
  return DEFAULT_RATE_LIMIT_RETRY_MS;
}

function isLinearRateLimit(error: unknown): boolean {
  try {
    return parseUnknownLinearError(error).type === LinearErrorType.Ratelimited;
  } catch {
    return false;
  }
}

function toLinearFetchError(error: unknown): LinearFetchError {
  try {
    const parsed = parseUnknownLinearError(error);
    if (
      parsed.type === LinearErrorType.AuthenticationError ||
      parsed.type === LinearErrorType.Forbidden
    ) {
      return new LinearAuthError();
    }
    if (parsed.type === LinearErrorType.Ratelimited) {
      return new LinearRateLimitError();
    }
    return new LinearFetchError(
      `Linear API request failed (${parsed.type ?? LinearErrorType.Unknown})`,
    );
  } catch {
    return new LinearFetchError("Linear API request failed");
  }
}

function toIssueSummary(issue: LinearIssueNode): LinearIssueSummary {
  return {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    description: issue.description ?? "",
    state: issue.state?.name ?? "",
    url: issue.url,
    createdAt: issue.createdAt,
    completedAt: issue.completedAt ?? null,
  };
}

async function fetchIssuePage(
  client: LinearClient,
  variables: LinearIssuesQueryVariables,
  retried = false,
): Promise<LinearIssuesConnection> {
  try {
    const response = await client.client.request<
      LinearIssuesQueryResponse,
      LinearIssuesQueryVariables
    >(ISSUES_QUERY, variables);
    if (!response.issues) {
      throw new LinearFetchError("Linear API response did not include issues");
    }
    return response.issues;
  } catch (error) {
    if (error instanceof LinearFetchError) throw error;
    if (!retried && isLinearRateLimit(error)) {
      await sleep(retryAfterMs(error));
      return fetchIssuePage(client, variables, true);
    }
    throw toLinearFetchError(error);
  }
}

async function fetchIssues(
  client: LinearClient,
  filter: LinearIssueFilter,
): Promise<LinearIssueSummary[]> {
  const issues: LinearIssueSummary[] = [];
  let after: string | null = null;

  do {
    const page = await fetchIssuePage(client, {
      first: PAGE_SIZE,
      after,
      filter,
    });
    issues.push(...page.nodes.map(toIssueSummary));
    after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor ?? null : null;
  } while (after);

  return issues;
}

function projectTotals(input: {
  completed: LinearIssueSummary[];
  inProgress: LinearIssueSummary[];
  created: LinearIssueSummary[];
}): ActivityTotals {
  return {
    prs: 0,
    issues: input.completed.length,
    commits: 0,
    issuesCompleted: input.completed.length,
    issuesInProgress: input.inProgress.length,
    issuesCreated: input.created.length,
  };
}

export async function fetchLinearActivity(
  input: FetchLinearActivityInput,
): Promise<ClientActivity> {
  if (input.token.trim().length === 0) {
    throw new LinearAuthError();
  }

  const linear = new LinearClient({ apiKey: input.token });
  const projects: LinearProjectActivity[] = [];

  for (const project of input.projects) {
    const [completed, inProgress, created] = await Promise.all([
      fetchIssues(
        linear,
        issueFilter({
          project,
          stateType: "completed",
          completedWindow: input.window,
        }),
      ),
      fetchIssues(
        linear,
        issueFilter({
          project,
          stateType: "started",
        }),
      ),
      fetchIssues(
        linear,
        issueFilter({
          project,
          createdWindow: input.window,
        }),
      ),
    ]);

    projects.push({
      name: project.name,
      teamKey: project.teamKey,
      projectId: project.projectId,
      completed,
      inProgress,
      created,
      totals: projectTotals({ completed, inProgress, created }),
    });
  }

  const totals: ActivityTotals = {
    prs: 0,
    issues: projects.reduce((n, project) => n + project.completed.length, 0),
    commits: 0,
    issuesCompleted: projects.reduce(
      (n, project) => n + project.completed.length,
      0,
    ),
    issuesInProgress: projects.reduce(
      (n, project) => n + project.inProgress.length,
      0,
    ),
    issuesCreated: projects.reduce(
      (n, project) => n + project.created.length,
      0,
    ),
  };

  return {
    source: "linear",
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
    detail: {
      source: "linear",
      projects,
    },
  };
}
