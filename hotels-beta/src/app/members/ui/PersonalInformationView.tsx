"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import OltraSelect from "@/components/site/OltraSelect";
import AirportAutocomplete from "@/app/flights/ui/AirportAutocomplete";
import { DEFAULT_MEMBER_PROFILE } from "@/lib/members/defaults";
import type { MemberBirthday, MemberProfile } from "@/lib/members/types";
import {
  EmailChangeError,
  fetchLoginEmailStateBrowser,
  fetchMemberProfileBrowser,
  requestLoginEmailChangeBrowser,
  saveMemberProfileBrowser,
  type LoginEmailState,
} from "@/lib/members/db";
import { createClient } from "@/lib/supabase/client";
import {
  isGmailAddress,
  isValidEmail,
  isValidNewPassword,
  NEW_PASSWORD_RULE,
} from "@/lib/members/credentials";
import { useDropdownDismiss } from "@/lib/useDropdownDismiss";

type Option = {
  value: string;
  label: string;
};

const MAX_FAMILY_MEMBERS = 10;


const PREFERRED_AIRLINE_OPTIONS: Option[] = [
  { value: "Air France", label: "Air France" },
  { value: "Air New Zealand", label: "Air New Zealand" },
  { value: "ANA", label: "ANA" },
  { value: "American Airlines", label: "American Airlines" },
  { value: "Austrian Airlines", label: "Austrian Airlines" },
  { value: "British Airways", label: "British Airways" },
  { value: "Cathay Pacific", label: "Cathay Pacific" },
  { value: "Delta Air Lines", label: "Delta Air Lines" },
  { value: "Emirates", label: "Emirates" },
  { value: "Etihad Airways", label: "Etihad Airways" },
  { value: "Finnair", label: "Finnair" },
  { value: "Iberia", label: "Iberia" },
  { value: "Japan Airlines", label: "Japan Airlines" },
  { value: "KLM", label: "KLM" },
  { value: "Korean Air", label: "Korean Air" },
  { value: "Lufthansa", label: "Lufthansa" },
  { value: "Qantas", label: "Qantas" },
  { value: "Qatar Airways", label: "Qatar Airways" },
  { value: "SAS", label: "SAS" },
  { value: "Singapore Airlines", label: "Singapore Airlines" },
  { value: "Swiss", label: "Swiss" },
  { value: "Turkish Airlines", label: "Turkish Airlines" },
  { value: "United Airlines", label: "United Airlines" },
  { value: "Virgin Atlantic", label: "Virgin Atlantic" },
];

const COUNTRY_CODE_OPTIONS: Option[] = [
  { value: "+1", label: "+1 · US / CA" },
  { value: "+7", label: "+7 · RU" },
  { value: "+20", label: "+20 · EG" },
  { value: "+27", label: "+27 · ZA" },
  { value: "+30", label: "+30 · GR" },
  { value: "+31", label: "+31 · NL" },
  { value: "+32", label: "+32 · BE" },
  { value: "+33", label: "+33 · FR" },
  { value: "+34", label: "+34 · ES" },
  { value: "+36", label: "+36 · HU" },
  { value: "+39", label: "+39 · IT" },
  { value: "+40", label: "+40 · RO" },
  { value: "+41", label: "+41 · CH" },
  { value: "+43", label: "+43 · AT" },
  { value: "+44", label: "+44 · GB" },
  { value: "+45", label: "+45 · DK" },
  { value: "+46", label: "+46 · SE" },
  { value: "+47", label: "+47 · NO" },
  { value: "+48", label: "+48 · PL" },
  { value: "+49", label: "+49 · DE" },
  { value: "+51", label: "+51 · PE" },
  { value: "+52", label: "+52 · MX" },
  { value: "+54", label: "+54 · AR" },
  { value: "+55", label: "+55 · BR" },
  { value: "+56", label: "+56 · CL" },
  { value: "+57", label: "+57 · CO" },
  { value: "+60", label: "+60 · MY" },
  { value: "+61", label: "+61 · AU" },
  { value: "+62", label: "+62 · ID" },
  { value: "+63", label: "+63 · PH" },
  { value: "+64", label: "+64 · NZ" },
  { value: "+65", label: "+65 · SG" },
  { value: "+66", label: "+66 · TH" },
  { value: "+81", label: "+81 · JP" },
  { value: "+82", label: "+82 · KR" },
  { value: "+84", label: "+84 · VN" },
  { value: "+86", label: "+86 · CN" },
  { value: "+90", label: "+90 · TR" },
  { value: "+91", label: "+91 · IN" },
  { value: "+92", label: "+92 · PK" },
  { value: "+94", label: "+94 · LK" },
  { value: "+212", label: "+212 · MA" },
  { value: "+213", label: "+213 · DZ" },
  { value: "+216", label: "+216 · TN" },
  { value: "+230", label: "+230 · MU" },
  { value: "+234", label: "+234 · NG" },
  { value: "+254", label: "+254 · KE" },
  { value: "+255", label: "+255 · TZ" },
  { value: "+351", label: "+351 · PT" },
  { value: "+352", label: "+352 · LU" },
  { value: "+353", label: "+353 · IE" },
  { value: "+354", label: "+354 · IS" },
  { value: "+358", label: "+358 · FI" },
  { value: "+359", label: "+359 · BG" },
  { value: "+370", label: "+370 · LT" },
  { value: "+371", label: "+371 · LV" },
  { value: "+372", label: "+372 · EE" },
  { value: "+380", label: "+380 · UA" },
  { value: "+385", label: "+385 · HR" },
  { value: "+386", label: "+386 · SI" },
  { value: "+420", label: "+420 · CZ" },
  { value: "+421", label: "+421 · SK" },
  { value: "+852", label: "+852 · HK" },
  { value: "+855", label: "+855 · KH" },
  { value: "+880", label: "+880 · BD" },
  { value: "+886", label: "+886 · TW" },
  { value: "+960", label: "+960 · MV" },
  { value: "+961", label: "+961 · LB" },
  { value: "+962", label: "+962 · JO" },
  { value: "+966", label: "+966 · SA" },
  { value: "+971", label: "+971 · AE" },
  { value: "+972", label: "+972 · IL" },
  { value: "+973", label: "+973 · BH" },
  { value: "+974", label: "+974 · QA" },
  { value: "+975", label: "+975 · BT" },
  { value: "+977", label: "+977 · NP" },
  { value: "+994", label: "+994 · AZ" },
  { value: "+995", label: "+995 · GE" },
  { value: "+998", label: "+998 · UZ" },
];

const DAY_OPTIONS: Option[] = Array.from({ length: 31 }, (_, index) => {
  const value = String(index + 1);
  return { value, label: value };
});

const MONTH_OPTIONS: Option[] = [
  { value: "Jan", label: "Jan" },
  { value: "Feb", label: "Feb" },
  { value: "Mar", label: "Mar" },
  { value: "Apr", label: "Apr" },
  { value: "May", label: "May" },
  { value: "Jun", label: "Jun" },
  { value: "Jul", label: "Jul" },
  { value: "Aug", label: "Aug" },
  { value: "Sep", label: "Sep" },
  { value: "Oct", label: "Oct" },
  { value: "Nov", label: "Nov" },
  { value: "Dec", label: "Dec" },
];

// A stored profile value is either already a IATA code or free text from an
// older save. The full airport dataset is no longer imported here (it is ~4k
// entries, loaded on demand by AirportAutocomplete), so free text is left
// as-is for the user to re-pick rather than fuzzily matched.
function normalizeAirportValue(value: string): string {
  const raw = value.trim();
  if (!raw) return "";
  return /^[a-z]{3}$/i.test(raw) ? raw.toUpperCase() : raw;
}

function parsePhone(phone: string): { code: string; number: string } {
  const raw = phone.trim();
  if (raw.startsWith("+")) {
    const spaceIdx = raw.indexOf(" ");
    if (spaceIdx > 0) {
      return { code: raw.slice(0, spaceIdx), number: raw.slice(spaceIdx + 1) };
    }
    return { code: raw, number: "" };
  }
  return { code: "", number: raw };
}

function normalizeMemberProfile(profile: MemberProfile): MemberProfile {
  return {
    ...profile,
    homeAirport: normalizeAirportValue(profile.homeAirport),
  };
}

function parseMultiValue(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function stringifyMultiValue(values: string[]): string {
  return values.join(", ");
}

function birthdaysEqual(a: MemberBirthday, b: MemberBirthday) {
  return a.day === b.day && a.month === b.month && a.year === b.year;
}

function profilesEqual(a: MemberProfile, b: MemberProfile) {
  if (
    a.memberName !== b.memberName ||
    a.email !== b.email ||
    a.phone !== b.phone ||
    a.homeAirport !== b.homeAirport ||
    a.preferredAirline !== b.preferredAirline ||
    a.marketingEmailsOptIn !== b.marketingEmailsOptIn ||
    !birthdaysEqual(a.birthday, b.birthday) ||
    a.familyMembers.length !== b.familyMembers.length
  ) {
    return false;
  }

  return a.familyMembers.every((member, index) => {
    const other = b.familyMembers[index];

    return (
      member.id === other.id &&
      member.fullName === other.fullName &&
      birthdaysEqual(member.birthday, other.birthday)
    );
  });
}

export default function PersonalInformationView() {
  const [profile, setProfile] = useState<MemberProfile>(() =>
    normalizeMemberProfile(DEFAULT_MEMBER_PROFILE)
  );
  const [savedProfile, setSavedProfile] = useState<MemberProfile>(() =>
    normalizeMemberProfile(DEFAULT_MEMBER_PROFILE)
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [showLeavePrompt, setShowLeavePrompt] = useState(false);
  const [showTerminatePrompt, setShowTerminatePrompt] = useState(false);
  const [loginEmail, setLoginEmail] = useState<LoginEmailState | null>(null);
  /* Asked for only while the e-mail is being changed, and never saved here:
     the current password confirms the change, the new one (a Google-only
     member) becomes their password. */
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const pendingHrefRef = useRef<string | null>(null);
  const allowLeaveRef = useRef(false);
  const supabase = useMemo(() => createClient(), []);

  const { code: phoneCode, number: phoneNum } = useMemo(
    () => parsePhone(profile.phone),
    [profile.phone]
  );

  const isDirty = useMemo(
    () => !profilesEqual(profile, savedProfile),
    [profile, savedProfile]
  );

  const familyCapReached = profile.familyMembers.length >= MAX_FAMILY_MEMBERS;

  const typedEmail = profile.email.trim();
  const emailChanging =
    Boolean(loginEmail) &&
    typedEmail.toLowerCase() !== (loginEmail?.email ?? "").toLowerCase();
  /* A Google-only member moving off Gmail must set a password; to another
     Gmail address it is optional. */
  const passwordRequired =
    emailChanging && loginEmail?.hasPassword === false && !isGmailAddress(typedEmail);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        setIsLoading(true);
        setErrorMessage("");

        const [next, emailState] = await Promise.all([
          fetchMemberProfileBrowser(),
          fetchLoginEmailStateBrowser(),
        ]);
        if (!active) return;
        setLoginEmail(emailState);

        if (next) {
          const normalizedProfile = normalizeMemberProfile(next);
          setProfile(normalizedProfile);
          setSavedProfile(normalizedProfile);
        }
      } catch {
        if (!active) return;
        setErrorMessage("Could not load personal information.");
      } finally {
        if (active) setIsLoading(false);
      }
    }

    load();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty || allowLeaveRef.current) return;

      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isDirty]);

  useEffect(() => {
    const handleDocumentClick = (event: MouseEvent) => {
      if (!isDirty || showLeavePrompt) return;

      const target = event.target as HTMLElement | null;
      if (!target) return;

      const anchor = target.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || anchor.target === "_blank") return;

      const url = new URL(href, window.location.origin);
      if (url.origin !== window.location.origin) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      pendingHrefRef.current = url.pathname + url.search + url.hash;
      setShowLeavePrompt(true);
    };

    document.addEventListener("click", handleDocumentClick, true);

    return () => {
      document.removeEventListener("click", handleDocumentClick, true);
    };
  }, [isDirty, showLeavePrompt]);

  function clearMessages() {
    setJustSaved(false);
    setErrorMessage("");
  }

  function updateField<K extends keyof MemberProfile>(
    key: K,
    value: MemberProfile[K]
  ) {
    setProfile((prev) => ({ ...prev, [key]: value }));
    clearMessages();
  }

  function updatePhone(code: string, number: string) {
    const combined = code && number ? `${code} ${number}` : code || number;
    updateField("phone", combined);
  }

  function updateBirthday(key: keyof MemberBirthday, value: string) {
    setProfile((prev) => ({
      ...prev,
      birthday: {
        ...prev.birthday,
        [key]: value,
      },
    }));
    clearMessages();
  }

  function updateFamilyMember(id: string, value: string) {
    setProfile((prev) => ({
      ...prev,
      familyMembers: prev.familyMembers.map((member) =>
        member.id === id ? { ...member, fullName: value } : member
      ),
    }));
    clearMessages();
  }

  function updateFamilyBirthday(
    id: string,
    key: keyof MemberBirthday,
    value: string
  ) {
    setProfile((prev) => ({
      ...prev,
      familyMembers: prev.familyMembers.map((member) =>
        member.id === id
          ? {
              ...member,
              birthday: {
                ...member.birthday,
                [key]: value,
              },
            }
          : member
      ),
    }));
    clearMessages();
  }

  function addFamilyMember() {
    if (profile.familyMembers.length >= MAX_FAMILY_MEMBERS) return;

    setProfile((prev) => ({
      ...prev,
      familyMembers: [
        ...prev.familyMembers,
        {
          id: `fm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          fullName: "",
          birthday: { day: "", month: "", year: "" },
        },
      ],
    }));
    clearMessages();
  }

  function removeFamilyMember(id: string) {
    setProfile((prev) => ({
      ...prev,
      familyMembers: prev.familyMembers.filter((member) => member.id !== id),
    }));
    clearMessages();
  }

  /* A NEW E-MAIL IS A NEW LOGIN, AND IT WAITS FOR CONFIRMATION (Ulrik,
     2026-10-04). Supabase is asked to move the login; nothing changes until
     the link it sends is followed, so the field goes back to the address the
     member still signs in with and the one asked for shows as pending under
     it. The rest of the form saves as normal. Throws on a refused change so
     neither caller saves half of it. */
  async function saveProfile(): Promise<MemberProfile> {
    let next = profile;

    if (loginEmail && emailChanging) {
      if (!isValidEmail(typedEmail)) {
        throw new EmailChangeError("Please enter a valid e-mail address.");
      }
      if (loginEmail.hasPassword && !currentPassword) {
        throw new EmailChangeError("Enter your current password to change your e-mail.");
      }
      if (!loginEmail.hasPassword && (passwordRequired || newPassword)) {
        if (!isValidNewPassword(newPassword)) throw new EmailChangeError(NEW_PASSWORD_RULE);
      }
      await requestLoginEmailChangeBrowser(
        typedEmail,
        loginEmail.hasPassword
          ? { currentPassword }
          : newPassword
            ? { newPassword }
            : {}
      );
      setLoginEmail({
        ...loginEmail,
        pendingEmail: typedEmail,
        hasPassword: loginEmail.hasPassword || Boolean(newPassword),
      });
      setCurrentPassword("");
      setNewPassword("");
      next = { ...profile, email: loginEmail.email };
    }

    await saveMemberProfileBrowser(next);
    setProfile(next);
    setSavedProfile(next);
    return next;
  }

  function saveErrorMessage(error: unknown): string {
    return error instanceof EmailChangeError
      ? error.message
      : "Could not save personal information.";
  }

  async function handleSave() {
    if (!isDirty || isSaving) return;

    try {
      setIsSaving(true);
      setErrorMessage("");

      await saveProfile();
      setJustSaved(true);
    } catch (error) {
      setErrorMessage(saveErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleLogout() {
    try {
      setErrorMessage("");
      setErrorMessage("");
      await supabase.auth.signOut();
      window.location.href = "/login";
    } catch {
      setErrorMessage("Could not log out.");
    }
  }

  function handleTerminateMembership() {
    setShowTerminatePrompt(false);
    setErrorMessage("Membership termination will be connected in the next phase.");
  }

  async function handleLeaveDecision(shouldSave: boolean) {
    const href = pendingHrefRef.current;
    pendingHrefRef.current = null;

    if (shouldSave) {
      try {
        setIsSaving(true);
        setErrorMessage("");

        await saveProfile();
      } catch (error) {
        setErrorMessage(saveErrorMessage(error));
        setIsSaving(false);
        setShowLeavePrompt(false);
        return;
      } finally {
        setIsSaving(false);
      }
    }

    setShowLeavePrompt(false);

    if (href) {
      allowLeaveRef.current = true;
      window.location.href = href;
    }
  }

  if (isLoading) {
    return (
      <div className="members-stack">
        <section className="oltra-glass members-section">
          <div className="members-empty">Loading personal information...</div>
        </section>
      </div>
    );
  }

  return (
    <>
      {/* --profile: the panel joins the shell's first row beside the menu,
          so the two frames are one height (Ulrik, 2026-10-05). */}
      <div className="members-stack members-stack--profile">
        <section className="oltra-glass members-section members-profile-section">
          <div className="members-profile-form-grid">
            <div className="members-form-field">
              <label className="oltra-label">MEMBER NAME</label>
              <input
                className="oltra-input"
                value={profile.memberName}
                onChange={(event) =>
                  updateField("memberName", event.target.value)
                }
              />
            </div>

            <div className="members-form-field">
              <label className="oltra-label">E-MAIL</label>
              {/* The member's one e-mail, which is also their login. A change
                  is confirmed by a link to the new address only. */}
              <input
                className="oltra-input"
                type="email"
                value={profile.email}
                onChange={(event) => updateField("email", event.target.value)}
              />
              {emailChanging && loginEmail ? (
                <>
                  <div className="members-note members-note--field">
                    {loginEmail.hasPassword
                      ? "This is also your login. Enter your current password; on Save we send a confirmation link to the new e-mail, and it takes over once the link is followed."
                      : passwordRequired
                        ? "This is also your login. You sign in with Google today, so set a password to sign in with the new e-mail. On Save we send a confirmation link to it."
                        : "This is also your login. Once you confirm the link we send there, Continue with Google with that account signs you in. A password is optional."}
                  </div>
                  <input
                    className="oltra-input members-email-password"
                    type="password"
                    autoComplete={loginEmail.hasPassword ? "current-password" : "new-password"}
                    placeholder={
                      loginEmail.hasPassword
                        ? "Current password"
                        : passwordRequired
                          ? "New password"
                          : "New password (optional)"
                    }
                    value={loginEmail.hasPassword ? currentPassword : newPassword}
                    onChange={(event) => {
                      clearMessages();
                      (loginEmail.hasPassword ? setCurrentPassword : setNewPassword)(
                        event.target.value
                      );
                    }}
                  />
                </>
              ) : loginEmail?.pendingEmail ? (
                <div className="members-note members-note--field">
                  Changing to {loginEmail.pendingEmail}: follow the confirmation
                  link sent there. Until then you sign in with the address above.
                </div>
              ) : null}
            </div>

            {/* A type-ahead, not a select: the airport list is ~4k entries
                now, which is unusable as a dropdown. Same component the
                Flights and landing pages use. */}
            <div className="members-form-field">
              <AirportAutocomplete
                label="HOME AIRPORT"
                value={profile.homeAirport}
                onChange={(code) => updateField("homeAirport", code)}
              />
            </div>

            <div className="members-form-field">
              <label className="oltra-label">PHONE</label>
              <div className="members-phone-grid">
                <CountryCodeSelect
                  value={phoneCode}
                  onChange={(code) => updatePhone(code, phoneNum)}
                />
                <input
                  className="oltra-input"
                  placeholder="Number"
                  value={phoneNum}
                  onChange={(e) => updatePhone(phoneCode, e.target.value)}
                />
              </div>
            </div>

            <div className="members-form-field">
              <label className="oltra-label">BIRTHDAY</label>
              <div className="members-birthday-grid">
                <OltraSelect
                  name="birthdayDay"
                  value={profile.birthday.day}
                  placeholder="Day"
                  options={DAY_OPTIONS}
                  align="left"
                  onValueChange={(value) => updateBirthday("day", value)}
                />

                <OltraSelect
                  name="birthdayMonth"
                  value={profile.birthday.month}
                  placeholder="Month"
                  options={MONTH_OPTIONS}
                  align="left"
                  onValueChange={(value) => updateBirthday("month", value)}
                />

                <input
                  className="oltra-input"
                  placeholder="Year"
                  value={profile.birthday.year}
                  onChange={(event) =>
                    updateBirthday("year", event.target.value)
                  }
                />
              </div>
            </div>

            <div className="members-form-field">
              <label className="oltra-label">PREFERRED AIRLINES</label>
              <MultiSelectDropdown
                value={parseMultiValue(profile.preferredAirline)}
                placeholder="Preferred airlines"
                options={PREFERRED_AIRLINE_OPTIONS}
                onChange={(values) =>
                  updateField("preferredAirline", stringifyMultiValue(values))
                }
              />
            </div>
          </div>

          {/* Preferences. Unticked unless the member has saved a tick —
              consent is never pre-given. Saved with the rest of the form. */}
          <label className="members-checkbox">
            <input
              type="checkbox"
              checked={profile.marketingEmailsOptIn}
              onChange={(event) =>
                updateField("marketingEmailsOptIn", event.target.checked)
              }
            />
            <span>I would like to receive e-mails about new myOLTRA services</span>
          </label>

          <div className="members-profile-actions-row">
            <div className="members-note members-contact-note">
              Contact details are used in booking context and, only if you tick
              the box above, for e-mails about new myOLTRA services. OLTRA never
              passes them on to third parties.
            </div>

            <div className="members-profile-buttons">
              {errorMessage ? (
                <div className="members-note" style={{ textAlign: "right" }}>
                  {errorMessage}
                </div>
              ) : null}

              <div className="members-profile-save-row">
                {/* Passive, not disabled, when nothing has changed - the
                    reason shows on hover. handleSave already ignores the
                    click. Disabled only while the save is in flight. */}
                <button
                  type="button"
                  className="oltra-btn oltra-btn--block"
                  onClick={handleSave}
                  aria-disabled={!isDirty}
                  data-reason={!isDirty ? "No changes to save" : undefined}
                  disabled={isSaving}
                >
                  {isSaving ? "Saving..." : justSaved ? "Saved" : "Save"}
                </button>

                <button
                  type="button"
                  className="oltra-btn oltra-btn--block"
                  onClick={handleLogout}
                >
                  Log out
                </button>
              </div>

              {/* Under Save and Log out, their combined width (Ulrik,
                  2026-09-27); it swapped places with Terminate membership. */}
              <button
                type="button"
                className="oltra-btn oltra-btn--block"
                onClick={addFamilyMember}
                aria-disabled={familyCapReached}
                data-reason={
                  familyCapReached
                    ? `Up to ${MAX_FAMILY_MEMBERS} family members`
                    : undefined
                }
              >
                Add family member
              </button>
            </div>
          </div>
        </section>

        {/* No panel and no heading here - just the button and the cards it
            creates. The glass section around them read as a second, mostly
            empty box for a member with no family members saved. */}
        <div className="members-family-block">
          <div className="members-family-block__actions">
            {/* Red italic text, not a button (Ulrik, 2026-10-05) - a declared
                exception to "italic means AI" (design-system.md §35A). It
                still opens the confirmation. */}
            <button
              type="button"
              className="members-terminate-link"
              onClick={() => setShowTerminatePrompt(true)}
            >
              Terminate membership
            </button>
          </div>

          <div className="members-family-grid">
            {profile.familyMembers.map((member) => (
              <div key={member.id} className="members-family-card">
                <div className="members-form-stack">
                  <div className="members-form-field">
                    <label className="oltra-label">FULL NAME</label>
                    <input
                      className="oltra-input"
                      value={member.fullName}
                      onChange={(event) =>
                        updateFamilyMember(member.id, event.target.value)
                      }
                    />
                  </div>

                  <div className="members-form-field">
                    <label className="oltra-label">BIRTHDAY</label>
                    <div className="members-birthday-grid">
                      <OltraSelect
                        name={`family-day-${member.id}`}
                        value={member.birthday.day}
                        placeholder="Day"
                        options={DAY_OPTIONS}
                        align="left"
                        onValueChange={(value) =>
                          updateFamilyBirthday(member.id, "day", value)
                        }
                      />

                      <OltraSelect
                        name={`family-month-${member.id}`}
                        value={member.birthday.month}
                        placeholder="Month"
                        options={MONTH_OPTIONS}
                        align="left"
                        onValueChange={(value) =>
                          updateFamilyBirthday(member.id, "month", value)
                        }
                      />

                      <input
                        className="oltra-input"
                        placeholder="Year"
                        value={member.birthday.year}
                        onChange={(event) =>
                          updateFamilyBirthday(
                            member.id,
                            "year",
                            event.target.value
                          )
                        }
                      />
                    </div>
                  </div>
                </div>

                <div className="members-family-actions">
                  <button
                    type="button"
                    className="oltra-btn oltra-btn--destructive oltra-btn--condensed"
                    onClick={() => removeFamilyMember(member.id)}
                  >
                    Delete member
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {showLeavePrompt ? (
        <div className="members-leave-overlay">
          <div className="oltra-glass oltra-panel members-leave-modal">
            <div className="members-leave-modal__text">
              Do you want to save changes?
            </div>

            <div className="members-leave-modal__actions">
              <div className="oltra-btn-pair">
                <button
                  type="button"
                  className="oltra-btn"
                  onClick={() => handleLeaveDecision(true)}
                  disabled={isSaving}
                >
                  Yes
                </button>

                <button
                  type="button"
                  className="oltra-btn"
                  onClick={() => handleLeaveDecision(false)}
                  disabled={isSaving}
                >
                  No
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showTerminatePrompt ? (
        <div className="members-leave-overlay">
          <div className="oltra-glass oltra-panel members-leave-modal">
            <div className="members-leave-modal__text">
              Are you sure you want to terminate your membership?
            </div>

            <div className="members-leave-modal__actions">
              <div className="oltra-btn-pair">
                <button
                  type="button"
                  className="oltra-btn oltra-btn--destructive"
                  onClick={handleTerminateMembership}
                >
                  Yes
                </button>

                <button
                  type="button"
                  className="oltra-btn"
                  onClick={() => setShowTerminatePrompt(false)}
                >
                  No
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function CountryCodeSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (code: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^\+/, "");
    if (!q) return COUNTRY_CODE_OPTIONS;
    return COUNTRY_CODE_OPTIONS.filter((opt) => {
      const code = opt.value.toLowerCase().replace(/^\+/, "");
      const label = opt.label.toLowerCase();
      return code.startsWith(q) || label.includes(q);
    });
  }, [query]);

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  function handleFocus() {
    setQuery("");
    setOpen(true);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value);
    setOpen(true);
  }

  function selectOption(code: string) {
    onChange(code);
    setQuery("");
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="members-country-code-select" data-oltra-control="true">
      <input
        type="text"
        className="oltra-input"
        placeholder="+XX"
        value={open ? query : value}
        onFocus={handleFocus}
        onChange={handleChange}
        autoComplete="off"
        spellCheck={false}
      />
      {open && filteredOptions.length > 0 ? (
        <div className="oltra-dropdown-panel members-country-code-panel">
          <div className="oltra-dropdown-list members-country-code-list">
            {filteredOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={[
                  "oltra-dropdown-item",
                  opt.value === value ? "bg-[var(--oltra-dropdown-item-selected-bg)] text-[color:var(--oltra-text-primary)]" : "",
                ].join(" ")}
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectOption(opt.value);
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MultiSelectDropdown({
  value,
  placeholder,
  options,
  onChange,
}: {
  value: string[];
  placeholder: string;
  options: Option[];
  onChange: (value: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const dismissHoverProps = useDropdownDismiss({
    open,
    onClose: () => setOpen(false),
    refs: rootRef,
  });

  const selectedLabels: string[] = value
    .map((selectedValue: string) => {
      const matchedOption = options.find(
        (item: Option) => item.value === selectedValue
      );

      return matchedOption?.label ?? "";
    })
    .filter((label: string) => Boolean(label));

  const displayLabel =
    selectedLabels.length > 0 ? selectedLabels.join(", ") : placeholder;

  const sortedOptions = useMemo(() => {
    const selected = options.filter((opt) => value.includes(opt.value));
    const rest = options.filter((opt) => !value.includes(opt.value));
    return [...selected, ...rest];
  }, [options, value]);

  function toggleValue(nextValue: string) {
    if (value.includes(nextValue)) {
      onChange(value.filter((item) => item !== nextValue));
      return;
    }

    onChange([...value, nextValue]);
  }

  return (
    <div
      ref={rootRef}
      className="members-multiselect"
      data-oltra-control="true"
      {...dismissHoverProps}
    >
      <button
        type="button"
        className={[
          "oltra-select",
          "members-multiselect__trigger",
          selectedLabels.length ? "" : "members-multiselect__trigger--empty",
        ].join(" ")}
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="members-multiselect__text">{displayLabel}</span>
        <span className="members-multiselect__chevron">
          <svg viewBox="0 0 20 20" aria-hidden="true" style={{ width: 12, height: 12, display: "block" }}>
            <path d="M5.5 7.5 10 12l4.5-4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>

      {open ? (
        <div className="oltra-dropdown-panel members-multiselect__panel">
          <div className="oltra-dropdown-list members-multiselect__list">
            {sortedOptions.map((item: Option) => {
              const selected = value.includes(item.value);

              return (
                <button
                  key={item.value}
                  type="button"
                  className="oltra-dropdown-item members-multiselect__option"
                  onClick={() => toggleValue(item.value)}
                >
                  <span className="members-multiselect__check">{selected ? "✓" : ""}</span>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}