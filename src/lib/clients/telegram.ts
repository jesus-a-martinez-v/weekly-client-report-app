const TG_API = "https://api.telegram.org";

export type ReminderItem = {
  reportId: string;
  clientName: string;
  weekLabel: string;
  hoursOld: number;
};

function token(): string {
  const t = process.env.TELEGRAM_BOT_TOKEN;
  if (!t) throw new Error("TELEGRAM_BOT_TOKEN is not set");
  return t;
}

function chatId(): string {
  const c = process.env.TELEGRAM_CHAT_ID;
  if (!c) throw new Error("TELEGRAM_CHAT_ID is not set");
  return c;
}

function appBaseUrl(): string {
  const url = process.env.APP_BASE_URL;
  if (url) return url.replace(/\/$/, "");
  if (process.env.NODE_ENV !== "production") return "http://localhost:3000";
  throw new Error("APP_BASE_URL is required outside local development");
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export type DigestSummary = {
  drafted: number;
  quiet: number;
  errors: number;
};

export type SendDigestInput = {
  weekLabel: string;
  summary: DigestSummary;
};

export async function sendDigestMessage(input: SendDigestInput): Promise<void> {
  const reviewUrl = `${appBaseUrl()}/reports?week=${encodeURIComponent(input.weekLabel)}`;
  const total = input.summary.drafted + input.summary.quiet + input.summary.errors;

  const lines = [
    `<b>Weekly drafts ready, ${escapeHtml(input.weekLabel)}</b>`,
    `${input.summary.drafted} drafts · ${input.summary.quiet} quiet · ${input.summary.errors} errors (${total} clients)`,
    `Review: ${escapeHtml(reviewUrl)}`,
  ];

  const res = await fetch(`${TG_API}/bot${token()}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId(),
      text: lines.join("\n"),
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Telegram sendMessage ${res.status}: ${txt.slice(0, 300)}`);
  }
}

export async function sendDraftedReminderMessage(
  items: ReminderItem[],
): Promise<void> {
  if (items.length === 0) return;

  const base = appBaseUrl();
  const lines = [
    `<b>Drafts awaiting review (${items.length})</b>`,
    ...items.map(
      (item) =>
        `• ${escapeHtml(item.clientName)} · ${escapeHtml(item.weekLabel)} · ${item.hoursOld}h — ${escapeHtml(`${base}/reports/${item.reportId}`)}`,
    ),
  ];

  const res = await fetch(`${TG_API}/bot${token()}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId(),
      text: lines.join("\n"),
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Telegram sendMessage ${res.status}: ${txt.slice(0, 300)}`);
  }
}
