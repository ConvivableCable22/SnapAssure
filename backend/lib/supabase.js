/* ============================================================
   SnapAssure — Supabase Client & Database Services
   ------------------------------------------------------------
   Provides connection and operations for Supabase PostgreSQL:
     - Enquiry storage & retrieval
     - Delivery status updates
     - SOMA AI chat session logging & analytics
     - Safe fallbacks when Supabase is not configured or offline
   ============================================================ */

const { createClient } = require("@supabase/supabase-js");

let supabaseClient = null;

/**
 * Checks whether Supabase environment variables are provided.
 */
function isSupabaseConfigured() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;
  return Boolean(url && key && url.trim() && key.trim());
}

/**
 * Returns a singleton Supabase client instance, or null if unconfigured.
 */
function getSupabaseClient() {
  if (!isSupabaseConfigured()) {
    return null;
  }
  if (!supabaseClient) {
    const url = process.env.SUPABASE_URL.trim();
    // Prefer service role key for backend operations (bypasses RLS for admin writes)
    const key = (
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      process.env.SUPABASE_KEY
    ).trim();

    supabaseClient = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
  }
  return supabaseClient;
}

/**
 * Converts a camelCase enquiry object into the database schema format.
 */
function mapEnquiryToDbRow(enquiry) {
  return {
    id: enquiry.id,
    name: enquiry.name || "",
    email: enquiry.email || "",
    phone: enquiry.phone || "",
    subject: enquiry.subject || (enquiry.mode === "quote" ? "Request a Quote" : "General Enquiry"),
    mode: enquiry.mode || "enquiry",
    event_type: enquiry.eventType || enquiry.event_type || null,
    event_date: enquiry.eventDate || enquiry.event_date || null,
    city: enquiry.city || null,
    guests: enquiry.guests != null ? String(enquiry.guests) : null,
    experience: enquiry.experience || null,
    message: enquiry.message || null,
    email_status: enquiry.emailStatus || enquiry.email_status || "pending",
    email_error: enquiry.emailError || enquiry.email_error || null,
    sent_at: enquiry.sentAt || enquiry.sent_at || null,
    submitted_at: enquiry.submittedAt || enquiry.submitted_at || new Date().toISOString(),
    formatted_date: enquiry.formattedDate || enquiry.formatted_date || null
  };
}

/**
 * Converts a database row back into the standard camelCase enquiry format.
 */
function mapDbRowToEnquiry(row) {
  return {
    id: row.id,
    submittedAt: row.submitted_at,
    formattedDate: row.formatted_date,
    name: row.name,
    email: row.email,
    phone: row.phone,
    subject: row.subject,
    mode: row.mode,
    eventType: row.event_type || "Not specified",
    eventDate: row.event_date || "Not specified",
    city: row.city || "Not specified",
    guests: row.guests || "Not specified",
    experience: row.experience || "Not specified",
    message: row.message || "",
    emailStatus: row.email_status || "pending",
    emailError: row.email_error,
    sentAt: row.sent_at,
    createdAt: row.created_at
  };
}

/**
 * Inserts or updates an enquiry record in Supabase.
 * Returns { ok: true, data } or { ok: false, error }.
 */
async function saveEnquiryToSupabase(enquiry) {
  const client = getSupabaseClient();
  if (!client) {
    return { ok: false, error: "Supabase not configured" };
  }

  try {
    const row = mapEnquiryToDbRow(enquiry);
    const tableName = process.env.SUPABASE_ENQUIRIES_TABLE || "enquiries";

    const { data, error } = await client
      .from(tableName)
      .upsert(row, { onConflict: "id" })
      .select()
      .single();

    if (error) {
      console.error("[Supabase] Error inserting enquiry:", error.message);
      return { ok: false, error: error.message };
    }

    console.log(`[Supabase] Enquiry saved successfully (${row.id})`);
    return { ok: true, data };
  } catch (err) {
    console.error("[Supabase] Unexpected error inserting enquiry:", err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Updates delivery status of an enquiry in Supabase.
 */
async function updateEnquiryStatusInSupabase(id, { success, error = null }) {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: "Supabase not configured" };

  try {
    const tableName = process.env.SUPABASE_ENQUIRIES_TABLE || "enquiries";
    const updatePayload = {
      email_status: success ? "sent" : "failed",
      email_error: error ? String(error) : null,
      sent_at: success ? new Date().toISOString() : null
    };

    const { error: updateError } = await client
      .from(tableName)
      .update(updatePayload)
      .eq("id", id);

    if (updateError) {
      console.error(`[Supabase] Failed to update enquiry status for ${id}:`, updateError.message);
      return { ok: false, error: updateError.message };
    }

    console.log(`[Supabase] Updated status for ${id}: ${updatePayload.email_status}`);
    return { ok: true };
  } catch (err) {
    console.error(`[Supabase] Exception updating status for ${id}:`, err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Fetches enquiries from Supabase with pagination.
 */
async function fetchEnquiriesFromSupabase({ limit = 50, offset = 0 } = {}) {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const tableName = process.env.SUPABASE_ENQUIRIES_TABLE || "enquiries";
    const { data, error, count } = await client
      .from(tableName)
      .select("*", { count: "exact" })
      .order("submitted_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("[Supabase] Error fetching enquiries:", error.message);
      return null;
    }

    return {
      total: count != null ? count : (data ? data.length : 0),
      enquiries: (data || []).map(mapDbRowToEnquiry)
    };
  } catch (err) {
    console.error("[Supabase] Unexpected error fetching enquiries:", err.message);
    return null;
  }
}

/**
 * Logs a SOMA AI conversation interaction into Supabase for business intelligence.
 */
async function logChatToSupabase({ sessionId = null, userMessage, reply, action = null, clientIp = null }) {
  const client = getSupabaseClient();
  if (!client) return false;

  try {
    const tableName = process.env.SUPABASE_CHAT_LOGS_TABLE || "chat_logs";
    const { error } = await client.from(tableName).insert({
      session_id: sessionId,
      user_message: String(userMessage || "").slice(0, 2000),
      reply: String(reply || "").slice(0, 4000),
      action: action || null,
      client_ip: clientIp || null
    });

    if (error) {
      // Don't throw — chat logs are non-critical
      console.warn("[Supabase] Chat log insert warning:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[Supabase] Exception logging chat to Supabase:", err.message);
    return false;
  }
}

module.exports = {
  isSupabaseConfigured,
  getSupabaseClient,
  saveEnquiryToSupabase,
  updateEnquiryStatusInSupabase,
  fetchEnquiriesFromSupabase,
  logChatToSupabase,
  mapEnquiryToDbRow,
  mapDbRowToEnquiry
};
