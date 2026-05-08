This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Duffel flights integration

OLTRA uses the [Duffel API](https://duffel.com/docs) for flight search and concierge hand-off. Booking is **not** handled on-site — searches surface offers which are then passed to the concierge team.

### Environment variables

Add these to `.env.local` (local) and the Vercel project settings (deployed):

| Variable | When used |
|---|---|
| `DUFFEL_ACCESS_TOKEN_TEST` | All environments except `VERCEL_ENV=production` |
| `DUFFEL_ACCESS_TOKEN_LIVE` | `VERCEL_ENV=production` only |

The active token is selected automatically in `src/lib/flights/duffelClient.ts`.

### API routes

All routes are server-side only — the Duffel token is never exposed to the client.

| Route | Method | Purpose |
|---|---|---|
| `/api/flights/search` | `POST` | Create an offer request via Duffel. Results cached in-memory for 15 min per unique param set. |
| `/api/flights/offer/[id]` | `GET` | Refresh a single offer's price and availability. |
| `/api/flights/inquiry` | `POST` | Accept contact details + offer snapshot, re-fetch latest offer, and send a concierge inquiry email (email delivery is a placeholder — wire up a provider in `src/app/api/flights/inquiry/route.ts`). |

### POST `/api/flights/search` body

```json
{
  "origin": "LHR",
  "destination": "JFK",
  "departureDate": "2026-08-01",
  "returnDate": "2026-08-10",
  "adults": 2,
  "children": 0,
  "infants": 0,
  "cabinClass": "business"
}
```

`returnDate` is optional (omit for one-way). `cabinClass` defaults to `"business"`.

### POST `/api/flights/inquiry` body

```json
{
  "offerId": "off_...",
  "offerSnapshot": { /* full Offer object captured at selection time */ },
  "contact": { "name": "Jane Smith", "email": "jane@example.com", "phone": "+44..." },
  "notes": "Window seat preferred"
}
```

### Wiring up email delivery

Open `src/app/api/flights/inquiry/route.ts` and find the `// TODO: wire up email delivery` comment. Replace the `console.log` block with your chosen provider (Resend, SendGrid, etc.) using the pre-built `emailPayload` object.

### Test page

Visit `/flights/test` in development to exercise the search endpoint end-to-end.

> **Cache note:** the in-memory cache works within a single Vercel lambda instance. Cache is not shared across concurrent instances. For a production-grade shared cache, replace the `Map` in `src/app/api/flights/search/route.ts` with Redis / KV.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
