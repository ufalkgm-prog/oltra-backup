"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function UpdatePasswordView() {
  const supabase = useMemo(() => createClient(), []);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setError(error.message);
      return;
    }

    setMessage("Password updated. You can now return to Members.");
  }

  return (
    <main className="oltra-page">
      <div className="oltra-page__header-bg" />
      <section className="oltra-page__content">
        <div className="oltra-glass oltra-panel" style={{ maxWidth: 560, margin: "40px auto 0" }}>
          <div className="oltra-label">UPDATE PASSWORD</div>

          <form onSubmit={handleSubmit} className="members-form-stack">
            <div className="members-form-field">
              <label className="oltra-label">NEW PASSWORD</label>
              <input
                className="oltra-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <div className="members-form-field">
              <label className="oltra-label">CONFIRM PASSWORD</label>
              <input
                className="oltra-input"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>

            {error ? <div className="members-note">{error}</div> : null}
            {message ? <div className="members-note">{message}</div> : null}

            <button type="submit" className="oltra-button-primary members-action-button">
              Save new password
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}