"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import OltraSelect from "@/components/site/OltraSelect";
import { DEFAULT_MEMBER_PROFILE } from "@/lib/members/defaults";
import type { MemberBirthday, MemberProfile } from "@/lib/members/types";
import { fetchMemberProfileBrowser, saveMemberProfileBrowser } from "@/lib/members/db";
import { createClient } from "@/lib/supabase/client";

type Option = {
  value: string;
  label: string;
};

type Props = {
  preferredHotelStyleOptions: Option[];
  preferredAirlineOptions: Option[];
};

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

function birthdaysEqual(a: MemberBirthday, b: MemberBirthday) {
  return a.day === b.day && a.month === b.month && a.year === b.year;
}

function profilesEqual(a: MemberProfile, b: MemberProfile) {
  if (
    a.memberName !== b.memberName ||
    a.email !== b.email ||
    a.phone !== b.phone ||
    a.homeAirport !== b.homeAirport ||
    a.preferredHotelStyle !== b.preferredHotelStyle ||
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

export default function PersonalInformationView({
  preferredHotelStyleOptions,
  preferredAirlineOptions,
}: Props) {
  const [profile, setProfile] = useState<MemberProfile>(DEFAULT_MEMBER_PROFILE);
  const [savedProfile, setSavedProfile] =
    useState<MemberProfile>(DEFAULT_MEMBER_PROFILE);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [showLeavePrompt, setShowLeavePrompt] = useState(false);
  const pendingHrefRef = useRef<string | null>(null);
  const supabase = useMemo(() => createClient(), []);
  const isDirty = useMemo(
    () => !profilesEqual(profile, savedProfile),
    [profile, savedProfile]
  );

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        setIsLoading(true);
        setErrorMessage("");

        const next = await fetchMemberProfileBrowser();
        if (!active) return;

        if (next) {
          setProfile(next);
          setSavedProfile(next);
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
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    const handleDocumentClick = (event: MouseEvent) => {
      if (!isDirty) return;

      const target = event.target as HTMLElement | null;
      if (!target) return;

      const anchor = target.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || anchor.target === "_blank") return;

      event.preventDefault();
      pendingHrefRef.current = href;
      setShowLeavePrompt(true);
    };

    document.addEventListener("click", handleDocumentClick);
    return () => document.removeEventListener("click", handleDocumentClick);
  }, [isDirty]);

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
    setProfile((prev) => ({
      ...prev,
      familyMembers: [
        ...prev.familyMembers,
        {
          id: `fm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          fullName: "",
          birthday: { day: "", month: "", year: "" },
          passportNumber: "",
          passportExpiry: "",
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
                  onChange={(e) => updateField("memberName", e.target.value)}
                />
              </div>

              <div className="members-form-field">
                <label className="oltra-label">E-MAIL</label>
                <input
                  className="oltra-input"
                  value={profile.email}
                  onChange={(e) => updateField("email", e.target.value)}
                />
              </div>

              <div className="members-form-field">
                <label className="oltra-label">PHONE</label>
                <input
                  className="oltra-input"
                  value={profile.phone}
                  onChange={(e) => updateField("phone", e.target.value)}
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
                    onChange={(e) => updateBirthday("year", e.target.value)}
                  />
                </div>
              </div>

              <div className="members-form-field">
                <label className="oltra-label">HOME AIRPORT</label>
                <input
                  className="oltra-input"
                  value={profile.homeAirport}
                  onChange={(e) => updateField("homeAirport", e.target.value)}
                />
              </div>
            </div>

            <div className="members-form-stack">
              <div className="members-form-field">
                <label className="oltra-label">PREFERRED HOTEL STYLES</label>
                <OltraSelect
                  name="preferredHotelStyle"
                  value={profile.preferredHotelStyle}
                  placeholder="Select style"
                  options={preferredHotelStyleOptions}
                  align="left"
                  onValueChange={(value) =>
                    updateField("preferredHotelStyle", value)
                  }
                />
              </div>

              <div className="members-form-field">
                <label className="oltra-label">PREFERRED AIRLINES</label>
                <OltraSelect
                  name="preferredAirline"
                  value={profile.preferredAirline}
                  placeholder="Select airline"
                  options={preferredAirlineOptions}
                  align="left"
                  onValueChange={(value) =>
                    updateField("preferredAirline", value)
                  }
                />
              </div>
            </div>
          </div>

          <div className="members-profile-note">
            <div className="members-note">
              Only for use in booking context - OLTRA will not send advertising
              information or pass on contact details to third parties.
            </div>
          </div>
        </section>

        <section className="oltra-glass members-section">
          <div className="members-section__header members-section__header--row">
            <div className="oltra-label">ADDITIONAL MEMBERS</div>
            <button
              type="button"
              className="oltra-button-primary members-action-button"
              onClick={addFamilyMember}
            >
              Add member
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
                      onChange={(e) =>
                        updateFamilyMember(member.id, e.target.value)
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
                        onChange={(e) =>
                          updateFamilyBirthday(member.id, "year", e.target.value)
                        }
                      />
                    </div>
                  </div>
                </div>

                <div className="members-family-actions">
                  <button
                    type="button"
                    className="oltra-button-secondary members-action-button members-action-button--danger"
                    onClick={() => removeFamilyMember(member.id)}
                  >
                    Delete member
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="oltra-glass members-section">
          <div className="members-membership-row">
            <div>
              {errorMessage ? (
                <div className="members-note">{errorMessage}</div>
              ) : statusMessage ? (
                <div className="members-note">{statusMessage}</div>
              ) : (
                <div className="members-empty">
                  Membership settings will be connected to account/auth in the next
                  phase.
                </div>
              )}
            </div>

            <div className="members-membership-actions">
              <button
                type="button"
                className="oltra-button-primary members-action-button"
                onClick={handleSave}
                disabled={isSaving}
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

              <button
                type="button"
                className="oltra-button-secondary members-action-button members-action-button--danger"
              >
                Terminate membership
              </button>
            </div>
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
    </>
  );
}