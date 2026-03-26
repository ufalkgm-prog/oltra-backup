"use client";

import { useState } from "react";

type RelationOption = {
  id: string;
  name: string;
  slug?: string | null;
};

type EditorHotel = {
  id: string;
  hotel_name?: string | null;
  www?: string | null;
  insta?: string | null;
  region?: string | null;
  country?: string | null;
  state_province__county__island?: string | null;
  city?: string | null;
  local_area?: string | null;
  highlights?: string | null;
  description?: string | null;
  high_season?: string | null;
  low_season?: string | null;
  rain_season?: string | null;
  ext_points?: number | string | null;
  editor_rank_13?: number | string | null;
  total_rooms_suites_villas?: number | string | null;
  rooms_suites?: number | string | null;
  villas?: number | string | null;
  published?: boolean | null;
  selectedActivityIds?: string[];
  selectedAwardIds?: string[];
  selectedSettingIds?: string[];
  selectedStyleIds?: string[];
};

function Field({
  label,
  name,
  defaultValue,
  type = "text",
}: {
  label: string;
  name: string;
  defaultValue?: string | number | null;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-white/45">
        {label}
      </span>
      <input
        type={type}
        name={name}
        defaultValue={defaultValue ?? ""}
        className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none"
      />
    </label>
  );
}

function TextArea({
  label,
  name,
  defaultValue,
  rows = 4,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  rows?: number;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-white/45">
        {label}
      </span>
      <textarea
        name={name}
        defaultValue={defaultValue ?? ""}
        rows={rows}
        className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none"
      />
    </label>
  );
}

function CheckboxGroup({
  label,
  name,
  options,
  selectedValues,
}: {
  label: string;
  name: string;
  options: RelationOption[];
  selectedValues: string[];
}) {
  return (
    <div>
      <span className="mb-3 block text-xs uppercase tracking-[0.2em] text-white/45">
        {label}
      </span>

      <div className="max-h-80 overflow-auto rounded-2xl border border-white/10 bg-black/20 p-3">
        <div className="grid gap-2">
          {options.map((option) => {
            const checked = selectedValues.includes(option.id);

            return (
              <label
                key={option.id}
                className="flex items-start gap-3 rounded-xl px-3 py-2 hover:bg-white/5"
              >
                <input
                  type="checkbox"
                  name={name}
                  value={option.id}
                  defaultChecked={checked}
                  className="mt-1 h-4 w-4"
                />
                <span className="text-sm text-white/85">{option.name}</span>
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function EditorHotelForm({
  id,
  hotel,
  taxonomies,
}: {
  id: string;
  hotel: EditorHotel;
  taxonomies: {
    awards: RelationOption[];
    activities: RelationOption[];
    settings: RelationOption[];
    styles: RelationOption[];
  };
}) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    const formData = new FormData(e.currentTarget);

    const payload = {
      hotel_name: formData.get("hotel_name"),
      www: formData.get("www"),
      insta: formData.get("insta"),
      region: formData.get("region"),
      country: formData.get("country"),
      state_province__county__island: formData.get("state_province__county__island"),
      city: formData.get("city"),
      local_area: formData.get("local_area"),
      highlights: formData.get("highlights"),
      description: formData.get("description"),
      high_season: formData.get("high_season"),
      low_season: formData.get("low_season"),
      rain_season: formData.get("rain_season"),
      ext_points: formData.get("ext_points"),
      editor_rank_13: formData.get("editor_rank_13"),
      total_rooms_suites_villas: formData.get("total_rooms_suites_villas"),
      rooms_suites: formData.get("rooms_suites"),
      villas: formData.get("villas"),
      published: formData.get("published") === "on",
      awards: formData.getAll("awards"),
      activities: formData.getAll("activities"),
      settings: formData.getAll("settings"),
      styles: formData.getAll("styles"),
    };

    const res = await fetch(`/api/editor/hotels/${id}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const json = await res.json();

    if (!res.ok || !json.ok) {
      setMessage(json.error || "Save failed");
      setSaving(false);
      return;
    }

    setMessage("Saved");
    setSaving(false);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-8">
      <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-light">Identity</h2>
          <label className="flex items-center gap-3 text-sm text-white/80">
            <input
              type="checkbox"
              name="published"
              defaultChecked={Boolean(hotel.published)}
              className="h-4 w-4"
            />
            Published
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Hotel name" name="hotel_name" defaultValue={hotel.hotel_name} />
          <Field label="Website" name="www" defaultValue={hotel.www} />
          <Field label="Instagram" name="insta" defaultValue={hotel.insta} />
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
        <h2 className="mb-6 text-lg font-light">Location</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Region" name="region" defaultValue={hotel.region} />
          <Field label="Country" name="country" defaultValue={hotel.country} />
          <Field
            label="State / County / Island"
            name="state_province__county__island"
            defaultValue={hotel.state_province__county__island}
          />
          <Field label="City" name="city" defaultValue={hotel.city} />
          <Field label="Local area" name="local_area" defaultValue={hotel.local_area} />
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
        <h2 className="mb-6 text-lg font-light">Editorial</h2>
        <div className="space-y-4">
          <TextArea label="Highlights" name="highlights" defaultValue={hotel.highlights} rows={3} />
          <TextArea label="Description" name="description" defaultValue={hotel.description} rows={8} />

          <div className="grid gap-4 md:grid-cols-3">
            <Field label="High season" name="high_season" defaultValue={hotel.high_season} />
            <Field label="Low season" name="low_season" defaultValue={hotel.low_season} />
            <Field label="Rain season" name="rain_season" defaultValue={hotel.rain_season} />
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
        <h2 className="mb-6 text-lg font-light">Stats</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Field label="External points" name="ext_points" defaultValue={hotel.ext_points} type="number" />
          <Field label="Editor rank" name="editor_rank_13" defaultValue={hotel.editor_rank_13} type="number" />
          <Field
            label="Total rooms / suites / villas"
            name="total_rooms_suites_villas"
            defaultValue={hotel.total_rooms_suites_villas}
            type="number"
          />
          <Field label="Rooms / suites" name="rooms_suites" defaultValue={hotel.rooms_suites} type="number" />
          <Field label="Villas" name="villas" defaultValue={hotel.villas} type="number" />
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
        <h2 className="mb-6 text-lg font-light">Relations</h2>

        <div className="grid gap-6 lg:grid-cols-2">
          <CheckboxGroup
            label="Awards"
            name="awards"
            options={taxonomies.awards}
            selectedValues={hotel.selectedAwardIds || []}
          />
          <CheckboxGroup
            label="Activities"
            name="activities"
            options={taxonomies.activities}
            selectedValues={hotel.selectedActivityIds || []}
          />
          <CheckboxGroup
            label="Settings"
            name="settings"
            options={taxonomies.settings}
            selectedValues={hotel.selectedSettingIds || []}
          />
          <CheckboxGroup
            label="Styles"
            name="styles"
            options={taxonomies.styles}
            selectedValues={hotel.selectedStyleIds || []}
          />
        </div>
      </section>

      <div className="flex items-center justify-between gap-4">
        <div className="text-sm text-white/60">{message}</div>
        <button
          type="submit"
          disabled={saving}
          className="rounded-full bg-white px-6 py-3 text-sm font-medium text-black disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </form>
  );
}