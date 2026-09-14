"use client";

import { useRef, useState } from "react";
import OltraSelect from "@/components/site/OltraSelect";

const TOPIC_OPTIONS = [
  { value: "suggest-hotel", label: "Suggest hotel" },
  { value: "suggest-restaurant", label: "Suggest restaurant" },
  { value: "general", label: "General suggestions/comments" },
];

const MIN_MESSAGE_LENGTH = 20;

export default function FeedbackSuggestView() {
  const [topic, setTopic] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const topicFieldRef = useRef<HTMLDivElement | null>(null);
  const messageRef = useRef<HTMLTextAreaElement | null>(null);

  // The first thing still missing, which is what Send's hover reason names and
  // where a click on the passive Send moves focus.
  const missing = !topic
    ? "topic"
    : message.trim().length < MIN_MESSAGE_LENGTH
      ? "message"
      : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (missing === "topic") {
      topicFieldRef.current?.querySelector("button")?.focus();
      return;
    }
    if (missing === "message") {
      messageRef.current?.focus();
      return;
    }

    try {
      setIsSubmitting(true);
      setStatusMessage("");
      setErrorMessage("");

      const res = await fetch("/api/email/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, message }),
      });

      if (!res.ok) throw new Error("send failed");

      setMessage("");
      setStatusMessage("Feedback / suggestion submitted.");
    } catch {
      setErrorMessage("Could not submit feedback / suggestion.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="oltra-glass members-section">
      {/* noValidate: the browser's own "fill out this field" bubble would jump
          ahead of the passive Send and focus the wrong field. */}
      <form className="members-form-stack" onSubmit={handleSubmit} noValidate>
        <div
          ref={topicFieldRef}
          className="members-form-field members-form-field--quarter"
        >
          <label className="oltra-label">TOPIC</label>
          <OltraSelect
            name="feedbackTopic"
            value={topic}
            placeholder="Select topic"
            options={TOPIC_OPTIONS}
            align="left"
            onValueChange={setTopic}
          />
        </div>

        <div className="members-form-field">
          <label className="oltra-label">MESSAGE</label>
          <textarea
            ref={messageRef}
            className="oltra-textarea members-textarea"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Write your suggestion or feedback here"
            required
          />
        </div>

        {errorMessage || statusMessage ? (
          <div className="members-note">{errorMessage || statusMessage}</div>
        ) : null}

        <div className="members-form-actions">
          <button
            type="submit"
            className="oltra-btn"
            aria-disabled={Boolean(missing)}
            data-reason={
              missing === "topic"
                ? "Choose a topic to continue"
                : missing === "message"
                  ? `Write at least ${MIN_MESSAGE_LENGTH} characters to continue`
                  : undefined
            }
            disabled={isSubmitting}
          >
            {isSubmitting ? "Sending..." : "Send"}
          </button>
        </div>
      </form>
    </section>
  );
}
