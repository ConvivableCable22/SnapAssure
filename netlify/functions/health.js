/* ============================================================
   SnapAssure — Netlify Serverless Function: Health Check
   ------------------------------------------------------------
   Endpoint: GET /api/health
   ============================================================ */

const { isSupabaseConfigured } = require("../../backend/lib/supabase");
const { isMailerConfigured } = require("../../backend/lib/mailer");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-cache"
};

exports.handler = async function (event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "" };
  }

  return {
    statusCode: 200,
    headers: CORS_HEADERS,
    body: JSON.stringify({
      ok: true,
      environment: "netlify-serverless",
      supabaseConfigured: isSupabaseConfigured(),
      providerConfigured: Boolean(process.env.AI_PROVIDER && process.env.AI_API_KEY && process.env.AI_MODEL),
      provider: process.env.AI_PROVIDER || null,
      mailerConfigured: isMailerConfigured(),
      recipient: process.env.EMAIL_TO || "snapassure@gmail.com"
    })
  };
};
