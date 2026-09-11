const U=process.env.DIRECTUS_URL.replace(/\/+$/,""), T=process.env.DIRECTUS_TOKEN;
const H={Authorization:"Bearer "+T,"Content-Type":"application/json"};
const CONFIRM=process.argv.includes("--confirm");
const ID=2055, FROM="Innere Stadt, Petersplatz", TO="Innere Stadt";
const q=`${U}/items/hotels?limit=-1&filter[id][_eq]=${ID}&fields=id,hotel_name,city,local_area`;
const {data:r}=await (await fetch(q,{headers:H})).json();
const row=r[0];
const cur=String(row.local_area??"").trim();
console.log("["+ID+"] "+row.hotel_name.trim()+"  ("+row.city+")");
console.log("  "+JSON.stringify(cur)+" -> "+JSON.stringify(TO)+"   Petersplatz is a square; Innere Stadt is the district");
if(cur===TO){ console.log("  already set"); process.exit(0); }
if(cur!==FROM){ console.error("  ABORT — expected "+JSON.stringify(FROM)); process.exit(1); }
if(!CONFIRM){ console.log("\n  dry run — pass --confirm to write"); process.exit(0); }
const res=await fetch(`${U}/items/hotels/${ID}`,{method:"PATCH",headers:H,body:JSON.stringify({local_area:TO})});
if(!res.ok){ console.error("FAILED "+res.status); process.exit(1); }
const {data:v}=await (await fetch(q,{headers:H})).json();
console.log("  verified: "+JSON.stringify(v[0].local_area));
