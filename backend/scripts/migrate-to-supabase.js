/* ============================================================
   SnapAssure — Migrate Local Enquiries to Supabase
   ------------------------------------------------------------
   Reads all existing enquiry records from backend/data/enquiries.json
   and uploads/upserts them into the Supabase 'enquiries' table.
   
   Run:
     cd backend
     node scripts/migrate-to-supabase.js
   ============================================================ */

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const {
  isSupabaseConfigured,
  getSupabaseClient,
  mapEnquiryToDbRow
} = require("../lib/supabase");

async function migrate() {
  console.log("=== SnapAssure: Local Enquiries → Supabase Migration ===");

  if (!isSupabaseConfigured()) {
    console.error("❌ Supabase is not configured in backend/.env!");
    console.error("Please add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to backend/.env first.");
    process.exit(1);
  }

  const client = getSupabaseClient();
  const dataFile = path.join(__dirname, "..", "data", "enquiries.json");

  if (!fs.existsSync(dataFile)) {
    console.log("ℹ️ No local enquiries file found at backend/data/enquiries.json. Nothing to migrate.");
    return;
  }

  let localEnquiries = [];
  try {
    localEnquiries = JSON.parse(fs.readFileSync(dataFile, "utf8") || "[]");
  } catch (err) {
    console.error("❌ Failed to read or parse backend/data/enquiries.json:", err.message);
    process.exit(1);
  }

  console.log(`Found ${localEnquiries.length} local enquiries to migrate.`);
  if (localEnquiries.length === 0) {
    console.log("No records to migrate.");
    return;
  }

  const tableName = process.env.SUPABASE_ENQUIRIES_TABLE || "enquiries";
  const rows = localEnquiries.map(mapEnquiryToDbRow);

  console.log(`Upserting ${rows.length} records into '${tableName}' table...`);

  // Batch upsert in chunks of 50
  const chunkSize = 50;
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { data, error } = await client
      .from(tableName)
      .upsert(chunk, { onConflict: "id" });

    if (error) {
      console.error(`❌ Batch error on records ${i + 1}-${i + chunk.length}:`, error.message);
      failCount += chunk.length;
    } else {
      successCount += chunk.length;
      console.log(`✓ Migrated ${successCount}/${rows.length} records...`);
    }
  }

  console.log("\n=== Migration Completed ===");
  console.log(`Successfully migrated: ${successCount}`);
  if (failCount > 0) {
    console.log(`Failed records: ${failCount}`);
  }
}

migrate().catch(err => {
  console.error("Fatal migration error:", err);
  process.exit(1);
});
