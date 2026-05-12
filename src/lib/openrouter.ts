import fs from "node:fs/promises";
import path from "node:path";
import type { ClientActivity } from "./octokit";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

let _promptCache: string | null = null;

async function loadNarrativePrompt(): Promise<string> {
  if (_promptCache) return _promptCache;
  if (process.env.NARRATIVE_PROMPT) {
    _promptCache = process.env.NARRATIVE_PROMPT;
    return _promptCache;
  }
  const promptPath =
    process.env.NARRATIVE_PROMPT_PATH ??
    path.join(process.cwd(), "src/prompts/narrative.example.md");
  _promptCache = await fs.readFile(promptPath, "utf-8");
  return _promptCache;
}

function model(): string {
  return process.env.OPENROUTER_MODEL || "openai/gpt-5.5";
}

function apiKey(): string {
  const k = process.env.OPENROUTER_API_KEY;
  if (!k) throw new Error("OPENROUTER_API_KEY is not set");
  return k;
}

function appBaseUrl(): string {
  const url = process.env.APP_BASE_URL;
  if (url) return url.replace(/\/$/, "");
  if (process.env.NODE_ENV !== "production") return "http://localhost:3000";
  throw new Error("APP_BASE_URL is required outside local development");
}

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

type ChatRequest = {
  model: string;
  messages: ChatMessage[];
  reasoning?: { effort: "low" | "medium" | "high" };
  response_format?: { type: "json_object" } | { type: "text" };
  temperature?: number;
};

async function chat(req: ChatRequest): Promise<string> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey()}`,
      "HTTP-Referer": appBaseUrl(),
      "X-Title": "weekly-client-report-app",
    },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${txt.slice(0, 500)}`);
  }
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error(`OpenRouter returned no content: ${JSON.stringify(json).slice(0, 500)}`);
  return content;
}

export type NarrativeInput = {
  clientName: string;
  contactName: string;
  tone: string;
  dateRange: string;
  activity: ClientActivity;
};

export async function generateNarrative(input: NarrativeInput): Promise<string> {
  const tpl = await loadNarrativePrompt();
  const prompt = tpl
    .replace("{{CLIENT_NAME}}", input.clientName)
    .replace("{{CONTACT_NAME}}", input.contactName)
    .replace("{{TONE}}", input.tone)
    .replace("{{DATE_RANGE}}", input.dateRange)
    .replace("{{ACTIVITY_JSON}}", JSON.stringify(input.activity, null, 2))
    // Belt-and-braces: the template references CLIENT_NAME a second time in the data section.
    .replace("{{CLIENT_NAME}}", input.clientName);

  return chat({
    model: model(),
    messages: [{ role: "user", content: prompt }],
    reasoning: { effort: "medium" },
    response_format: { type: "text" },
  });
}

export type EmailDraftInput = {
  clientName: string;
  contactName: string;
  dateRange: string;
  narrativeMd: string;
};

export type EmailDraft = { subject: string; body: string };

const EMAIL_SYSTEM_PROMPT = `You write the email body that accompanies a weekly client status report.

Output JSON with two fields:
- "subject": exactly "[<CLIENT_NAME>] Weekly update, week of <DATE_RANGE>"
- "body": plain-text email body — greeting line ("Hi <CONTACT_NAME>,"), 1–2 short paragraphs summarizing the week in non-technical language drawn from the narrative, then a blank line, then "Best,", then a blank line, then "<REPORT_SENDER_NAME>"

Rules:
- No em dashes (—) anywhere. Use commas, periods, colons, or rephrase.
- Plain text, not Markdown.
- No PR numbers, commit hashes, or GitHub URLs.
- Do not offer a call or follow-up meeting.
- Keep it warm and brief; the PDF carries the detail.

Quiet weeks: if the narrative says it was a lighter week, mirror that honestly in one short paragraph.`;

export async function generateEmailDraft(input: EmailDraftInput): Promise<EmailDraft> {
  const userPrompt =
    `REPORT_SENDER_NAME: ${process.env.REPORT_SENDER_NAME || "Team"}\n` +
    `CLIENT_NAME: ${input.clientName}\n` +
    `CONTACT_NAME: ${input.contactName}\n` +
    `DATE_RANGE: ${input.dateRange}\n\n` +
    `NARRATIVE:\n${input.narrativeMd}`;

  const raw = await chat({
    model: model(),
    messages: [
      { role: "system", content: EMAIL_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    reasoning: { effort: "low" },
    response_format: { type: "json_object" },
    temperature: 0.3,
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Fallback: strip code fences if the model wrapped JSON in them despite json mode.
    const stripped = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    parsed = JSON.parse(stripped);
  }
  const obj = parsed as { subject?: unknown; body?: unknown };
  if (typeof obj.subject !== "string" || typeof obj.body !== "string") {
    throw new Error(`OpenRouter email-draft response missing subject/body: ${raw.slice(0, 200)}`);
  }
  return { subject: obj.subject, body: obj.body };
}

export function quietWeekNarrative(input: {
  clientName: string;
  contactName: string;
  dateRange: string;
}): string {
  // Used when totals are all zero; skips OpenRouter and Puppeteer entirely.
  return [
    `# Highlights`,
    ``,
    `It was a lighter week on ${input.clientName}. The team didn't merge anything user-facing during the week of ${input.dateRange}, and used the time to plan and prepare upcoming work.`,
    ``,
    `# Coming up next`,
    ``,
    `Activity should pick back up next week as in-flight work lands.`,
    ``,
  ].join("\n");
}
