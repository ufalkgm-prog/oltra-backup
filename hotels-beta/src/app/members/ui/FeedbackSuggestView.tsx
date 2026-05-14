"use client";

import { useState } from "react";
import OltraSelect from "@/components/site/OltraSelect";

const TOPIC_OPTIONS = [
  { value: "suggest-hotel", label: "Suggest hotel" },
  { value: "suggest-restaurant", label: "Suggest restaurant" },
  { value: "general", label: "General suggestions/comments" },
];

export default function FeedbackSuggestView() {
  const [topic, setTopic] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

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
      <form className="members-form-stack" onSubmit={handleSubmit}>
        <div className="members-form-field members-form-field--quarter">
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
            className="oltra-button-primary members-action-button"
            disabled={isSubmitting || !topic}
          >
            {isSubmitting ? "Sending..." : "Send"}
          </button>
        </div>
      </form>
    </section>
  );
}