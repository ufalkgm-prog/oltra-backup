"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginView() {
  const supabase = useMemo(() => createClient(), []);
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/members";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handlePasswordAuth(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    const action =
      mode === "login"
        ? supabase.auth.signInWithPassword({ email, password })
        : supabase.auth.signUp({ email, password });

    const { error } = await action;

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    window.location.href = next;
  }

  async function handleOAuth(provider: "google" | "facebook") {
    setLoading(true);
    setError("");

    const origin = window.location.origin;

    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    }
  }

  return (
    <main className="oltra-page">
      <div className="oltra-page__header-bg" />
      <section className="oltra-page__content">
        <div className="oltra-glass oltra-panel" style={{ maxWidth: 560, margin: "40px auto 0" }}>
          <div className="oltra-label">MEMBERS LOGIN</div>

          <form onSubmit={handlePasswordAuth} className="members-form-stack">
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

            <div className="members-form-field">
              <label className="oltra-label">PASSWORD</label>
              <input
                className="oltra-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {error ? <div className="members-note">{error}</div> : null}
            {message ? <div className="members-note">{message}</div> : null}

            <div className="members-item__actions">
              <button type="submit" className="oltra-button-primary members-action-button" disabled={loading}>
                {mode === "login" ? "Log in" : "Create account"}
              </button>

              <button
                type="button"
                className="oltra-button-secondary members-action-button"
                onClick={() => setMode((prev) => (prev === "login" ? "signup" : "login"))}
                disabled={loading}
              >
                {mode === "login" ? "Create account" : "Use existing account"}
              </button>
            </div>

            <div className="members-item__actions">
              <button
                type="button"
                className="oltra-button-secondary members-action-button"
                onClick={() => handleOAuth("google")}
                disabled={loading}
              >
                Continue with Google
              </button>

              <button
                type="button"
                className="oltra-button-secondary members-action-button"
                onClick={() => handleOAuth("facebook")}
                disabled={loading}
              >
                Continue with Facebook
              </button>
            </div>

            <a href="/forgot-password" className="members-nav__item" style={{ borderTop: 0, paddingTop: 0 }}>
              Forgot password
            </a>
          </form>
        </div>
      </section>
    </main>
  );
}