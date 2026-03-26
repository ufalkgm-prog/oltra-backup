const API_TOKEN = process.env.TRAVELPAYOUTS_API_TOKEN!;
const PARTNER_ID = process.env.TRAVELPAYOUTS_PARTNER_ID!;

if (!API_TOKEN || !PARTNER_ID) {
  throw new Error("Missing Travelpayouts env variables");
}

export async function startFlightSearch(params: {
  origin: string;
  destination: string;
  departureDate: string;
  adults: number;
}) {
  const response = await fetch("https://api.travelpayouts.com/aviasales/v3/prices_for_dates", {
    method: "GET",
    headers: {
      "X-Access-Token": API_TOKEN,
    },
  });

  const data = await response.json();
  return data;
}