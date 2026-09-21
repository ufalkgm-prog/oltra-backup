"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

  // ?view=signup opens straight on the sign-up form (the landing intro's
  // "Become a member" links here).
  const [view, setView] = useState<View>(
    searchParams.get("view") === "signup" ? "signup" : "login"
  );
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

  const emailRef = useRef<HTMLInputElement | null>(null);
  const passwordRef = useRef<HTMLInputElement | null>(null);

  const loginEnabled = isValidEmail(email) && password.length > 0;
  // LOG IN stays clickable while incomplete (passive, not disabled): the reason
  // shows on hover, and a click moves focus to the first field still missing.
  const loginBlockedReason = loginEnabled
    ? undefined
    : !email && !password
      ? "Enter your email and password"
      : !isValidEmail(email)
        ? "Enter a valid email"
        : "Enter your password";

  /* The account exists and the confirmation mail is sent. The form comes
     down at that point (Ulrik, 2026-09-21): it used to stay on screen with
     the confirmation crowded under Confirm password, which read as though
     there were still something to fill in. */
  const [signedUp, setSignedUp] = useState(false);

  function goTo(v: View) {
    setError("");
    setMessage("");
    setPassword("");
    setConfirmPassword("");
    setSignedUp(false);
    setView(v);
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!loginEnabled) {
      (isValidEmail(email) ? passwordRef : emailRef).current?.focus();
      return;
    }
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
    /* Where the link in the confirmation mail lands. Without it Supabase uses
       the project's Site URL, which drops the visitor on the landing page with
       a session and nothing to show for it. /auth/callback exchanges the code
       for a session and then sends them to Members — so confirming the address
       logs them in and puts them where their membership is (Ulrik,
       2026-09-21). The same route the Google sign-in uses.

       THE URL MUST BE IN Supabase → Authentication → URL Configuration →
       Redirect URLs, for localhost and for the Vercel domain, or the link
       falls back to the Site URL silently. */
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/members`,
      },
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }

    /* NOT CHECKED HERE: whether this address was already registered.
     *
     * With email confirmation on, Supabase deliberately answers a signup for
     * an existing confirmed address with a decoy user and no error, so that
     * this form cannot be used to discover who has an account — the same
     * reason the forgot-password wording is neutral. A second account is NOT
     * created; the uniqueness is enforced in auth.users.
     *
     * The cost is that someone who already has an account is told to check
     * their email and no mail arrives, so the confirmation screen names the
     * way out for everyone rather than only for them, which would leak the
     * same thing by omission. */
    setSignedUp(true);
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
              {/* noValidate: the browser's own type="email" bubble would
                  pre-empt the passive LOG IN and its focus move. */}
              <form
                onSubmit={handleLogin}
                className="members-form-stack members-login-panel__form"
                noValidate
              >
                <div className="members-form-field">
                  <label className="oltra-label">E-MAIL</label>
                  <input
                    ref={emailRef}
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
                    ref={passwordRef}
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
                    className="oltra-btn"
                    aria-disabled={!loginEnabled}
                    data-reason={loginBlockedReason}
                    disabled={loading}
                  >
                    LOG IN
                  </button>

                  <button
                    type="button"
                    className="oltra-btn members-login-panel__create"
                    onClick={() => goTo("signup")}
                    disabled={loading}
                  >
                    CREATE NEW ACCOUNT
                  </button>
                </div>

                <div className="members-login-panel__oauth">
                  <button
                    type="button"
                    className="oltra-btn oltra-btn--block"
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
          ) : view === "signup" && signedUp ? (
            <>
              <div className="oltra-label members-login-panel__title">CHECK YOUR EMAIL</div>
              <div className="members-form-stack members-login-panel__form">
                <div className="members-note members-note--success">
                  Account created. Follow the link we have sent you to confirm
                  your membership — it will sign you in.
                </div>
                {/* Said to everyone, not only to the visitor whose address was
                    already registered: telling only them would give away who
                    has an account, which is the thing the neutral signup
                    response above exists to protect. */}
                <div className="members-login-panel__hint">
                  If you already have an account, no new mail is sent — log in,
                  or reset your password.
                </div>
                <div className="members-login-panel__top-actions">
                  <button
                    type="button"
                    className="oltra-btn oltra-btn--block"
                    onClick={() => window.location.assign("/")}
                  >
                    OK
                  </button>
                </div>
              </div>
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

                <div className="members-login-panel__top-actions">
                  <button
                    type="submit"
                    className="oltra-btn oltra-btn--block"
                    disabled={loading}
                  >
                    {loading ? "Creating…" : "CREATE ACCOUNT"}
                  </button>

                  <button
                    type="button"
                    className="oltra-btn oltra-btn--block"
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
                    className="oltra-btn oltra-btn--block"
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
                    className="oltra-btn oltra-btn--block"
                    disabled={loading}
                  >
                    {loading ? "Sending…" : "SEND RESET LINK"}
                  </button>

                  <button
                    type="button"
                    className="oltra-btn oltra-btn--block"
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
