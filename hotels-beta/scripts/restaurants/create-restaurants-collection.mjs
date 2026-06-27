// One-shot script: creates the Directus restaurants collection and all fields.
// Run once, then archive. Safe to re-run — collection/field creation will 409 if already exists.
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const DIRECTUS_URL = process.env.DIRECTUS_URL?.replace(/\/+$/, "");
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;

if (!DIRECTUS_URL || !DIRECTUS_TOKEN) throw new Error("Missing DIRECTUS_URL or DIRECTUS_TOKEN");

async function api(path, body, method = "POST") {
  const res = await fetch(`${DIRECTUS_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${DIRECTUS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data };
}

async function createCollection() {
  const { status, data } = await api("/collections", {
    collection: "restaurants",
    meta: {
      icon: "restaurant",
      note: "Curated luxury restaurant listings",
      sort_field: "sort",
    },
    schema: { name: "restaurants" },
  });
  if (status === 409) {
    console.log("Collection restaurants already exists — skipping.");
  } else if (!status.toString().startsWith("2")) {
    console.error("Failed to create collection:", data);
    process.exit(1);
  } else {
    console.log("✓ Created collection: restaurants");
  }
}

async function createField(field, schema, meta = {}) {
  const { status, data } = await api("/fields/restaurants", { field, type: schema.type, schema, meta });
  if (status === 409) {
    console.log(`  already exists: ${field}`);
  } else if (!status.toString().startsWith("2")) {
    console.error(`  FAILED: ${field}`, data?.errors);
  } else {
    console.log(`  ✓ ${field}`);
  }
}

async function main() {
  await createCollection();

  console.log("\nCreating fields...");

  // Primary key
  await createField("id", { type: "integer", is_primary_key: true, has_auto_increment: true }, { hidden: true, readonly: true });

  // Editorial / admin
  await createField("status", { type: "string" }, { interface: "select-dropdown", options: { choices: [{ text: "Published", value: "published" }, { text: "Draft", value: "draft" }] }, default_value: "draft" });
  await createField("sort", { type: "integer" }, { hidden: true });
  await createField("rank", { type: "integer" }, {});

  // Identity
  await createField("restaurant_name", { type: "string" }, { required: true });
  await createField("slug", { type: "string" }, { note: "Lowercase kebab-case, unique" });

  // Editorial content
  await createField("description", { type: "text" }, {});
  await createField("restaurant_type", { type: "string" }, {
    interface: "select-dropdown",
    options: {
      choices: [
        { text: "Fine dining", value: "Fine dining" },
        { text: "High-end casual", value: "High-end casual" },
        { text: "Informal local favorite", value: "Informal local favorite" },
        { text: "Beach club", value: "Beach club" },
      ],
    },
  });
  await createField("highlights", { type: "text" }, {});
  await createField("cuisine", { type: "string" }, {});
  await createField("restaurant_setting", { type: "string" }, {});
  await createField("restaurant_style", { type: "string" }, {});

  // Location
  await createField("country", { type: "string" }, {});
  await createField("region", { type: "string" }, {});
  await createField("city", { type: "string" }, {});
  await createField("local_area", { type: "string" }, {});
  await createField("state_province_county_island", { type: "string" }, {});
  await createField("lat", { type: "decimal" }, {});
  await createField("lng", { type: "decimal" }, {});

  // Links
  await createField("www", { type: "string" }, {});
  await createField("insta", { type: "string" }, {});

  // Awards & metadata
  await createField("awards", { type: "json" }, { note: "Array: michelin_3, michelin_2, michelin_1, worlds_50, laliste100" });
  await createField("sources", { type: "text" }, {});
  await createField("hotel_name_hint", { type: "string" }, { note: "Populate if restaurant is inside a hotel" });

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
