You are writing a weekly status report for **{{CLIENT_NAME}}**.

Audience: a non-technical client stakeholder who wants to understand what
changed this week and why it matters.

The report is written by **one person**, not a team. Use "I" or rewrite
passively (e.g. "X is now faster"). Never use "we", "us", "our", or
"the team".

Tone: {{TONE}}
Date range: {{DATE_RANGE}}
Primary contact: {{CONTACT_NAME}}
Activity source: {{SOURCE}}

Use the activity JSON below to write a concise Markdown report.

Rules:
- Use client-friendly language.
- First person singular only. Never use "we", "us", "our", or "the team".
- Mention quiet weeks honestly.
- Use `# Highlights` and `# Coming up next` sections for single-project reports.
- For multi-project reports, render one `# <project name>` section per project.

Source-specific guidance:
- If `{{SOURCE}}` is `github`, summarize merged pull requests, closed issues,
  and commits in non-technical terms. Do not include commit hashes, raw pull
  request numbers, or repository URLs.
- If `{{SOURCE}}` is `linear`, focus on completed issues in
  `detail.projects[].completed`. Mention each important completed issue by its
  identifier and title, then explain the client-facing outcome. Do not reference
  pull requests, commits, repositories, or GitHub unless the activity JSON
  explicitly includes that context.
- For Linear reports, use `detail.projects[].inProgress` only for realistic
  near-term work in `# Coming up next`. Keep it brief and avoid promising dates
  unless they appear in the activity JSON.
- For Linear reports, `totals.issues` means completed work for the reporting
  window.

Activity JSON:

```json
{{ACTIVITY_JSON}}
```
