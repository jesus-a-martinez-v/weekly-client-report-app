import fs from "node:fs/promises";
import path from "node:path";

import type { ClientActivity } from "@/lib/activity/types";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

let _promptCache: string | null = null;

async function loadNarrativePrompt(): Promise<string> {
  if (_promptCache) return _promptCache;
  if (process.env.NARRATIVE_PROMPT) {
    _promptCache = process.env.NARRATIVE_PROMPT;
    return _promptCache;
  }
  if (process.env.NARRATIVE_PROMPT_BASE64) {
    _promptCache = Buffer.from(
      process.env.NARRATIVE_PROMPT_BASE64,
      "base64",
    ).toString("utf8");
    return _promptCache;
  }
  if (process.env.NARRATIVE_PROMPT_PATH) {
    _promptCache = await fs.readFile(process.env.NARRATIVE_PROMPT_PATH, "utf-8");
    return _promptCache;
  }
  if (
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL ||
    process.env.TRIGGER_SECRET_KEY
  ) {
    throw new Error(
      "NARRATIVE_PROMPT or NARRATIVE_PROMPT_BASE64 is required in deployed environments",
    );
  }
  const promptPath =
    path.join(process.cwd(), "src/prompts/narrative.example.md");
  _promptCache = await fs.readFile(promptPath, "utf-8");
  return _promptCache;
}

// Per-call-site model selection. Generation (narrative) gets the stronger,
// pricier model; the short client email and the synchronous revise use the
// cheaper/faster one. Each is env-overridable; defaults are authoritative so
// behavior is correct even before env vars propagate to Vercel/Trigger.dev.
const DEFAULT_NARRATIVE_MODEL = "deepseek/deepseek-v4-pro";
const DEFAULT_EMAIL_MODEL = "deepseek/deepseek-v4-flash";
const DEFAULT_REVISION_MODEL = "deepseek/deepseek-v4-flash";
const DEFAULT_DAILY_SUMMARY_MODEL = "deepseek/deepseek-v4-flash";

function narrativeModel(): string {
  return process.env.OPENROUTER_MODEL_NARRATIVE || DEFAULT_NARRATIVE_MODEL;
}

function emailModel(): string {
  return process.env.OPENROUTER_MODEL_EMAIL || DEFAULT_EMAIL_MODEL;
}

function revisionModel(): string {
  return process.env.OPENROUTER_MODEL_REVISION || DEFAULT_REVISION_MODEL;
}

function dailySummaryModel(): string {
  return process.env.OPENROUTER_MODEL_DAILY || DEFAULT_DAILY_SUMMARY_MODEL;
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
    .replace("{{SOURCE}}", input.activity.source)
    .replace("{{ACTIVITY_JSON}}", JSON.stringify(input.activity, null, 2))
    // Belt-and-braces: the template references CLIENT_NAME a second time in the data section.
    .replace("{{CLIENT_NAME}}", input.clientName);

  return chat({
    model: narrativeModel(),
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
- Write in the first person singular ("I", "me"). Never use "we", "us", "our", or "the team".
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
    model: emailModel(),
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
  } catch (parseErr) {
    // Fallback: strip code fences if the model wrapped JSON in them despite json mode.
    const stripped = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    try {
      parsed = JSON.parse(stripped);
    } catch (fallbackErr) {
      throw new Error("OpenRouter email-draft response was not valid JSON", {
        cause: fallbackErr instanceof Error ? fallbackErr : parseErr,
      });
    }
  }
  const obj = parsed as { subject?: unknown; body?: unknown };
  if (typeof obj.subject !== "string" || typeof obj.body !== "string") {
    throw new Error(`OpenRouter email-draft response missing subject/body: ${raw.slice(0, 200)}`);
  }
  return { subject: obj.subject, body: obj.body };
}

export type ReviseNarrativeInput = {
  clientName: string;
  currentNarrative: string;
  instructions: string;
};

export async function reviseNarrative(input: ReviseNarrativeInput): Promise<string> {
  const systemPrompt =
    "You are editing a client-facing weekly status report narrative written in Markdown. " +
    "Apply the requested changes precisely. Return only the revised Markdown — no commentary, no code fences.";

  const userPrompt =
    `CLIENT: ${input.clientName}\n\n` +
    `CURRENT NARRATIVE:\n${input.currentNarrative}\n\n` +
    `INSTRUCTIONS:\n${input.instructions}`;

  const result = await chat({
    model: revisionModel(),
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "text" },
  });

  return result.trim();
}

export type DailySummaryInput = {
  clientName: string;
  dateLabel: string;
  activity: ClientActivity;
};

export type DailySummary = { summary: string; hoursEstimate: number };

const DAILY_SUMMARY_SYSTEM_PROMPT = `You write a very short daily work summary for an internal time-tracking tool.

Given a day's activity for a client, write:
1. A "summary" field: plain text, extremely concise.
   - Single project: 2–3 sentences total. No more.
   - Multiple projects: one line per project, prefixed with the project name in square brackets, e.g. "[Project A] Did X and Y. [Project B] Did Z."
   Focus on outcomes, not mechanics. No Markdown, no bullet points, no headers.
2. A "hoursEstimate" field: a single number (decimal OK) estimating hours worked.

Calibration anchors:
- Small commit ≈ 0.25 h · substantial merged PR ≈ 1–3 h · closed ticket ≈ 0.5–2 h · review/comment thread ≈ 0.25 h
- Cap at 8 h; do not exceed 10 h unless the evidence is overwhelming

Rules:
- Output JSON only: { "summary": "...", "hoursEstimate": 0.0 }
- Do not mention the client's name or specific people
- If truly no meaningful activity: summary = "No significant activity recorded for this day.", hoursEstimate = 0`;

export async function generateDailySummary(input: DailySummaryInput): Promise<DailySummary> {
  const userPrompt =
    `CLIENT: ${input.clientName}\n` +
    `DATE: ${input.dateLabel}\n\n` +
    `ACTIVITY:\n${JSON.stringify(input.activity, null, 2)}`;

  const raw = await chat({
    model: dailySummaryModel(),
    messages: [
      { role: "system", content: DAILY_SUMMARY_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    reasoning: { effort: "low" },
    response_format: { type: "json_object" },
    temperature: 0.3,
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (parseErr) {
    const stripped = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    try {
      parsed = JSON.parse(stripped);
    } catch (fallbackErr) {
      throw new Error("OpenRouter daily-summary response was not valid JSON", {
        cause: fallbackErr instanceof Error ? fallbackErr : parseErr,
      });
    }
  }
  const obj = parsed as { summary?: unknown; hoursEstimate?: unknown };
  if (typeof obj.summary !== "string" || typeof obj.hoursEstimate !== "number") {
    throw new Error(`OpenRouter daily-summary response missing summary/hoursEstimate: ${raw.slice(0, 200)}`);
  }
  return { summary: obj.summary, hoursEstimate: obj.hoursEstimate };
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
    `It was a lighter week on ${input.clientName}. I didn't ship anything user-facing during the week of ${input.dateRange}, and used the time to plan and prepare upcoming work.`,
    ``,
    `# Coming up next`,
    ``,
    `Activity should pick back up next week as in-flight work lands.`,
    ``,
  ].join("\n");
}
