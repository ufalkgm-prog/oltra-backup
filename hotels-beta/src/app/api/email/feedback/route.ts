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

/* E-MAILED AND STORED (Ulrik, 2026-10-05). The e-mail goes to the SMTP_USER
   mailbox as before, and every submission is also written to member_feedback
   (members project, scripts/members/2026-10-05-member-feedback.sql), with
   `emailed` saying whether the mail went out. The member is told it was
   received when either worked: a row alone is not lost, a mail alone is what
   it always was. Only both failing is an error. */
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

  if (!topic || !TOPIC_LABELS[topic] || !message?.trim()) {
    return NextResponse.json({ ok: false, error: "Topic and message are required" }, { status: 400 });
  }

  const topicLabel = TOPIC_LABELS[topic];
  const senderEmail = user.email ?? "unknown";
  const text = message.trim();

  let emailed = false;
  try {
    await getTransport().sendMail({
      from: `"OLTRA Members" <${process.env.SMTP_USER}>`,
      to: process.env.SMTP_USER,
      replyTo: senderEmail,
      subject: `[${topicLabel}] Member Feedback – OLTRA`,
      text: [`Topic: ${topicLabel}`, `From: ${senderEmail}`, ``, text].join("\n"),
    });
    emailed = true;
  } catch (error) {
    console.error("[feedback] e-mail failed", error);
  }

  const { error: storeError } = await supabase.from("member_feedback").insert({
    user_id: user.id,
    member_email: user.email ?? null,
    topic,
    message: text,
    emailed,
  });
  if (storeError) console.error("[feedback] store failed", storeError.message);

  if (!emailed && storeError) {
    return NextResponse.json({ ok: false, error: "Could not send feedback" }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
