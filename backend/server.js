/* ============================================================
   SOMA — Secure Backend
   ------------------------------------------------------------
   This is the ONLY place the real AI API key is ever read or
   used. It never reaches the browser, a JS bundle, or a git
   commit — it lives in an environment variable on the server
   (see .env.example).

   Architecture (see README.md for the full write-up):
     User → SOMA (frontend) → THIS SERVER → AI provider API →
     relevant SnapAssure context → AI response → SOMA (frontend)
     → website action and/or voice response

   Run:
     cd backend
     npm install
     cp .env.example .env      # then fill in AI_PROVIDER / AI_API_KEY / AI_MODEL
     npm start
   ============================================================ */

require("dotenv").config();
const express = require("express");
const cors = require("cors");

const { getProvider } = require("./lib/providers");
const { getRelevantContext, knowledge } = require("./lib/context");
const { buildSystemPrompt } = require("./lib/systemPrompt");
const { sanitizeAction } = require("./lib/actions");
const { getLiveWeatherIfRequested } = require("./lib/weather");
const { saveEnquiry, updateEmailStatus, checkDuplicate, readAllEnquiries, getEnquiries } = require("./lib/enquiryStore");
const { sendEnquiryEmail, isMailerConfigured } = require("./lib/mailer");
const { isSupabaseConfigured, logChatToSupabase } = require("./lib/supabase");

const app = express();

// Only allow the site(s) that should be able to call this backend.
// Comma-separate multiple origins, e.g. "https://snapassure.com,https://www.snapassure.com"
const allowedOrigin = process.env.ALLOWED_ORIGIN || "*";
const allowedOrigins = allowedOrigin.split(",").map(s => s.trim());
app.use(cors({ origin: allowedOrigins.includes("*") ? true : allowedOrigins }));
app.use(express.json({ limit: "100kb" }));

// Lightweight in-memory rate limiter per IP to prevent spam and DoS
const ipRequestBuckets = new Map();
function rateLimit({ windowMs = 60000, maxRequests = 20, message = "Too many requests. Please try again later." } = {}) {
  return (req, res, next) => {
    const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "client";
    const now = Date.now();
    let bucket = ipRequestBuckets.get(ip);
    if (!bucket || now - bucket.startTime > windowMs) {
      bucket = { startTime: now, count: 1 };
      ipRequestBuckets.set(ip, bucket);
    } else {
      bucket.count++;
    }

    if (ipRequestBuckets.size > 2000) {
      for (const [key, val] of ipRequestBuckets.entries()) {
        if (now - val.startTime > windowMs) ipRequestBuckets.delete(key);
      }
    }

    if (bucket.count > maxRequests) {
      return res.status(429).json({ ok: false, error: message });
    }
    next();
  };
}

app.get("/api/health", (req, res) => {
  res.setHeader("Cache-Control", "no-cache");
  res.json({
    ok: true,
    supabaseConfigured: isSupabaseConfigured(),
    providerConfigured: Boolean(process.env.AI_PROVIDER && process.env.AI_API_KEY && process.env.AI_MODEL),
    provider: process.env.AI_PROVIDER || null,
    mailerConfigured: isMailerConfigured(),
    recipient: process.env.EMAIL_TO || "snapassure@gmail.com"
  });
});

app.get("/api/enquiries", async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const result = await getEnquiries({ limit, offset });
    res.json({
      ok: true,
      source: result.source,
      total: result.total,
      enquiries: result.enquiries
    });
  } catch (err) {
    console.error("[Enquiries] Error listing enquiries:", err.message);
    const fallback = readAllEnquiries();
    res.json({
      ok: true,
      source: "local-fallback",
      total: fallback.length,
      enquiries: fallback.slice(0, 50)
    });
  }
});

app.post("/api/enquiry", rateLimit({ windowMs: 60000, maxRequests: 10, message: "Too many enquiries submitted. Please wait a minute." }), async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      eventType,
      eventDate,
      city,
      guests,
      experience,
      message,
      mode
    } = req.body || {};

    // Validate required fields
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ ok: false, error: "Full Name is required." });
    }
    if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(400).json({ ok: false, error: "A valid email address is required." });
    }
    if (!phone || typeof phone !== "string" || phone.trim().length < 6) {
      return res.status(400).json({ ok: false, error: "A valid phone number is required." });
    }

    // Sanitize string fields
    const clean = (val) => typeof val === "string" ? val.replace(/[<>]/g, "").trim() : "";

    const cleanData = {
      name: clean(name).slice(0, 100),
      email: clean(email).slice(0, 120),
      phone: clean(phone).slice(0, 30),
      eventType: clean(eventType).slice(0, 80),
      eventDate: clean(eventDate).slice(0, 40),
      city: clean(city).slice(0, 100),
      guests: clean(String(guests || "")).slice(0, 20),
      experience: clean(experience).slice(0, 100),
      message: clean(message).slice(0, 2000),
      mode: mode === "quote" ? "quote" : "enquiry"
    };

    // Duplicate submission check within 15 seconds
    if (checkDuplicate(cleanData)) {
      console.log(`[Enquiry] Duplicate submission prevented for ${cleanData.email}`);
      return res.json({
        ok: true,
        duplicate: true,
        saved: true,
        emailSent: true,
        message: "Your enquiry was already submitted. Thank you!"
      });
    }

    // Step 1: Save enquiry to persistent storage FIRST (local JSON + Supabase)
    const storedEnquiry = await saveEnquiry(cleanData);

    // Step 2: Trigger secure email sending to snapassure@gmail.com
    const emailResult = await sendEnquiryEmail(storedEnquiry);

    // Step 3: Update the stored enquiry with email delivery status across local & Supabase
    await updateEmailStatus(storedEnquiry.id, {
      success: emailResult.ok,
      error: emailResult.error || null
    });

    // Step 4: Return response indicating outcome
    if (emailResult.ok) {
      return res.json({
        ok: true,
        saved: true,
        emailSent: true,
        id: storedEnquiry.id,
        message: "Thank you! Your enquiry has been received and emailed to our team."
      });
    } else {
      // Enquiry is saved safely, but email was not delivered (e.g. SMTP config pending)
      return res.json({
        ok: true,
        saved: true,
        emailSent: false,
        id: storedEnquiry.id,
        message: "Thank you! Your enquiry has been safely received. Our team will get back to you shortly."
      });
    }
  } catch (err) {
    console.error("[Enquiry] Server error processing enquiry:", err);
    res.status(500).json({ ok: false, error: "Server error processing enquiry. Please try again or reach us at +91 9601514454." });
  }
});

app.post("/api/chat", rateLimit({ windowMs: 60000, maxRequests: 30, message: "Too many requests to SOMA AI. Please wait a moment." }), async (req, res) => {
  try {
    const { message, conversation = [], context: slots = {} } = req.body || {};

    if (!message || typeof message !== "string" || !message.trim() || message.length > 2000) {
      return res.status(400).json({ error: "Missing or invalid 'message'." });
    }
    if (!Array.isArray(conversation)) {
      return res.status(400).json({ error: "'conversation' must be an array." });
    }

    const provider = getProvider();
    if (!provider) {
      return res.status(503).json({
        error: "AI backend is not configured. Set AI_PROVIDER, AI_API_KEY and AI_MODEL as environment variables (see backend/.env.example)."
      });
    }

    // Fetch real-time live data (e.g. weather/temperature) if requested
    const liveWeather = await getLiveWeatherIfRequested(message);

    // Step: select only the SnapAssure catalogue data relevant to this
    // request, instead of sending the whole catalogue every time.
    const context = getRelevantContext(message, slots);
    const system = buildSystemPrompt({ context, slots, liveWeather });

    const messages = [
      ...conversation.slice(-12).map(m => ({
        role: m.role === "soma" ? "assistant" : "user",
        content: String(m.text || "")
      })),
      { role: "user", content: message }
    ];

    const result = await provider.chat({ system, messages });

    const reply = typeof result?.reply === "string" && result.reply.trim()
      ? result.reply.trim()
      : "Sorry, I couldn't process that just now. Please try again or contact SnapAssure directly.";

    // Re-validate the action against the REAL catalogue before it can
    // ever reach the browser — the model cannot make SOMA open or
    // filter to something that doesn't actually exist.
    const action = sanitizeAction(result?.action, knowledge);

    // Asynchronously log conversation interaction to Supabase (non-blocking)
    if (isSupabaseConfigured()) {
      logChatToSupabase({
        sessionId: req.body?.sessionId || null,
        userMessage: message,
        reply,
        action,
        clientIp: req.headers["x-forwarded-for"] || req.socket.remoteAddress || null
      }).catch(err => console.warn("[SOMA backend] Chat log warning:", err.message));
    }

    res.json({ reply, action });
  } catch (err) {
    console.error("[SOMA backend] /api/chat error:", err.message);
    res.status(500).json({ error: "AI backend unavailable." });
  }
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`SOMA backend listening on :${PORT}`);
    console.log(`AI provider: ${process.env.AI_PROVIDER || "(not set — /api/chat will return 503 until configured)"}`);
    console.log(`Supabase DB: ${isSupabaseConfigured() ? "Configured" : "Not configured (using local JSON store)"}`);
  });
}

module.exports = app;
