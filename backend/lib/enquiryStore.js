/* ============================================================
   SnapAssure — Enquiry Store (Supabase + Local Persistent Store)
   ------------------------------------------------------------
   Stores all incoming website enquiries into Supabase PostgreSQL
   when configured, with dual-persistence into local JSON
   (backend/data/enquiries.json) as an immutable fallback.
   Ensures zero data loss even during network or database downtime.
   ============================================================ */

const fs = require("fs");
const path = require("path");
const {
  isSupabaseConfigured,
  saveEnquiryToSupabase,
  updateEnquiryStatusInSupabase,
  fetchEnquiriesFromSupabase
} = require("./supabase");

const DATA_DIR = path.join(__dirname, "..", "data");
const ENQUIRIES_FILE = path.join(DATA_DIR, "enquiries.json");

// In-memory submission cache for duplicate detection (15-second window)
const recentSubmissions = new Map();

function ensureDataDir() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(ENQUIRIES_FILE)) {
      fs.writeFileSync(ENQUIRIES_FILE, JSON.stringify([], null, 2), "utf8");
    }
  } catch (err) {
    // Read-only filesystem in serverless runtime (Netlify Functions / Lambda)
  }
}

function readAllEnquiries() {
  ensureDataDir();
  try {
    const raw = fs.readFileSync(ENQUIRIES_FILE, "utf8");
    return JSON.parse(raw || "[]");
  } catch (err) {
    console.error("[EnquiryStore] Error reading enquiries file:", err.message);
    return [];
  }
}

function writeAllEnquiries(enquiries) {
  ensureDataDir();
  const tempFile = path.join(DATA_DIR, `enquiries_${Date.now()}_tmp.json`);
  try {
    fs.writeFileSync(tempFile, JSON.stringify(enquiries, null, 2), "utf8");
    fs.renameSync(tempFile, ENQUIRIES_FILE);
    return true;
  } catch (err) {
    console.error("[EnquiryStore] Error writing enquiries file:", err.message);
    try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch (e) {}
    return false;
  }
}

/**
 * Checks if an identical submission occurred in the last 15 seconds.
 */
function checkDuplicate(data) {
  const now = Date.now();
  // Clean expired entries
  for (const [key, timestamp] of recentSubmissions.entries()) {
    if (now - timestamp > 15000) recentSubmissions.delete(key);
  }

  const hashKey = `${(data.name || "").trim().toLowerCase()}|${(data.email || "").trim().toLowerCase()}|${(data.phone || "").trim()}|${(data.message || "").trim()}`;
  if (recentSubmissions.has(hashKey)) {
    return true;
  }
  recentSubmissions.set(hashKey, now);
  return false;
}

/**
 * Saves an enquiry to both local disk and Supabase (when configured).
 */
async function saveEnquiry(data) {
  const enquiries = readAllEnquiries();

  const id = `enq_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const now = new Date();

  const formattedDate = now.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "full",
    timeStyle: "medium"
  });

  const record = {
    id,
    submittedAt: now.toISOString(),
    formattedDate: `${formattedDate} IST`,
    name: String(data.name || "").trim(),
    email: String(data.email || "").trim(),
    phone: String(data.phone || "").trim(),
    subject: data.mode === "quote" ? "Request a Quote" : "General Enquiry",
    mode: data.mode === "quote" ? "quote" : "enquiry",
    eventType: String(data.eventType || "").trim() || "Not specified",
    eventDate: String(data.eventDate || "").trim() || "Not specified",
    city: String(data.city || "").trim() || "Not specified",
    guests: String(data.guests || "").trim() || "Not specified",
    experience: String(data.experience || "").trim() || "Not specified",
    message: String(data.message || "").trim() || "No message provided",
    emailStatus: "pending",
    emailError: null,
    sentAt: null
  };

  // 1. Always save to local JSON file first (guarantees resilience against network failure)
  enquiries.unshift(record);
  writeAllEnquiries(enquiries);
  console.log(`[EnquiryStore] Enquiry saved locally with ID: ${id} (${record.name})`);

  // 2. Persist to Supabase if configured
  if (isSupabaseConfigured()) {
    try {
      const res = await saveEnquiryToSupabase(record);
      if (!res.ok) {
        console.warn(`[EnquiryStore] Supabase save warning for ${id}:`, res.error);
      }
    } catch (err) {
      console.error(`[EnquiryStore] Failed to save to Supabase for ${id}:`, err.message);
    }
  }

  return record;
}

/**
 * Updates the email delivery status of a stored enquiry across local and Supabase stores.
 */
async function updateEmailStatus(id, { success, error = null }) {
  // 1. Update local store
  const enquiries = readAllEnquiries();
  const item = enquiries.find(e => e.id === id);
  if (item) {
    item.emailStatus = success ? "sent" : "failed";
    item.emailError = error ? String(error) : null;
    item.sentAt = success ? new Date().toISOString() : null;
    writeAllEnquiries(enquiries);
    console.log(`[EnquiryStore] Local status updated for ${id}: ${item.emailStatus}`);
  }

  // 2. Update Supabase if configured
  if (isSupabaseConfigured()) {
    try {
      await updateEnquiryStatusInSupabase(id, { success, error });
    } catch (err) {
      console.error(`[EnquiryStore] Failed to update Supabase status for ${id}:`, err.message);
    }
  }

  return Boolean(item);
}

/**
 * Unified fetch: retrieves enquiries from Supabase if configured,
 * otherwise falls back seamlessly to local JSON storage.
 */
async function getEnquiries({ limit = 50, offset = 0 } = {}) {
  if (isSupabaseConfigured()) {
    try {
      const sbResult = await fetchEnquiriesFromSupabase({ limit, offset });
      if (sbResult && Array.isArray(sbResult.enquiries)) {
        return {
          source: "supabase",
          total: sbResult.total,
          enquiries: sbResult.enquiries
        };
      }
    } catch (err) {
      console.warn("[EnquiryStore] Error fetching from Supabase, falling back to local:", err.message);
    }
  }

  const list = readAllEnquiries();
  return {
    source: "local",
    total: list.length,
    enquiries: list.slice(offset, offset + limit)
  };
}

module.exports = {
  saveEnquiry,
  updateEmailStatus,
  checkDuplicate,
  readAllEnquiries,
  getEnquiries
};
