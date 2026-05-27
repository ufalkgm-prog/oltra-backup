#!/usr/bin/env node
// One-shot script: push descriptions + lat/lng for hotels 1825–1840
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const DIRECTUS_URL = process.env.DIRECTUS_URL?.replace(/\/+$/, '');
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;

if (!DIRECTUS_URL || !DIRECTUS_TOKEN) throw new Error('Missing DIRECTUS_URL or DIRECTUS_TOKEN');

const hotels = [
  {
    id: 1825,
    lat: 25.1124,
    lng: 55.1379,
    description: "Rising 43 floors above the tip of Palm Jumeirah, Atlantis The Royal is Dubai's most theatrical luxury address. Its cascading architecture houses 795 rooms and suites, a sky pool suspended between towers 90 metres up, and a dining roster that includes Nobu, Heston Blumenthal, and José Andrés. Beyond the spectacle, the property delivers genuine resort depth — from a private beach to the Aquaventure waterpark — making it as much a destination as a hotel.",
  },
  {
    id: 1826,
    lat: 20.8747,
    lng: -89.7447,
    description: "Set on a 750-acre hacienda an hour from Mérida, Chablé Yucatán is built around a natural cenote that anchors one of Mexico's most celebrated spa programmes. The 38 private casitas are scattered through tropical gardens, each with a private plunge pool and a palapa terrace that opens to the surrounding jungle. The cuisine draws directly from Yucatecan ingredients and traditions, and the property's focus on indigenous wellness rituals gives it a depth rare among resort destinations.",
  },
  {
    id: 1827,
    lat: 22.2796,
    lng: 114.1643,
    description: "Designed by André Fu and occupying the top 17 floors of Pacific Place in Admiralty, Upper House is a study in restraint within one of Asia's most frenetic cities. All 117 rooms begin at 60 square metres — unusually generous by Hong Kong standards — dressed in warm natural materials with views across Victoria Harbour or the Peak. The absence of conference facilities and excessive programming keeps the focus squarely on considered service and quiet.",
  },
  {
    id: 1828,
    lat: -22.9669,
    lng: -43.1761,
    description: "Open since 1923, the Copacabana Palace occupies the most storied stretch of Rio's four-kilometre beach promenade. Its white neoclassical facade, colonnaded poolside, and formal dining rooms preserve the air of a Golden Age grand hotel while the surrounding city has changed beyond recognition. Heads of state, film stars, and carnival royalty have all stayed here — the property's position at the intersection of carioca culture and old-world luxury remains unmatched.",
  },
  {
    id: 1829,
    lat: 39.8989,
    lng: 116.3942,
    description: "A rare feat of preservation in Beijing's historic core, the Mandarin Oriental Qianmen occupies 42 meticulously restored hutong courtyard homes linked by covered walkways south of Tiananmen Square. Each of the 73 rooms and suites sits within a distinct traditional structure, pairing grey-tiled rooflines and moon gates with contemporary interiors. The surrounding Qianmen neighbourhood — once the heart of imperial-era commerce — remains the most atmospheric quarter of old Beijing.",
  },
  {
    id: 1830,
    lat: 25.1413,
    lng: 55.1841,
    description: "Opened in 2023 as Jumeirah's second peninsula hotel, Marsa Al Arab extends the original resort complex toward the Arabian Gulf on its own private land. Its 386 suites and villas, a dedicated marina, and access to the Madinat Jumeirah lagoon network make it one of Dubai's most complete resort addresses. The property operates at a more intimate scale than the family-oriented properties nearby, with clear sightlines across the water to the Burj Al Arab.",
  },
  {
    id: 1831,
    lat: 42.3895,
    lng: 11.2085,
    description: "Carved into the cliffside above the Tyrrhenian Sea on the Argentario promontory, Il Pellicano has been the summer address of European style since 1965. The original property was built by an English couple as a private escape; today its terracotta villas, sea-water pool hewn from rock, and Michelin-starred restaurant still feel like a place known only to the right people. July and August bring the Italian design and fashion world; the rest of the year, near-solitude.",
  },
  {
    id: 1832,
    lat: 51.5026,
    lng: -0.1538,
    description: "The Emory occupies a striking curved tower at the edge of Hyde Park, developed by the Maybourne group as its most design-forward property. All 61 suites were individually commissioned from a different architect or designer — a curatorial ambition that gives each room a distinct character while the whole coheres through shared material quality. The ground-floor Akira Back restaurant brings a Korean-Japanese perspective to one of London's most food-conscious neighbourhoods; the rooftop bar surveys the park beyond.",
  },
  {
    id: 1833,
    lat: 20.7297,
    lng: -86.9751,
    description: "Maroma occupies one of the finest stretches of the Riviera Maya coast, where the beach remains powdery white and the water shifts between turquoise and deep blue through the day. The 65 suites reference local hacienda architecture — thick walls, thatched roofs, hand-painted Talavera tiles — while Belmond's stewardship has sharpened both the food and spa offerings. The Kinan spa draws on pre-Hispanic Mayan ritual; the beach, largely unshared, remains the defining experience.",
  },
  {
    id: 1834,
    lat: 25.1857,
    lng: 55.2633,
    description: "The Lana marks the Dorchester Collection's first foray into the Middle East, rising above the Marasi Marina in Business Bay. Designed by Foster + Partners, the 225-room tower integrates a below-ground spa, rooftop pool, and three restaurants within a coherent vertical scheme. The interiors draw on Levantine and North African craft traditions through brasswork, hand-knotted textiles, and terrazzo — softening a building whose location bridges Downtown Dubai and the DIFC.",
  },
  {
    id: 1835,
    lat: 35.6657,
    lng: 139.7423,
    description: "Janu Tokyo launched in 2024 as the debut property of Aman's sister brand, designed by Jean-Michel Gathy within the Azabudai Hills development in Minato-ku. The 122 rooms reflect a more social philosophy than Aman's signature solitude, expressed through eight dining destinations — including a sumibiyaki omakase restaurant — and one of Tokyo's largest hotel wellness spaces. The address keeps Roppongi, Toranomon Hills, and the waterfront within easy reach.",
  },
  {
    id: 1836,
    lat: 20.7618,
    lng: -105.3839,
    description: "Mandarina is built into a steep hillside on the Riviera Nayarit coast where subtropical forest meets the Pacific. The 105 accommodations — palafito treehouses raised on stilts and cliff villas cantilevered over the ocean — were designed to minimise ground disturbance and maximise immersion in the surrounding ecology. The property spans 240 hectares, includes a natural cenote, and delivers access to the beach below via funicular. Its scale and ecological ambition set it apart from standard resort typologies.",
  },
  {
    id: 1837,
    lat: 23.0451,
    lng: -109.7053,
    description: "Las Ventanas opened in 1997 on the Sea of Cortés side of the Baja peninsula, long before Los Cabos became a global resort corridor. The property's low-rise adobe architecture, telescope-equipped suites, and handcrafted Mexican furniture remain defining features; Rosewood's stewardship since 2014 has deepened rather than altered that identity. The beach here is calmer than the Pacific side, the desert landscape more present, and the food programme — rooted in Baja Med cuisine — among the best in the region.",
  },
  {
    id: 1838,
    lat: 51.7764,
    lng: -1.4846,
    description: "Estelle Manor opened in 2023 within a restored Edwardian country house and estate buildings near Eynsham in West Oxfordshire, surrounded by 3,000 acres of parkland. The rooms span the main house, converted farm buildings, and a stable block; the grounds include a walled kitchen garden supplying the restaurants and a Roman-inspired thermal spa — the Eynsham Baths — set in ancient woodland. The ethos is deliberately informal for a house of its scale, closer to an elevated house party than a conventional country hotel.",
  },
  {
    id: 1839,
    lat: 45.0798,
    lng: 13.6450,
    description: "Designed by Piero Lissoni and opened in 2019, Grand Park Hotel Rovinj sits at the edge of the sea within the historic hotel park facing the old town's terracotta roofline across the water. The interiors pair Lissoni's signature restraint with local Istrian stone and hand-selected furnishings; the outdoor saltwater pool is among the most photographed on the Adriatic. Two restaurants hold Michelin stars — exceptional for a Croatian property — while the hotel's scale remains proportionate to the intimate character of Rovinj itself.",
  },
  {
    id: 1840,
    lat: -8.4974,
    lng: 115.2627,
    description: "Mandapa occupies a riverside position in the Kedewatan valley north of Ubud, where the Ayung river runs below forested slopes and working rice terraces. The 35 suites and villas — all with private pools — are arranged to preserve sightlines across the landscape rather than toward each other. The property's immersion programme connects guests with local Balinese traditions: rice planting, temple ceremonies, and offerings prepared alongside the resident priest. The spa, set above the river, focuses on water-based Balinese healing practices.",
  },
];

async function patch(id, payload) {
  const res = await fetch(`${DIRECTUS_URL}/items/hotels/${id}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${DIRECTUS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`PATCH ${id} failed ${res.status}: ${err}`);
  }
  return res.json();
}

let ok = 0;
let fail = 0;

for (const h of hotels) {
  const { id, lat, lng, description } = h;
  try {
    await patch(id, { description, lat, lng });
    console.log(`✓ ${id}`);
    ok++;
  } catch (e) {
    console.error(`✗ ${id}: ${e.message}`);
    fail++;
  }
}

console.log(`\nDone: ${ok} patched, ${fail} failed`);
