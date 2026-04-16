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
<main className="oltra-page members-login-page">
  <div className="oltra-page__bg" />
  <div className="oltra-page__header-bg" />
    <section className="oltra-page__content">
      <div
        className="oltra-glass oltra-panel members-login-panel"
        style={{ maxWidth: 560, margin: "40px auto 0" }}
      >
        <div className="oltra-label members-login-panel__title">MEMBERS LOGIN</div>

        <form onSubmit={handlePasswordAuth} className="members-form-stack members-login-panel__form">
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

          <div className="members-login-panel__top-actions">
            <button
              type="submit"
              className="oltra-button-primary members-action-button members-login-panel__login"
              disabled={loading}
            >
              LOG IN
            </button>

            <button
              type="button"
              className="oltra-button-secondary members-action-button members-login-panel__create"
              onClick={() => setMode("signup")}
              disabled={loading}
            >
              CREATE NEW ACCOUNT
            </button>
          </div>

          <div className="members-login-panel__oauth">
            <button
              type="button"
              className="oltra-button-secondary members-action-button"
              onClick={() => handleOAuth("google")}
              disabled={loading}
            >
              CONTINUE WITH GOOGLE
            </button>

            <button
              type="button"
              className="oltra-button-secondary members-action-button"
              onClick={() => handleOAuth("facebook")}
              disabled={loading}
            >
              CONTINUE WITH FACEBOOK
            </button>
          </div>

          <div className="members-login-panel__footer">
            <a href="/forgot-password" className="members-login-panel__forgot">
              Forgot password
            </a>
          </div>
        </form>
      </div>
    </section>
  </main>
);
}