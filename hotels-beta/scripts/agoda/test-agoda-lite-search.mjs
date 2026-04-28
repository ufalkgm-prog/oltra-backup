const SITE_ID = process.env.AGODA_SITE_ID;
const API_KEY = process.env.AGODA_API_KEY;

const body = {
  criteria: {
    additional: {
      currency: "USD",
      discountOnly: false,
      language: "en-us",
      occupancy: {
        numberOfAdult: 2,
        numberOfChildren: 0,
      },
    },
    checkInDate: "2026-09-15",
    checkOutDate: "2026-09-16",
    hotelId: [1156538],
  },
  siteid: Number(SITE_ID),
  apikey: API_KEY,
};

const response = await fetch(
  "http://affiliateapi7643.agoda.com/affiliateservice/lt_v1",
  {
    method: "POST",
    headers: {
      "Accept-Encoding": "gzip,deflate",
      Authorization: `${SITE_ID}:${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  }
);

console.log("HTTP", response.status);
console.log(await response.text());