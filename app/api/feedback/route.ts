import { NextResponse } from "next/server";

import { createFeedbackEntry, type FeedbackPayload } from "@/lib/feedback";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as FeedbackPayload;

    if (!payload?.message?.trim()) {
      return NextResponse.json({ error: "反馈内容不能为空。" }, { status: 400 });
    }

    if (!payload?.pagePath?.trim()) {
      return NextResponse.json({ error: "当前页面不能为空。" }, { status: 400 });
    }

    const entry = await createFeedbackEntry(payload, request.headers.get("user-agent"));
    return NextResponse.json({ success: true, entry });
  } catch (error) {
    const message = error instanceof Error ? error.message : "反馈提交失败。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
