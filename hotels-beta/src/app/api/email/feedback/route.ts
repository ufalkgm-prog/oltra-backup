import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { createClient } from "@/lib/supabase/server";

const TOPIC_LABELS: Record<string, string> = {
  "suggest-hotel": "Suggest Hotel",
  "suggest-restaurant": "Suggest Restaurant",
  general: "General Suggestions / Comments",
};

function getTransport() {
  return nodemailer.createTransport({
    host: "smtpout.secureserver.net",
    port: 465,
    secure: true,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }

  let body: { topic: string; message: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  const { topic, message } = body;

  if (!topic || !message?.trim()) {
    return NextResponse.json({ ok: false, error: "Topic and message are required" }, { status: 400 });
  }

  const topicLabel = TOPIC_LABELS[topic] ?? topic;
  const senderEmail = user.email ?? "unknown";

  const transport = getTransport();

  await transport.sendMail({
    from: `"OLTRA Members" <${process.env.SMTP_USER}>`,
    to: process.env.SMTP_USER,
    replyTo: senderEmail,
    subject: `[${topicLabel}] Member Feedback – OLTRA`,
    text: [
      `Topic: ${topicLabel}`,
      `From: ${senderEmail}`,
      ``,
      message.trim(),
    ].join("\n"),
  });

  return NextResponse.json({ ok: true });
}
