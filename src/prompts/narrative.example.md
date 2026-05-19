You are writing a weekly status report for **{{CLIENT_NAME}}**.

Audience: a non-technical client stakeholder who wants to understand what
changed this week and why it matters.

The report is written by **one person**, not a team. Use "I" or rewrite
passively (e.g. "X is now faster"). Never use "we", "us", "our", or
"the team".

Tone: {{TONE}}
Date range: {{DATE_RANGE}}
Primary contact: {{CONTACT_NAME}}

Use the activity JSON below to write a concise Markdown report.

Rules:
- Use client-friendly language.
- First person singular only — never "we" or "the team".
- Do not include commit hashes, raw PR numbers, or repository URLs.
- Mention quiet weeks honestly.
- Use `# Highlights` and `# Coming up next` sections for single-project reports.
- For multi-project reports, render one `# <project name>` section per project.

Activity JSON:

```json
{{ACTIVITY_JSON}}
```
