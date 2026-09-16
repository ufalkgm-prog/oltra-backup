# myOLTRA — ETG endpoints against our flow

**Draft for review, 2026-09-16.** Integration model: Affiliate API, White Label. Certification scope confirmed by ETG: General, Static Data, Search step.

myOLTRA owns discovery (search, hotel page, rate selection, Prebook). Checkout continues in the White Label, which ETG have not yet specified. Our servers never call any booking, payment or order-management endpoint.

```mermaid
flowchart TD
  classDef used fill:#e8f1e6,stroke:#4f7a4a,color:#1d2b1b
  classDef offline fill:#e9eef5,stroke:#5a6f8c,color:#1b2533
  classDef unused fill:#f2f2f2,stroke:#b0b0b0,color:#8a8a8a,stroke-dasharray: 4 3
  classDef ours fill:#ffffff,stroke:#333,color:#111
  classDef pending fill:#fff6e0,stroke:#c79a2b,color:#4a3a10,stroke-dasharray: 6 3

  subgraph OFFLINE["Offline — scheduled, never during a user session"]
    SYNC["Daily static-content sync"]:::ours --> CONTENT["POST /api/content/v1/hotel_content_by_ids/<br/>batches of 100 hids"]:::offline
    CONTENT --> DB[("Our hotel database<br/>room groups, images, metapolicy,<br/>check-in/out times")]:::ours
  end

  subgraph SEARCH["Search step — live"]
    A["Guest enters destination, dates,<br/>guests (children with ages),<br/>rooms, passport country"]:::ours
    A --> SERP["POST /api/b2b/v3/search/serp/hotels/<br/>hids ≤ 300 per request · timeout 30<br/>lowest rate per hotel only"]:::used
    SERP --> B["Results list with one headline<br/>price per hotel"]:::ours
    B -->|guest opens a hotel| HP["POST /api/b2b/v3/search/hp/<br/>one hid · timeout 30<br/>all rates, never cached"]:::used
    DB -.->|static data read from our DB,<br/>not from ETG| C
    HP --> C["Hotel page: every rate, taxes,<br/>cancellation schedule, meal,<br/>hotel policies (metapolicy)"]:::ours
    C -->|guest selects a room type<br/>and clicks Continue| PRE["POST /api/b2b/v3/hotel/prebook/<br/>hash h-… · price_increase_percent 10<br/>never cached"]:::used
    PRE --> D{"Price, meal or<br/>cancellation changed?"}:::ours
    D -->|yes| E["Change shown to guest:<br/>accept or back to rooms"]:::ours
    D -->|no| F["Rate confirmed<br/>p-… hash held"]:::ours
    E -->|accept| F
  end

  F ==> WL["White Label checkout<br/>redirect format pending ETG"]:::pending

  subgraph NOTUSED["Not used by myOLTRA"]
    R["/search/serp/region/"]:::unused
    G["/search/serp/geo/"]:::unused
    SP["/search/serp/prebook/ (prebook from search step)"]:::unused
    I["/hotel/info/ (no live calls — static data comes from the offline sync)"]:::unused
    MC["/search/multicomplete/"]:::unused
    O["/hotel/order/* — booking form, finish, status, cancel, info<br/>(White Label handles booking; blocked at our proxy)"]:::unused
  end
```

## Endpoint summary

| ETG endpoint | Used | Where in our flow | Notes |
|---|---|---|---|
| `/api/b2b/v3/search/serp/hotels/` | **Yes** | Results list (Hotels page, landing summary, concierge result cards) | Our own hotel IDs (`hids`), at most 300 per request (larger sets are split and sent one after another). `residency` and `timeout: 30` sent on every request. Headline price only; no rate is selectable from this response. |
| `/api/b2b/v3/search/region/` (`serp/region`) | No | — | We search our own curated hotel IDs, never a whole region. |
| `/api/b2b/v3/search/serp/geo/` | No | — | Map views use our stored coordinates, and prices come from `serp/hotels` for the hotels shown. |
| `/api/b2b/v3/search/hp/` | **Yes** | Hotel page, when a guest opens a hotel | Full rate list. `residency` and `timeout: 30` sent. Never cached. |
| `/api/b2b/v3/hotel/prebook/` | **Yes** | Guest selects a room type and clicks Continue | Separate step inside search, never part of a booking flow. `price_increase_percent: 10`; every change to price, meal or cancellation is shown before the guest continues. Never cached. |
| `/api/b2b/v3/search/serp/prebook/` | No | — | We prebook only from the hotel page (h- hash). |
| `/api/content/v1/hotel_content_by_ids/` | **Yes, offline** | Daily scheduled sync | Static data is never fetched during a user session. |
| `/api/b2b/v3/hotel/info/` | No live use | — | Replaced by the Content API sync. |
| `/api/b2b/v3/hotel/order/*` | **No** | — | Booking belongs to the White Label. Our forwarding proxy refuses these paths. |

> **Reviewer note (remove before sending):** the static sync runs through the whitelisted proxy but, per §48, its Railway cron service had not been deployed as of the last record. If it is still not deployed, say "scheduled offline sync" only once it is.
