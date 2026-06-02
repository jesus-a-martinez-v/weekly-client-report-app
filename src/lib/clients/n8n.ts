export type DraftPayload = {
  action: "draft";
  to: string;
  subject: string;
  body: string;
  pdf_url?: string;
  filename?: string;
  client_slug: string;
  week_label: string;
};

export type SendPayload = {
  action: "send";
  draft_id: string;
};

export type DiscardPayload = {
  action: "discard";
  draft_id: string;
};

export type N8nPayload = DraftPayload | SendPayload | DiscardPayload;

export type DraftResponse = { draft_id: string; status: "drafted" };
export type SendResponse = { status: "sent" };
export type DiscardResponse = { status: "discarded" };

type N8nResponse<P extends N8nPayload> = P extends DraftPayload
  ? DraftResponse
  : P extends SendPayload
    ? SendResponse
    : DiscardResponse;

export async function postN8n<P extends N8nPayload>(payload: P): Promise<N8nResponse<P>> {
  const url = process.env.N8N_WEBHOOK_URL;
  const secret = process.env.N8N_WEBHOOK_SECRET;
  if (!url) throw new Error("N8N_WEBHOOK_URL is not set");
  if (!secret) throw new Error("N8N_WEBHOOK_SECRET is not set");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": secret,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`n8n webhook ${res.status}: ${txt.slice(0, 500)}`);
  }
  return (await res.json()) as N8nResponse<P>;
}
