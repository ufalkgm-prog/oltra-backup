"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { submitFeedbackSuggestionBrowser } from "@/lib/members/db";

export default function FeedbackSuggestView() {
  const [topic, setTopic] = useState("suggest-hotel");
  const [message, setMessage] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [isLoadingSender, setIsLoadingSender] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function loadUser() {
      try {
        setIsLoadingSender(true);
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!active) return;
        setSenderEmail(user?.email ?? "");
      } finally {
        if (active) setIsLoadingSender(false);
      }
    }

    loadUser();

    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    try {
      setIsSubmitting(true);
      setStatusMessage("");
      setErrorMessage("");

      await submitFeedbackSuggestionBrowser({
        topic,
        senderEmail,
        message,
      });

      setMessage("");
      setStatusMessage("Feedback / suggestion submitted.");
    } catch (error) {
      setErrorMessage("Could not submit feedback / suggestion.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="oltra-glass members-section">
      <form className="members-form-stack" onSubmit={handleSubmit}>
        <div className="members-form-field">
          <label className="oltra-label">TOPIC</label>
          <select
            className="oltra-select"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          >
            <option value="suggest-hotel">Suggest hotel</option>
            <option value="suggest-restaurant">Suggest restaurant</option>
            <option value="general">General suggestions/comments</option>
          </select>
        </div>

        <div className="members-form-field">
          <label className="oltra-label">SENDER</label>
          <input
            className="oltra-input"
            value={senderEmail}
            readOnly
            disabled={isLoadingSender}
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

        <div className="members-note">
          This form is stored in Supabase now. E-mail sending to info@algoville.com can be added in the next phase.
        </div>

        {(errorMessage || statusMessage) ? (
          <div className="members-note">
            {errorMessage || statusMessage}
          </div>
        ) : null}

        <div className="members-form-actions">
          <button
            type="submit"
            className="oltra-button-primary members-action-button"
            disabled={isSubmitting || isLoadingSender}
          >
            {isSubmitting ? "Sending..." : "Send"}
          </button>
        </div>
      </form>
    </section>
  );
}