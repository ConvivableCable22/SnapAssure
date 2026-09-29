/* ============================================================
   SnapAssure — Netlify Serverless Function: Enquiries
   ------------------------------------------------------------
   Endpoint: POST /api/enquiry and GET /api/enquiries
   Saves incoming leads to Supabase PostgreSQL, sends email alerts,
   and handles status tracking seamlessly on Netlify.
   ============================================================ */

const { saveEnquiry, updateEmailStatus, checkDuplicate, getEnquiries } = require("../../backend/lib/enquiryStore");
const { sendEnquiryEmail } = require("../../backend/lib/mailer");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json"
};

exports.handler = async function (event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "" };
  }

  // GET: List enquiries
  if (event.httpMethod === "GET") {
    try {
      const params = event.queryStringParameters || {};
      const limit = Math.min(Math.max(parseInt(params.limit, 10) || 50, 1), 100);
      const offset = Math.max(parseInt(params.offset, 10) || 0, 0);

      const result = await getEnquiries({ limit, offset });
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          ok: true,
          source: result.source,
          total: result.total,
          enquiries: result.enquiries
        })
      };
    } catch (err) {
      console.error("[Netlify Enquiry] Error listing enquiries:", err.message);
      return {
        statusCode: 500,
        headers: CORS_HEADERS,
        body: JSON.stringify({ ok: false, error: err.message })
      };
    }
  }

  // POST: Submit new enquiry
  if (event.httpMethod === "POST") {
    try {
      let body = {};
      try {
        body = JSON.parse(event.body || "{}");
      } catch (e) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ ok: false, error: "Invalid JSON format." })
        };
      }

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
      } = body;

      if (!name || typeof name !== "string" || !name.trim()) {
        return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ ok: false, error: "Full Name is required." }) };
      }
      if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ ok: false, error: "A valid email address is required." }) };
      }
      if (!phone || typeof phone !== "string" || phone.trim().length < 6) {
        return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ ok: false, error: "A valid phone number is required." }) };
      }

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

      if (checkDuplicate(cleanData)) {
        return {
          statusCode: 200,
          headers: CORS_HEADERS,
          body: JSON.stringify({
            ok: true,
            duplicate: true,
            saved: true,
            emailSent: true,
            message: "Your enquiry was already submitted. Thank you!"
          })
        };
      }

      // Step 1: Save enquiry to Supabase / persistent store
      const storedEnquiry = await saveEnquiry(cleanData);

      // Step 2: Send email notification if configured
      let emailResult = { ok: false };
      try {
        emailResult = await sendEnquiryEmail(storedEnquiry);
      } catch (mailErr) {
        console.warn("[Netlify Enquiry] Mail delivery skipped/failed:", mailErr.message);
      }

      // Step 3: Update delivery status
      await updateEmailStatus(storedEnquiry.id, {
        success: emailResult.ok,
        error: emailResult.error || null
      });

      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          ok: true,
          saved: true,
          emailSent: Boolean(emailResult.ok),
          id: storedEnquiry.id,
          message: emailResult.ok
            ? "Thank you! Your enquiry has been received and emailed to our team."
            : "Thank you! Your enquiry has been safely received. Our team will get back to you shortly."
        })
      };
    } catch (err) {
      console.error("[Netlify Enquiry] Error processing enquiry:", err);
      return {
        statusCode: 500,
        headers: CORS_HEADERS,
        body: JSON.stringify({ ok: false, error: "Server error processing enquiry." })
      };
    }
  }

  return {
    statusCode: 405,
    headers: CORS_HEADERS,
    body: JSON.stringify({ error: "Method not allowed." })
  };
};
