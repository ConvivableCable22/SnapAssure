/* ============================================================
   SnapAssure — Netlify Serverless Function: SOMA Chat
   ------------------------------------------------------------
   Endpoint: POST /api/chat (or /.netlify/functions/chat)
   Hosts SOMA AI securely on Netlify without needing an external
   Node server. Reads AI keys & Supabase from Netlify env vars.
   ============================================================ */

const { getProvider } = require("../../backend/lib/providers");
const { getRelevantContext, knowledge } = require("../../backend/lib/context");
const { buildSystemPrompt } = require("../../backend/lib/systemPrompt");
const { sanitizeAction } = require("../../backend/lib/actions");
const { getLiveWeatherIfRequested } = require("../../backend/lib/weather");
const { isSupabaseConfigured, logChatToSupabase } = require("../../backend/lib/supabase");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};

exports.handler = async function (event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Method not allowed. Use POST." })
    };
  }

  try {
    let body = {};
    try {
      body = JSON.parse(event.body || "{}");
    } catch (e) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: "Invalid JSON in request body." })
      };
    }

    const { message, conversation = [], context: slots = {}, sessionId = null } = body;

    if (!message || typeof message !== "string" || !message.trim()) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: "Missing or invalid 'message'." })
      };
    }

    const provider = getProvider();
    if (!provider) {
      return {
        statusCode: 503,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: "AI backend is not configured in Netlify environment variables (AI_PROVIDER, AI_API_KEY, AI_MODEL)."
        })
      };
    }

    // Live weather context if requested
    const liveWeather = await getLiveWeatherIfRequested(message);
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
      : "I'm here to help you discover the perfect SnapAssure experience! What would you like to know?";

    const action = sanitizeAction(result?.action, knowledge);

    // Asynchronously log conversation to Supabase if configured
    if (isSupabaseConfigured()) {
      logChatToSupabase({
        sessionId,
        userMessage: message,
        reply,
        action,
        clientIp: event.headers["x-forwarded-for"] || event.headers["client-ip"] || null
      }).catch(err => console.warn("[Netlify Chat] Supabase log warning:", err.message));
    }

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ reply, action })
    };
  } catch (err) {
    console.error("[Netlify Chat] Error handling message:", err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "AI service encountered an unexpected error: " + err.message })
    };
  }
};
