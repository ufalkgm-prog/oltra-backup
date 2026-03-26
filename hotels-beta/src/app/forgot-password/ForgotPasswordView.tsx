"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordView() {
  const supabase = useMemo(() => createClient(), []);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    setError("");

    const origin = window.location.origin;

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/update-password`,
    });

    if (error) {
      setError(error.message);
      return;
    }

    setMessage("Password reset email sent.");
  }

  return (
    <main className="oltra-page">
      <div className="oltra-page__header-bg" />
      <section className="oltra-page__content">
        <div className="oltra-glass oltra-panel" style={{ maxWidth: 560, margin: "40px auto 0" }}>
          <div className="oltra-label">FORGOT PASSWORD</div>

          <form onSubmit={handleSubmit} className="members-form-stack">
            <div className="members-form-field">
              <label className="oltra-label">E-MAIL</label>
              <input
                className="oltra-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            {error ? <div className="members-note">{error}</div> : null}
            {message ? <div className="members-note">{message}</div> : null}

            <button type="submit" className="oltra-button-primary members-action-button">
              Send reset link
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}