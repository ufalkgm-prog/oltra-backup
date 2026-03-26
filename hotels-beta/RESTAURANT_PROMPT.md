Task: Identify the 25 most relevant high-end restaurants in SINGAPORE, SINGAPORE for a luxury dining customer, and output the results in a format that maps cleanly into a Directus restaurants database.
The objective is not to create a generic “best restaurants” list.
The objective is to identify the restaurants that are most relevant to an affluent, international, design-conscious diner, typically aged 35+, choosing where to book for lunch or dinner.
The final list should combine:
1. the city’s Michelin-starred restaurants and any restaurants recognized by World’s 50 Best Restaurants, and
2. the strongest non-Michelin alternatives targeting the same luxury customer segment.
These non-Michelin restaurants should be places that a Michelin customer would realistically consider booking instead of a Michelin restaurant on a given night: venues with similar spending power, clientele, and culinary standards, often with stronger atmosphere, design, or social appeal.

________________________________________
Core definition of relevance
Focus on restaurants that typically have:
• typical spend of roughly EUR 100+ per person
• strong culinary reputation
• high-quality service
• strong wine, cocktail, or beverage program
• appeal to affluent locals, international visitors, and business travelers
• distinctive atmosphere such as:
o luxury interior design
o historic architecture
o terrace
o waterfront
o skyline views
o garden setting
o luxury hotel setting
• a clearly defined style such as:
o elegant contemporary
o luxury bistro
o grand brasserie
o design-led destination restaurant
o upscale seafood restaurant
o fashionable Mediterranean
o upscale Asian

________________________________________
Include
Include restaurants that fall into one or more of these categories:
• Michelin-starred restaurants
• Bib Gourmand restaurants only if they target the same affluent segment
• World’s 50 Best Restaurants
• chef-driven high-end restaurants
• luxury bistros
• upscale seafood restaurants
• fashionable destination restaurants
• design-led dining rooms
• affluent-crowd favorites that compete with Michelin restaurants

________________________________________
Exclude
Exclude:
• casual restaurants
• bakeries
• cafés
• wine bars without a serious restaurant offer
• street food
• market stalls
• quick-service concepts
• low- to mid-market neighborhood restaurants
• purely trendy restaurants without culinary credibility

________________________________________
Sources
Use a mix of global and local authoritative sources.
Prioritize:
• Michelin Guide
• The World’s 50 Best Restaurants
• La Liste
• Opinionated About Dining
• Condé Nast Traveler
• Travel + Leisure
• Financial Times / FT Globetrotter
• Bloomberg
• Monocle
• Elite Traveler
• Eater
• The Infatuation
• Time Out
• Resy
• World of Mouth
Also use respected national or local restaurant criticism.
Do not rely solely on Michelin.
The goal is to capture the true luxury dining market in the city.

________________________________________
Geolocation and link verification requirements
For each restaurant, determine and verify:
• latitude
• longitude
• official website
• official Instagram account

Use reliable mapping and official brand sources such as:
• Google Maps
• Apple Maps
• OpenStreetMap
• official restaurant websites
• official hotel websites if the restaurant is inside a hotel
• official Instagram accounts linked from the restaurant website or hotel website
• official Google Business / map listing where clearly tied to the restaurant

Coordinates must represent the restaurant location, not the city center.
Return coordinates in decimal format.
Example:
"lat": 38.7076
"lng": -9.1410

Rules for lat/lng:
• Prefer coordinates verified via Google Maps or OpenStreetMap
• Use 4–6 decimal precision
• If the restaurant is inside a hotel, coordinates may match the hotel building
• Do not leave lat/lng unresearched
• Actively verify coordinates for every selected restaurant before final output
• If reliable coordinates still cannot be confirmed after checking mapping sources:
"lat": null
"lng": null
• Do not output empty strings for coordinates

Rules for www:
• Populate with the official restaurant website if verified
• If the restaurant is inside a hotel and uses the hotel’s official restaurant page, use that page
• Prefer the restaurant’s own official URL over directory/listing pages
• Do not use booking platforms, review sites, or press articles as the www value
• Do not leave www unresearched
• If no official website can be verified after checking official sources:
"www": ""

Rules for insta:
• Populate with the official Instagram account if verified
• Prefer the restaurant’s own official Instagram
• If the restaurant is inside a hotel and only the hotel officially represents the restaurant on Instagram, that hotel Instagram may be used only if clearly tied to the restaurant
• Do not use fan accounts, reseller accounts, hashtag pages, or uncertain accounts
• Do not leave insta unresearched
• If no official Instagram can be verified after checking official sources:
"insta": ""

________________________________________
Required method
Step 1 — Longlist
Build a longlist including:
• all Michelin-starred restaurants
• all World’s 50 Best restaurants in the city
• strong non-Michelin alternatives serving the same affluent segment

Step 2 — Select the final 25
Select the 25 restaurants most relevant to a luxury diner.
These should represent the true high-end dining consideration set in the city.

Step 3 — Verify geolocation and official links
For each of the final 25 restaurants, explicitly verify:
• lat
• lng
• www
• insta

Check mapping sources and official brand sources before finalizing the record.
Do not skip this enrichment step.
The final output must already include researched and verified values for these fields wherever possible.

________________________________________
Ranking criteria
Rank restaurants by:
1. culinary reputation
2. relevance to affluent diners
3. quality of setting and design
4. strength of concept
5. frequency of mention across trusted sources
6. credibility as an alternative to Michelin dining

Favor restaurants with strong atmosphere and social appeal over technically strong but less compelling venues.

________________________________________
Output instructions
Return only valid JSON.
Do not include explanations or markdown.
Return exactly 25 restaurants, ranked 1–25.

________________________________________
Required fields
Each restaurant must include exactly these fields:
rank
restaurant_name
slug
description
highlights
cuisine
country
region
city
local_area
state_province__county__island
lat
lng
restaurant_setting
restaurant_style
www
insta
awards
sources
hotel_name_hint
status

________________________________________
Field formatting rules
rank
Integer 1–25.

________________________________________
restaurant_name
Public restaurant name.

________________________________________
slug
Lowercase kebab-case.
Example:
Belcanto → belcanto
JNcQUOI Avenida → jncquoi-avenida

________________________________________
description
2–4 polished editorial sentences suitable for a luxury travel platform.

________________________________________
highlights
Short summary highlighting cuisine, atmosphere, and relevance.

________________________________________
cuisine
Use one primary cuisine phrase.
Examples:
Contemporary French
Modern Japanese
Luxury Mediterranean
Upscale Seafood

________________________________________
country
France

________________________________________
region
Ile-de-France

________________________________________
city
Paris

________________________________________
local_area
Use the best-known district.
Examples:
Saint-Germain-des-Pres
Marais
Golden Triangle
Palais-Royal

________________________________________
state_province__county__island
Populate only if clearly relevant.
Otherwise:
""

________________________________________
lat
Decimal latitude.
Example:
48.8566
If unknown after verification:
null

________________________________________
lng
Decimal longitude.
Example:
2.3522
If unknown after verification:
null

________________________________________
restaurant_setting
Use one primary setting phrase.
Examples:
Luxury hotel dining room
Rooftop terrace
Historic interior
Design-led dining room
Skyline view
Waterfront setting

________________________________________
restaurant_style
Use one primary style phrase.
Examples:
Global fine dining
Luxury destination restaurant
Luxury bistro
High-end local institution
Fashionable seafood destination

________________________________________
www
Official website if verified after explicit research.
Otherwise:
""

________________________________________
insta
Official Instagram if verified after explicit research.
Otherwise:
""

________________________________________
awards
Return a JSON array using ONLY these exact Directus values:
michelin_3
michelin_2
michelin_1
worlds_50
laliste100
Examples:
["michelin_2"]
["michelin_2","worlds_50"]
[]
Rules:
• Use only these exact values
• Do not output human-readable award names
• Do not output any other values

________________________________________
sources
Return as a single text string listing the sources used.
Example:
"Michelin Guide; Time Out; Condé Nast Traveler"

________________________________________
hotel_name_hint
Populate if the restaurant is inside a hotel.
Examples:
Cheval Blanc Paris
La Reserve Paris
Le Bristol Paris
Otherwise:
""

________________________________________
status
Always:
"published"

________________________________________
Required JSON structure
[
{
"rank": 1,
"restaurant_name": "",
"slug": "",
"description": "",
"highlights": "",
"cuisine": "",
"country": "",
"region": "",
"city": "",
"local_area": "",
"state_province__county__island": "",
"lat": null,
"lng": null,
"restaurant_setting": "",
"restaurant_style": "",
"www": "",
"insta": "",
"awards": [],
"sources": "",
"hotel_name_hint": "",
"status": "published"
}
]

Final output requirements:
- Return only one raw JSON array.
- The JSON must be fully valid and parseable with JSON.parse.
- Every object must be on a single line where possible, and no string value may contain any newline, carriage return, or tab characters.
- Do not wrap lines inside quoted strings.
- Do not insert line breaks inside URLs.
- Use only straight ASCII double quotes for JSON strings.
- Escape any internal double quotes correctly.
- Before returning, perform a final internal check that the entire response is valid minified JSON and that copying it directly into a .json file will parse without edits.
- lat, lng, www, and insta must be explicitly researched before final output and should be populated whenever verification is possible.
- ALWAYS provide output in a copy-paste box.