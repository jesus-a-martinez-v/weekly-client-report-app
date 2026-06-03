export type ReportTotalsInput = {
  activityJson: unknown;
  totalsPrs: number;
  totalsIssues: number;
  totalsCommits: number;
};

type ReportActivitySource = "github" | "linear";

type TotalsCell = {
  label: string;
  value: string;
  tableValue: string;
};

export type ReportTotalsDisplay = {
  source: ReportActivitySource;
  prs: TotalsCell;
  issues: TotalsCell;
  commits: TotalsCell;
};

export function reportActivitySource(
  activityJson: unknown,
): ReportActivitySource {
  if (
    typeof activityJson === "object" &&
    activityJson !== null &&
    "source" in activityJson &&
    (activityJson as { source?: unknown }).source === "linear"
  ) {
    return "linear";
  }

  return "github";
}

export function reportTotalsDisplay(
  input: ReportTotalsInput,
): ReportTotalsDisplay {
  const source = reportActivitySource(input.activityJson);

  if (source === "linear") {
    return {
      source,
      prs: { label: "-", value: "-", tableValue: "-" },
      issues: {
        label: "Completed",
        value: String(input.totalsIssues),
        tableValue: `Completed: ${input.totalsIssues}`,
      },
      commits: { label: "-", value: "-", tableValue: "-" },
    };
  }

  return {
    source,
    prs: {
      label: "PRs",
      value: String(input.totalsPrs),
      tableValue: String(input.totalsPrs),
    },
    issues: {
      label: "Issues",
      value: String(input.totalsIssues),
      tableValue: String(input.totalsIssues),
    },
    commits: {
      label: "Commits",
      value: String(input.totalsCommits),
      tableValue: String(input.totalsCommits),
    },
  };
}
