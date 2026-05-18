import { NextResponse } from "next/server";

import { UnauthorizedError, mintOperatorToken } from "@/lib/trigger-tokens";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await mintOperatorToken();
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    throw err;
  }
}
