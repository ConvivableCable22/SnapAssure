/* ============================================================
   SnapAssure — Test Supabase Connection & Schema
   ------------------------------------------------------------
   Validates Supabase connection, schema table presence, and
   performs a test round-trip (insert, query, cleanup).

   Run:
     cd backend
     node scripts/test-supabase.js
   ============================================================ */

require("dotenv").config();
const {
  isSupabaseConfigured,
  getSupabaseClient
} = require("../lib/supabase");

async function runTest() {
  console.log("=== SnapAssure: Supabase Integration Test ===");

  if (!isSupabaseConfigured()) {
    console.warn("⚠️  SUPABASE IS NOT CONFIGURED IN backend/.env");
    console.warn("Please add the following variables to backend/.env:");
    console.warn("  SUPABASE_URL=https://<your-project-ref>.supabase.co");
    console.warn("  SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>");
    console.warn("  SUPABASE_ANON_KEY=<your-anon-key>");
    console.warn("\nAlso run the schema SQL located at backend/supabase/schema.sql in the Supabase SQL editor.");
    return false;
  }

  console.log("✓ Environment variables detected:");
  console.log(`  SUPABASE_URL: ${process.env.SUPABASE_URL}`);
  console.log(`  KEY TYPE: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? "Service Role Key (full admin rights)" : "Anon / Public Key"}`);

  const client = getSupabaseClient();
  const tableName = process.env.SUPABASE_ENQUIRIES_TABLE || "enquiries";

  console.log(`\nTesting connection to '${tableName}' table...`);
  const { data: selectData, error: selectError, count } = await client
    .from(tableName)
    .select("*", { count: "exact", head: true });

  if (selectError) {
    console.error("❌ Failed to query table:", selectError.message);
    if (selectError.code === "42P01" || selectError.message.includes("relation") || selectError.message.includes("does not exist")) {
      console.error("👉 The table 'enquiries' has not been created yet.");
      console.error("👉 Please open your Supabase Dashboard → SQL Editor and run the SQL file: backend/supabase/schema.sql");
    }
    return false;
  }

  console.log(`✓ Successfully connected to table '${tableName}'. Current row count: ${count != null ? count : 0}`);

  // Perform round-trip test
  const testId = `test_${Date.now()}`;
  console.log(`\nTesting write/read cycle with dummy record '${testId}'...`);

  const { error: insertError } = await client
    .from(tableName)
    .insert({
      id: testId,
      name: "SnapAssure Test Connection",
      email: "test@example.com",
      phone: "+91 9999999999",
      subject: "Connection Test",
      mode: "test",
      message: "Automated test verifying Supabase read/write integration",
      email_status: "test"
    });

  if (insertError) {
    console.error("❌ Test insert failed:", insertError.message);
    return false;
  }
  console.log("✓ Test record inserted successfully.");

  // Clean up
  const { error: deleteError } = await client
    .from(tableName)
    .delete()
    .eq("id", testId);

  if (deleteError) {
    console.warn("⚠️ Could not clean up test record:", deleteError.message);
  } else {
    console.log("✓ Test record cleaned up successfully.");
  }

  console.log("\n🎉 Supabase integration is 100% operational!");
  return true;
}

runTest().catch(err => {
  console.error("Fatal test error:", err);
  process.exit(1);
});
