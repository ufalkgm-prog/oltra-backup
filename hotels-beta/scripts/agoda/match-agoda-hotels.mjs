import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import readline from "readline";

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const value = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
      out[key] = value;
    }
  }
  return out;
}

const args = parseArgs(process.argv);

const oltraPath = args.oltra || "scripts/agoda/oltra_hotels_full.json";
const agodaPath = args.agoda;
const outDir = args.outdir || "scripts/agoda/output";

if (!agodaPath) {
  throw new Error("Missing --agoda /full/path/to/agoda_file.tsv");
}

await fsp.mkdir(outDir, { recursive: true });

const oltraRaw = JSON.parse(await fsp.readFile(oltraPath, "utf8"));

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCountry(value) {
  const s = normalizeText(value);
  const map = new Map([
    ["usa", "united states"],
    ["us", "united states"],
    ["united states of america", "united states"],
    ["england", "united kingdom"],
    ["scotland", "united kingdom"],
    ["wales", "united kingdom"],
    ["uk", "united kingdom"],
    ["u k", "united kingdom"],
    ["hong kong sar china", "hong kong"],
    ["hong kong sar", "hong kong"],
    ["macau sar china", "macau"],
    ["uae", "united arab emirates"],
    ["u a e", "united arab emirates"]
  ]);
  return map.get(s) || s;
}

function normalizeCity(value) {
  let s = normalizeText(value);
  s = s.replace(/\bny\b/g, "new york");
  s = s.replace(/\bnv\b/g, "nevada");
  s = s.replace(/\bsaint\b/g, "st");
  s = s.replace(/\bst tropez\b/g, "saint tropez");
  s = s.replace(/\bval disere\b/g, "val d isere");
  s = s.replace(/\blech am arlberg\b/g, "lech");
  return s.trim();
}

function removeGenericHotelWords(s) {
  return s
    .replace(/\bhotel\b/g, " ")
    .replace(/\bhotels\b/g, " ")
    .replace(/\bresort\b/g, " ")
    .replace(/\bresorts\b/g, " ")
    .replace(/\bspa\b/g, " ")
    .replace(/\bvillas\b/g, " ")
    .replace(/\bvilla\b/g, " ")
    .replace(/\blodge\b/g, " ")
    .replace(/\bcamp\b/g, " ")
    .replace(/\bpalace\b/g, " ")
    .replace(/\bsuites\b/g, " ")
    .replace(/\bsuite\b/g, " ")
    .replace(/\bresidences\b/g, " ")
    .replace(/\bresidence\b/g, " ")
    .replace(/\bpartner\b/g, " ")
    .replace(/\bthe\b/g, " ")
    .replace(/\ba\b/g, " ")
    .replace(/\ban\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeName(value) {
  let s = normalizeText(value);

  s = s.replace(/\band beyond\b/g, "andbeyond");
  s = s.replace(/\b1 hotel\b/g, "1hotel");
  s = s.replace(/\bst\b/g, "saint");

  return removeGenericHotelWords(s);
}

function tokens(s) {
  if (!s) return [];
  return s.split(" ").filter(Boolean);
}

function tokenSet(s) {
  return new Set(tokens(s));
}

function overlapScore(a, b) {
  if (!a || !b) return 0;
  const A = tokenSet(a);
  const B = tokenSet(b);
  if (!A.size || !B.size) return 0;

  let inter = 0;
  for (const t of A) {
    if (B.has(t)) inter++;
  }
  const union = new Set([...A, ...B]).size;
  return union ? inter / union : 0;
}

function containsRareToken(a, b) {
  const A = tokens(a).filter((t) => t.length >= 5);
  const B = new Set(tokens(b));
  return A.some((t) => B.has(t));
}

function cleanOltraRow(r) {
  const country = normalizeCountry(r.country);
  const city = normalizeCity(r.city || r.local_area || r.region || r.state_province__county__island || "");
  const name = normalizeName(r.hotel_name || "");
  return {
    id: r.id ?? "",
    hotelid: r.hotelid ?? "",
    hotel_name: r.hotel_name ?? "",
    city: r.city ?? "",
    country: r.country ?? "",
    normCountry: country,
    normCity: city,
    normName: name
  };
}

const oltra = oltraRaw.map(cleanOltraRow);

const oltraByCountry = new Map();
for (const row of oltra) {
  const key = row.normCountry || "__missing__";
  if (!oltraByCountry.has(key)) oltraByCountry.set(key, []);
  oltraByCountry.get(key).push(row);
}

function chooseCandidates(agodaCountry) {
  const exact = oltraByCountry.get(agodaCountry) || [];
  if (exact.length) return exact;
  return oltra;
}

function scoreCandidate(oltraRow, agodaRow) {
  let score = 0;
  const notes = [];

  const nameMain = overlapScore(oltraRow.normName, agodaRow.normName);
  const nameFormer = overlapScore(oltraRow.normName, agodaRow.normFormerName);
  const nameTranslated = overlapScore(oltraRow.normName, agodaRow.normTranslatedName);
  const bestName = Math.max(nameMain, nameFormer, nameTranslated);

  score += bestName * 70;
  if (bestName >= 0.9) notes.push("very strong name");
  else if (bestName >= 0.7) notes.push("strong name");
  else if (bestName >= 0.5) notes.push("moderate name");

  if (oltraRow.normCountry && agodaRow.normCountry && oltraRow.normCountry === agodaRow.normCountry) {
    score += 20;
    notes.push("country match");
  }

  if (oltraRow.normCity && agodaRow.normCity) {
    if (oltraRow.normCity === agodaRow.normCity) {
      score += 20;
      notes.push("city match");
    } else if (
      oltraRow.normCity.includes(agodaRow.normCity) ||
      agodaRow.normCity.includes(oltraRow.normCity)
    ) {
      score += 10;
      notes.push("city partial");
    }
  } else if (!oltraRow.normCity) {
    notes.push("oltra city missing");
  }

  if (containsRareToken(oltraRow.normName, agodaRow.normName)) {
    score += 10;
    notes.push("rare token overlap");
  }

  return {
    score,
    notes: notes.join("; ")
  };
}

function classify(best, secondBest, oltraRow) {
  if (!best || best.score < 45) return "NO_CANDIDATE";
  if (best.score >= 95 && (!secondBest || best.score - secondBest.score >= 10)) return "MATCH_STRONG";
  if (best.score >= 75 && (!secondBest || best.score - secondBest.score >= 6)) return "MATCH_POSSIBLE";
  if (!oltraRow.normCity && best.score >= 65) return "MATCH_POSSIBLE";
  return "REVIEW_REQUIRED";
}

function detectDelimiter(headerLine) {
  if (headerLine.includes("\t")) return "\t";
  return ",";
}

function splitLine(line, delimiter) {
  if (delimiter === "\t") return line.split("\t");

  const out = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function csvEscape(v) {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const bestByOltraId = new Map();

const rl = readline.createInterface({
  input: fs.createReadStream(agodaPath),
  crlfDelay: Infinity
});

let headers = null;
let delimiter = "\t";
let rowCount = 0;

for await (const line of rl) {
  if (!headers) {
    delimiter = detectDelimiter(line);
    headers = splitLine(line, delimiter);
    continue;
  }

  if (!line.trim()) continue;

  const values = splitLine(line, delimiter);
  const row = Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ""]));

  const agodaRow = {
    hotel_id: row.hotel_id || "",
    hotel_name: row.hotel_name || "",
    hotel_formerly_name: row.hotel_formerly_name || "",
    hotel_translated_name: row.hotel_translated_name || "",
    city: row.city || "",
    country: row.country || "",
    state: row.state || "",
    brand_name: row.brand_name || "",
    chain_name: row.chain_name || "",
    addressline1: row.addressline1 || "",
    latitude: row.latitude || "",
    longitude: row.longitude || "",
    normName: normalizeName(row.hotel_name || ""),
    normFormerName: normalizeName(row.hotel_formerly_name || ""),
    normTranslatedName: normalizeName(row.hotel_translated_name || ""),
    normCity: normalizeCity(row.city || ""),
    normCountry: normalizeCountry(row.country || "")
  };

  const candidates = chooseCandidates(agodaRow.normCountry);

  for (const o of candidates) {
    const scored = scoreCandidate(o, agodaRow);

    const prev = bestByOltraId.get(o.id) || [];
    prev.push({
      oltra_id: o.id,
      oltra_hotelid: o.hotelid,
      oltra_hotel_name: o.hotel_name,
      oltra_city: o.city,
      oltra_country: o.country,
      agoda_hotel_id: agodaRow.hotel_id,
      agoda_hotel_name: agodaRow.hotel_name,
      agoda_city: agodaRow.city,
      agoda_country: agodaRow.country,
      agoda_state: agodaRow.state,
      agoda_brand_name: agodaRow.brand_name,
      agoda_chain_name: agodaRow.chain_name,
      score: Number(scored.score.toFixed(2)),
      notes: scored.notes
    });

    prev.sort((a, b) => b.score - a.score);
    bestByOltraId.set(o.id, prev.slice(0, 3));
  }

  rowCount++;
  if (rowCount % 100000 === 0) {
    console.log(`Processed Agoda rows: ${rowCount}`);
  }
}

const results = [];
const review = [];

for (const o of oltra) {
  const top = bestByOltraId.get(o.id) || [];
  const best = top[0];
  const second = top[1];
  const status = classify(best, second, o);

  const row = {
    oltra_id: o.id,
    oltra_hotelid: o.hotelid,
    oltra_hotel_name: o.hotel_name,
    oltra_city: o.city,
    oltra_country: o.country,
    agoda_hotel_id: best?.agoda_hotel_id || "",
    agoda_hotel_name: best?.agoda_hotel_name || "",
    agoda_city: best?.agoda_city || "",
    agoda_country: best?.agoda_country || "",
    agoda_state: best?.agoda_state || "",
    agoda_brand_name: best?.agoda_brand_name || "",
    agoda_chain_name: best?.agoda_chain_name || "",
    score: best?.score ?? "",
    status,
    notes: best?.notes || "",
    second_best_agoda_hotel_id: second?.agoda_hotel_id || "",
    second_best_agoda_hotel_name: second?.agoda_hotel_name || "",
    second_best_score: second?.score ?? ""
  };

  results.push(row);

  if (status === "REVIEW_REQUIRED" || status === "NO_CANDIDATE") {
    review.push(row);
  }
}

const headersOut = [
  "oltra_id",
  "oltra_hotelid",
  "oltra_hotel_name",
  "oltra_city",
  "oltra_country",
  "agoda_hotel_id",
  "agoda_hotel_name",
  "agoda_city",
  "agoda_country",
  "agoda_state",
  "agoda_brand_name",
  "agoda_chain_name",
  "score",
  "status",
  "notes",
  "second_best_agoda_hotel_id",
  "second_best_agoda_hotel_name",
  "second_best_score"
];

function toCsv(rows) {
  return [
    headersOut.join(","),
    ...rows.map((r) => headersOut.map((h) => csvEscape(r[h])).join(","))
  ].join("\n");
}

await fsp.writeFile(path.join(outDir, "agoda_match_results.csv"), toCsv(results), "utf8");
await fsp.writeFile(path.join(outDir, "agoda_match_review.csv"), toCsv(review), "utf8");
await fsp.writeFile(path.join(outDir, "agoda_match_results.json"), JSON.stringify(results, null, 2), "utf8");

const summary = {
  total_oltra_hotels: results.length,
  match_strong: results.filter((r) => r.status === "MATCH_STRONG").length,
  match_possible: results.filter((r) => r.status === "MATCH_POSSIBLE").length,
  review_required: results.filter((r) => r.status === "REVIEW_REQUIRED").length,
  no_candidate: results.filter((r) => r.status === "NO_CANDIDATE").length,
  agoda_rows_processed: rowCount
};

await fsp.writeFile(path.join(outDir, "agoda_match_summary.json"), JSON.stringify(summary, null, 2), "utf8");

console.log(summary);
console.log(`Done:
- ${path.join(outDir, "agoda_match_results.csv")}
- ${path.join(outDir, "agoda_match_review.csv")}
- ${path.join(outDir, "agoda_match_results.json")}
- ${path.join(outDir, "agoda_match_summary.json")}`);
