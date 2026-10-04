/* The rules for an e-mail and a new password - one copy for the login page and
 * Personal Information, so signing up and changing the e-mail cannot disagree. */

export function isValidEmail(email: string): boolean {
  const at = email.indexOf("@");
  if (at < 1) return false;
  const domain = email.slice(at + 1);
  const dot = domain.lastIndexOf(".");
  return dot >= 1 && dot < domain.length - 1;
}

export function isValidNewPassword(pw: string): boolean {
  return pw.length >= 7 && /[a-zA-Z]/.test(pw) && /[0-9]/.test(pw);
}

export const NEW_PASSWORD_RULE =
  "Password must be at least 7 characters and include both letters and numbers.";

/* A consumer Google address, which "Continue with Google" can sign in with.
 * A company domain run on Google Workspace can too, but nothing here can tell,
 * so those are treated like any other address and get a password. */
export function isGmailAddress(email: string): boolean {
  return /@(gmail|googlemail)\.com$/i.test(email.trim());
}
