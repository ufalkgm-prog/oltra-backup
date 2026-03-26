"use client";

import { useState } from "react";
import { submitReviewBrowser } from "@/lib/members/db";

const MOCK_SEARCH_OPTIONS = [
  "Hotel du Cap-Eden-Roc · Antibes · France",
  "Cheval Blanc St-Tropez · St. Tropez · France",
  "La Vague d'Or · St. Tropez · France",
  "JAN · Nice · France",
];

const RATING_FIELDS = [
  "Overall",
  "Service",
  "Design",
  "Food",
  "Location",
  "Value",
] as const;

type RatingField = (typeof RATING_FIELDS)[number];

export default function ReviewView() {
  const [reviewType, setReviewType] = useState<"hotel" | "restaurant">("hotel");
  const [selectedItem, setSelectedItem] = useState("");
  const [ratings, setRatings] = useState<Record<RatingField, string>>({
    Overall: "5",
    Service: "5",
    Design: "5",
    Food: "5",
    Location: "5",
    Value: "5",
  });
  const [comments, setComments] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  function handleRatingChange(field: RatingField, value: string) {
    setRatings((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!selectedItem.trim()) {
      setErrorMessage("Please select a hotel or restaurant.");
      setStatusMessage("");
      return;
    }

    try {
      setIsSubmitting(true);
      setStatusMessage("");
      setErrorMessage("");

      await submitReviewBrowser({
        reviewType,
        targetLabel: selectedItem.trim(),
        targetDirectusId: null,
        overallRating: Number(ratings.Overall),
        serviceRating: Number(ratings.Service),
        designRating: Number(ratings.Design),
        foodRating: Number(ratings.Food),
        locationRating: Number(ratings.Location),
        valueRating: Number(ratings.Value),
        comments,
      });

      setSelectedItem("");
      setComments("");
      setRatings({
        Overall: "5",
        Service: "5",
        Design: "5",
        Food: "5",
        Location: "5",
        Value: "5",
      });
      setStatusMessage("Review submitted.");
    } catch (error) {
      setErrorMessage("Could not submit review.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="oltra-glass members-section">
      <form className="members-form-stack" onSubmit={handleSubmit}>
        <div className="members-form-grid">
          <div className="members-form-field">
            <label className="oltra-label">TYPE</label>
            <select
              className="oltra-select"
              value={reviewType}
              onChange={(e) => setReviewType(e.target.value as "hotel" | "restaurant")}
            >
              <option value="hotel">Hotel</option>
              <option value="restaurant">Restaurant</option>
            </select>
          </div>

          <div className="members-form-field members-form-field--full">
            <label className="oltra-label">HOTEL / RESTAURANT</label>
            <input
              list="members-review-options"
              className="oltra-input"
              value={selectedItem}
              onChange={(e) => setSelectedItem(e.target.value)}
              placeholder="Search hotel or restaurant incl. city and country"
              required
            />
            <datalist id="members-review-options">
              {MOCK_SEARCH_OPTIONS.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </div>
        </div>

        <div className="members-rating-grid">
          {RATING_FIELDS.map((field) => (
            <div key={field} className="members-form-field">
              <label className="oltra-label">{field.toUpperCase()}</label>
              <select
                className="oltra-select"
                value={ratings[field]}
                onChange={(e) => handleRatingChange(field, e.target.value)}
              >
                {[1, 2, 3, 4, 5].map((value) => (
                  <option key={value} value={String(value)}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>

        <div className="members-form-field">
          <label className="oltra-label">COMMENTS</label>
          <textarea
            className="oltra-textarea members-textarea"
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            placeholder="Add specific comments"
          />
        </div>

        <div className="members-note">
          Review is now stored in Supabase. Stay / visit verification and e-mail forwarding to info@algoville.com can be added next.
        </div>

        {(errorMessage || statusMessage) ? (
          <div className="members-note">
            {errorMessage || statusMessage}
          </div>
        ) : null}

        <div className="members-form-actions">
          <button
            type="submit"
            className="oltra-button-primary members-action-button"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Sending..." : "Send review"}
          </button>
        </div>
      </form>
    </section>
  );
}