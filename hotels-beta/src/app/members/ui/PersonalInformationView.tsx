"use client";

import { useEffect, useState } from "react";
import { DEFAULT_MEMBER_PROFILE } from "@/lib/members/defaults";
import type { MemberProfile } from "@/lib/members/types";
import {
  fetchMemberProfileBrowser,
  saveMemberProfileBrowser,
} from "@/lib/members/db";

export default function PersonalInformationView() {
  const [profile, setProfile] = useState<MemberProfile>(DEFAULT_MEMBER_PROFILE);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

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
        }
      } catch (error) {
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

  function updateField<K extends keyof MemberProfile>(
    key: K,
    value: MemberProfile[K]
  ) {
    setProfile((prev) => ({ ...prev, [key]: value }));
    setStatusMessage("");
    setErrorMessage("");
  }

  function updateFamilyMember(
    id: string,
    key: "fullName" | "birthday" | "passportNumber" | "passportExpiry",
    value: string
  ) {
    setProfile((prev) => ({
      ...prev,
      familyMembers: prev.familyMembers.map((member) =>
        member.id === id ? { ...member, [key]: value } : member
      ),
    }));
    setStatusMessage("");
    setErrorMessage("");
  }

  function addFamilyMember() {
    setProfile((prev) => ({
      ...prev,
      familyMembers: [
        ...prev.familyMembers,
        {
          id: `fm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          fullName: "",
          birthday: "",
          passportNumber: "",
          passportExpiry: "",
        },
      ],
    }));
    setStatusMessage("");
    setErrorMessage("");
  }

  function removeFamilyMember(id: string) {
    setProfile((prev) => ({
      ...prev,
      familyMembers: prev.familyMembers.filter((member) => member.id !== id),
    }));
    setStatusMessage("");
    setErrorMessage("");
  }

  async function handleSave() {
    try {
      setIsSaving(true);
      setStatusMessage("");
      setErrorMessage("");

      await saveMemberProfileBrowser(profile);
      setStatusMessage("Personal information saved.");
    } catch (error) {
      setErrorMessage("Could not save personal information.");
    } finally {
      setIsSaving(false);
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
    <div className="members-stack">
      <section className="oltra-glass members-section">
        <div className="members-form-grid">
          <div className="members-form-field">
            <label className="oltra-label">MEMBER NAME</label>
            <input
              className="oltra-input"
              value={profile.memberName}
              onChange={(e) => updateField("memberName", e.target.value)}
            />
          </div>

          <div className="members-form-field">
            <label className="oltra-label">HOME AIRPORT</label>
            <input
              className="oltra-input"
              value={profile.homeAirport}
              onChange={(e) => updateField("homeAirport", e.target.value)}
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

          <div className="members-form-field members-form-field--full">
            <div className="members-note">
              Only for use in booking context - OLTRA will not send advertising
              information or pass on contact details to third parties.
            </div>
          </div>

          <div className="members-form-field">
            <label className="oltra-label">PREFERRED CURRENCY</label>
            <input
              className="oltra-input"
              value={profile.preferredCurrency}
              onChange={(e) => updateField("preferredCurrency", e.target.value)}
            />
          </div>

          <div className="members-form-field">
            <label className="oltra-label">PREFERRED HOTEL STYLES</label>
            <input
              className="oltra-input"
              value={profile.preferredHotelStyles.join(", ")}
              onChange={(e) =>
                updateField(
                  "preferredHotelStyles",
                  e.target.value
                    .split(",")
                    .map((item) => item.trim())
                    .filter(Boolean)
                )
              }
            />
          </div>

          <div className="members-form-field members-form-field--full">
            <label className="oltra-label">PREFERRED AIRLINES</label>
            <input
              className="oltra-input"
              value={profile.preferredAirlines.join(", ")}
              onChange={(e) =>
                updateField(
                  "preferredAirlines",
                  e.target.value
                    .split(",")
                    .map((item) => item.trim())
                    .filter(Boolean)
                )
              }
            />
          </div>
        </div>
      </section>

      <section className="oltra-glass members-section">
        <div className="members-section__header members-section__header--row">
          <div className="oltra-label">FAMILY / GROUP MEMBERS</div>
          <button
            type="button"
            className="oltra-button-secondary members-action-button"
            onClick={addFamilyMember}
          >
            Add member
          </button>
        </div>

        <div className="members-family-stack">
          {profile.familyMembers.map((member) => (
            <div key={member.id} className="members-family-card">
              <div className="members-family-grid">
                <div className="members-form-field">
                  <label className="oltra-label">FULL NAME</label>
                  <input
                    className="oltra-input"
                    value={member.fullName}
                    onChange={(e) =>
                      updateFamilyMember(member.id, "fullName", e.target.value)
                    }
                  />
                </div>

                <div className="members-form-field">
                  <label className="oltra-label">BIRTHDAY</label>
                  <input
                    type="date"
                    className="oltra-input"
                    value={member.birthday}
                    onChange={(e) =>
                      updateFamilyMember(member.id, "birthday", e.target.value)
                    }
                  />
                </div>

                <div className="members-form-field">
                  <label className="oltra-label">PASSPORT NUMBER</label>
                  <input
                    className="oltra-input"
                    value={member.passportNumber}
                    onChange={(e) =>
                      updateFamilyMember(
                        member.id,
                        "passportNumber",
                        e.target.value
                      )
                    }
                  />
                </div>

                <div className="members-form-field">
                  <label className="oltra-label">PASSPORT EXPIRATION</label>
                  <input
                    type="date"
                    className="oltra-input"
                    value={member.passportExpiry}
                    onChange={(e) =>
                      updateFamilyMember(
                        member.id,
                        "passportExpiry",
                        e.target.value
                      )
                    }
                  />
                </div>
              </div>

              <div className="members-family-actions">
                <button
                  type="button"
                  className="oltra-button-secondary members-action-button"
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
        <div className="members-section__header">
          <div className="oltra-label">MEMBERSHIP</div>
        </div>

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
              className="oltra-button-secondary members-action-button members-action-button--danger"
            >
              Terminate membership
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}