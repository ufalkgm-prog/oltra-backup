"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type View = "login" | "signup" | "forgot" | "reset";

function isValidEmail(email: string): boolean {
  const at = email.indexOf("@");
  if (at < 1) return false;
  const domain = email.slice(at + 1);
  const dot = domain.lastIndexOf(".");
  return dot >= 1 && dot < domain.length - 1;
}

function isValidNewPassword(pw: string): boolean {
  return pw.length >= 7 && /[a-zA-Z]/.test(pw) && /[0-9]/.test(pw);
}

export default function LoginView() {
  const supabase = useMemo(() => createClient(), []);
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/members";

  const [view, setView] = useState<View>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  // Arriving from the emailed reset link: Supabase puts a recovery session in
  // place and fires this event, which is the only signal that the visitor is
  // here to set a new password rather than log in.
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setError("");
        setMessage("");
        setPassword("");
        setConfirmPassword("");
        setView("reset");
      }
    });
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  const loginEnabled = isValidEmail(email) && password.length > 0;

  function goTo(v: View) {
    setError("");
    setMessage("");
    setPassword("");
    setConfirmPassword("");
    setView(v);
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!loginEnabled) return;
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    window.location.href = next;
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!isValidEmail(email)) {
      setError("Please enter a valid email address.");
      return;
    }
    if (!isValidNewPassword(password)) {
      setError("Password must be at least 7 characters and include both letters and numbers.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setMessage("Account created. Please check your email to confirm before logging in.");
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    if (!isValidEmail(email)) {
      setError("Please enter a valid email address.");
      return;
    }

    // Supabase sends this itself - no server function needed, which is what
    // the old "deferred until deployment" placeholder was waiting for. The
    // link returns here with a recovery session; see the PASSWORD_RECOVERY
    // listener below, which switches to the set-a-new-password view.
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    });
    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    // Deliberately does not confirm whether the address is registered.
    setMessage(
      "If an account exists for this address, a reset link is on its way. Check your spam folder too."
    );
  }

  async function handleSetNewPassword(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!isValidNewPassword(password)) {
      setError("Password must be at least 7 characters and include letters and numbers.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    setMessage("Password updated.");
    window.location.assign(next);
  }

  async function handleOAuth() {
    setLoading(true);
    setError("");
    const origin = window.location.origin;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
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
          {view === "login" ? (
            <>
              <div className="oltra-label members-login-panel__title">MEMBERS LOGIN</div>
              <form onSubmit={handleLogin} className="members-form-stack members-login-panel__form">
                <div className="members-form-field">
                  <label className="oltra-label">E-MAIL</label>
                  <input
                    className="oltra-input"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                  />
                </div>

                <div className="members-form-field">
                  <label className="oltra-label">PASSWORD</label>
                  <input
                    className="oltra-input"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                  />
                </div>

                {error ? <div className="members-note members-note--error">{error}</div> : null}

                <div className="members-login-panel__top-actions">
                  <button
                    type="submit"
                    className={`${loginEnabled ? "oltra-button-primary" : "oltra-button-secondary members-login-panel__inactive"} members-action-button members-login-panel__login`}
                    disabled={loading || !loginEnabled}
                  >
                    LOG IN
                  </button>

                  <button
                    type="button"
                    className="oltra-button-primary members-action-button members-login-panel__create"
                    onClick={() => goTo("signup")}
                    disabled={loading}
                  >
                    CREATE NEW ACCOUNT
                  </button>
                </div>

                <div className="members-login-panel__oauth">
                  <button
                    type="button"
                    className="oltra-button-primary members-action-button"
                    onClick={handleOAuth}
                    disabled={loading}
                  >
                    CONTINUE WITH GOOGLE
                  </button>
                </div>

                <div className="members-login-panel__footer">
                  <button
                    type="button"
                    className="members-login-panel__forgot"
                    onClick={() => goTo("forgot")}
                  >
                    Forgot password
                  </button>
                </div>
              </form>
            </>
          ) : view === "signup" ? (
            <>
              <div className="oltra-label members-login-panel__title">CREATE ACCOUNT</div>
              <form onSubmit={handleSignup} className="members-form-stack members-login-panel__form">
                <div className="members-form-field">
                  <label className="oltra-label">E-MAIL</label>
                  <input
                    className="oltra-input"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                  />
                </div>

                <div className="members-form-field">
                  <label className="oltra-label">PASSWORD</label>
                  <input
                    className="oltra-input"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                  <div className="members-login-panel__hint">
                    Minimum 7 characters, must include letters and numbers
                  </div>
                </div>

                <div className="members-form-field">
                  <label className="oltra-label">CONFIRM PASSWORD</label>
                  <input
                    className="oltra-input"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                </div>

                {error ? <div className="members-note members-note--error">{error}</div> : null}
                {message ? <div className="members-note members-note--success">{message}</div> : null}

                <div className="members-login-panel__top-actions">
                  <button
                    type="submit"
                    className="oltra-button-primary members-action-button"
                    disabled={loading}
                  >
                    {loading ? "Creating…" : "CREATE ACCOUNT"}
                  </button>

                  <button
                    type="button"
                    className="oltra-button-secondary members-action-button"
                    onClick={() => goTo("login")}
                    disabled={loading}
                  >
                    BACK TO LOG IN
                  </button>
                </div>
              </form>
            </>
          ) : view === "reset" ? (
            <>
              <div className="oltra-label members-login-panel__title">SET A NEW PASSWORD</div>
              <form onSubmit={handleSetNewPassword} className="members-form-stack members-login-panel__form">
                <div className="members-form-field">
                  <label className="oltra-label">NEW PASSWORD</label>
                  <input
                    className="oltra-input"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                </div>

                <div className="members-form-field">
                  <label className="oltra-label">CONFIRM NEW PASSWORD</label>
                  <input
                    className="oltra-input"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                </div>

                {error ? <div className="members-note members-note--error">{error}</div> : null}
                {message ? <div className="members-note members-note--success">{message}</div> : null}

                <div className="members-login-panel__top-actions">
                  <button
                    type="submit"
                    className="oltra-button-primary members-action-button"
                    disabled={loading}
                  >
                    {loading ? "Saving…" : "SAVE PASSWORD"}
                  </button>
                </div>
              </form>
            </>
          ) : (
            <>
              <div className="oltra-label members-login-panel__title">FORGOT PASSWORD</div>
              <form onSubmit={handleForgotPassword} className="members-form-stack members-login-panel__form">
                <div className="members-form-field">
                  <label className="oltra-label">E-MAIL</label>
                  <input
                    className="oltra-input"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                  />
                </div>

                {error ? <div className="members-note members-note--error">{error}</div> : null}
                {message ? <div className="members-note members-note--success">{message}</div> : null}

                <div className="members-login-panel__top-actions">
                  <button
                    type="submit"
                    className="oltra-button-primary members-action-button"
                    disabled={loading}
                  >
                    {loading ? "Sending…" : "SEND RESET LINK"}
                  </button>

                  <button
                    type="button"
                    className="oltra-button-secondary members-action-button"
                    onClick={() => goTo("login")}
                    disabled={loading}
                  >
                    BACK TO LOG IN
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
