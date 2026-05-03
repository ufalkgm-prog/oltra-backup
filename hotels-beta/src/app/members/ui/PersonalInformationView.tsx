"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import OltraSelect from "@/components/site/OltraSelect";
import {
  AIRPORT_OPTIONS,
  type AirportOption,
} from "@/lib/airportOptions";
import { DEFAULT_MEMBER_PROFILE } from "@/lib/members/defaults";
import type { MemberBirthday, MemberProfile } from "@/lib/members/types";
import {
  fetchMemberProfileBrowser,
  saveMemberProfileBrowser,
} from "@/lib/members/db";
import { createClient } from "@/lib/supabase/client";

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

function normalizeAirportValue(value: string): string {
  const raw = value.trim();
  if (!raw) return "";

  const directMatch = AIRPORT_OPTIONS.find(
    (airport: AirportOption) =>
      airport.value.toLowerCase() === raw.toLowerCase()
  );

  if (directMatch) return directMatch.value;

  const labelMatch = AIRPORT_OPTIONS.find((airport: AirportOption) =>
    airport.label.toLowerCase().includes(raw.toLowerCase())
  );

  return labelMatch?.value ?? raw;
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
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [showLeavePrompt, setShowLeavePrompt] = useState(false);
  const [showTerminatePrompt, setShowTerminatePrompt] = useState(false);
  const pendingHrefRef = useRef<string | null>(null);
  const supabase = useMemo(() => createClient(), []);

  const isDirty = useMemo(
    () => !profilesEqual(profile, savedProfile),
    [profile, savedProfile]
  );

  const homeAirportOptions = useMemo<Option[]>(() => {
    const currentValue = profile.homeAirport.trim();

    const airportOptions: Option[] = AIRPORT_OPTIONS.map(
      (airport: AirportOption) => ({
        value: airport.value,
        label: airport.label,
      })
    );

    if (
      !currentValue ||
      airportOptions.some((airport: Option) => airport.value === currentValue)
    ) {
      return airportOptions;
    }

    return [{ value: currentValue, label: currentValue }, ...airportOptions];
  }, [profile.homeAirport]);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        setIsLoading(true);
        setErrorMessage("");

        const next = await fetchMemberProfileBrowser();
        if (!active) return;

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
      if (!isDirty) return;

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
    setStatusMessage("");
    setErrorMessage("");
  }

  function updateField<K extends keyof MemberProfile>(
    key: K,
    value: MemberProfile[K]
  ) {
    setProfile((prev) => ({ ...prev, [key]: value }));
    clearMessages();
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

  async function handleSave() {
    if (!isDirty || isSaving) return;

    try {
      setIsSaving(true);
      setStatusMessage("");
      setErrorMessage("");

      await saveMemberProfileBrowser(profile);
      setSavedProfile(profile);
      setStatusMessage("Personal information saved.");
    } catch {
      setErrorMessage("Could not save personal information.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleLogout() {
    try {
      setErrorMessage("");
      setStatusMessage("");
      await supabase.auth.signOut();
      window.location.href = "/login";
    } catch {
      setErrorMessage("Could not log out.");
    }
  }

  function handleTerminateMembership() {
    setShowTerminatePrompt(false);
    setStatusMessage("");
    setErrorMessage(
      "Membership termination will be connected in the next phase."
    );
  }

  async function handleLeaveDecision(shouldSave: boolean) {
    const href = pendingHrefRef.current;
    pendingHrefRef.current = null;

    if (shouldSave) {
      try {
        setIsSaving(true);
        setStatusMessage("");
        setErrorMessage("");

        await saveMemberProfileBrowser(profile);
        setSavedProfile(profile);
        setStatusMessage("Personal information saved.");
      } catch {
        setErrorMessage("Could not save personal information.");
        setIsSaving(false);
        setShowLeavePrompt(false);
        return;
      } finally {
        setIsSaving(false);
      }
    }

    setShowLeavePrompt(false);

    if (href) {
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
      <div className="members-stack">
        <section className="oltra-glass members-section">
          <div className="members-profile-grid">
            <div className="members-form-stack">
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
                <input
                  className="oltra-input"
                  value={profile.email}
                  onChange={(event) => updateField("email", event.target.value)}
                />
              </div>

              <div className="members-form-field">
                <label className="oltra-label">PHONE</label>
                <input
                  className="oltra-input"
                  value={profile.phone}
                  onChange={(event) => updateField("phone", event.target.value)}
                />
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

              <div className="members-profile-note">
                <div className="members-note">
                  Only for use in booking context - OLTRA will not send
                  advertising information or pass on contact details to third
                  parties.
                </div>
              </div>
            </div>

            <div className="members-profile-side">
              <div className="members-form-stack">
                <div className="members-form-field">
                  <label className="oltra-label">HOME AIRPORT</label>
                  <OltraSelect
                    name="homeAirport"
                    value={profile.homeAirport}
                    placeholder="Home airport"
                    options={homeAirportOptions}
                    align="left"
                    onValueChange={(value) =>
                      updateField("homeAirport", value)
                    }
                  />
                </div>

                <div className="members-form-field">
                  <label className="oltra-label">PREFERRED AIRLINES</label>
                  <MultiSelectDropdown
                    value={parseMultiValue(profile.preferredAirline)}
                    placeholder="Preferred airlines"
                    options={PREFERRED_AIRLINE_OPTIONS}
                    onChange={(values) =>
                      updateField(
                        "preferredAirline",
                        stringifyMultiValue(values)
                      )
                    }
                  />
                </div>
              </div>

              <div className="members-profile-actions">
                <div className="members-profile-status">
                  {errorMessage ? (
                    <div className="members-note">{errorMessage}</div>
                  ) : statusMessage ? (
                    <div className="members-note">{statusMessage}</div>
                  ) : null}
                </div>

                <div className="members-membership-buttons">
                  <button
                    type="button"
                    className={[
                      isDirty ? "oltra-button-primary" : "oltra-button-secondary",
                      "members-action-button",
                    ].join(" ")}
                    onClick={handleSave}
                    disabled={!isDirty || isSaving}
                  >
                    {isSaving ? "Saving..." : "Save"}
                  </button>

                  <button
                    type="button"
                    className="oltra-button-secondary members-action-button"
                    onClick={handleLogout}
                  >
                    Log out
                  </button>
                </div>

                <button
                  type="button"
                  className="members-text-danger-action members-terminate-link"
                  onClick={() => setShowTerminatePrompt(true)}
                >
                  Terminate membership
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="oltra-glass members-section">
          <div className="members-section__header members-section__header--row">
            <div className="oltra-label">ADDITIONAL FAMILY MEMBERS</div>

            <button
              type="button"
              className="oltra-button-primary members-action-button"
              onClick={addFamilyMember}
              disabled={profile.familyMembers.length >= MAX_FAMILY_MEMBERS}
            >
              Add family member
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
                    className="members-text-danger-action"
                    onClick={() => removeFamilyMember(member.id)}
                  >
                    Delete member
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {showLeavePrompt ? (
        <div className="members-leave-overlay">
          <div className="oltra-glass oltra-panel members-leave-modal">
            <div className="members-leave-modal__text">
              Do you want to save changes?
            </div>

            <div className="members-leave-modal__actions">
              <button
                type="button"
                className="oltra-button-primary members-action-button"
                onClick={() => handleLeaveDecision(true)}
                disabled={isSaving}
              >
                Yes
              </button>

              <button
                type="button"
                className="oltra-button-secondary members-action-button"
                onClick={() => handleLeaveDecision(false)}
                disabled={isSaving}
              >
                No
              </button>
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
              <button
                type="button"
                className="members-confirm-danger-button members-action-button"
                onClick={handleTerminateMembership}
              >
                Yes
              </button>

              <button
                type="button"
                className="oltra-button-primary members-action-button"
                onClick={() => setShowTerminatePrompt(false)}
              >
                No
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
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

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target as Node)) setOpen(false);
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

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
        <span className="members-multiselect__chevron">⌄</span>
      </button>

      {open ? (
        <div className="oltra-dropdown-panel members-multiselect__panel">
          <div className="oltra-dropdown-list members-multiselect__list">
            {options.map((item: Option) => {
              const selected = value.includes(item.value);

              return (
                <button
                  key={item.value}
                  type="button"
                  className={[
                    "oltra-dropdown-item",
                    "members-multiselect__option",
                    selected ? "members-multiselect__option--active" : "",
                  ].join(" ")}
                  onClick={() => toggleValue(item.value)}
                >
                  <span>{item.label}</span>
                  <span>{selected ? "✓" : ""}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}