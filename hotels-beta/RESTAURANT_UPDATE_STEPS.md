Updating Directus restaurants from JSON:
Insert output from prompt into restaurants_import.json
Then run from terminal:
pwd
ls scripts
DOTENV_CONFIG_PATH=.env.local node -r dotenv/config scripts/directus-upsert-restaurants.mjs --file scripts/restaurants_import.json


Cities included:
Paris
Lisbon
Rome
Copenhagen
London
Madrid
New York
Bangkok
Singapore
Milan*
Cannes / Nice area*
Amsterdam*
Prague*
Istanbul*
Mallorca*
Barcelona*
Saint Tropex / Ramatuelle*
