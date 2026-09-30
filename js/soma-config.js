/* ============================================================
   SOMA — Public Runtime Config
   ------------------------------------------------------------
   Safe to ship to the browser: contains NO secret keys.
   Automatically detects local development vs. production (Netlify).
   ============================================================ */

(function () {
  const isLocal = typeof window !== "undefined" && window.location && (
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1" ||
    window.location.hostname === ""
  );

  // In local development: talks to local Node backend on port 3000
  // On Netlify / Production: uses same-origin relative endpoints (/api/chat, /api/enquiry)
  // which route directly to Netlify Functions without mixed-content browser blocks.
  const defaultBackend = isLocal ? "http://localhost:3000/api/chat" : "/api/chat";
  const defaultEnquiry = isLocal ? "http://localhost:3000/api/enquiry" : "/api/enquiry";

  window.SOMA_CONFIG = {
    useRealBackend: true,
    backendUrl: (typeof window !== "undefined" && window.SOMA_CUSTOM_BACKEND_URL) || defaultBackend,
    enquiryUrl: (typeof window !== "undefined" && window.SOMA_CUSTOM_ENQUIRY_URL) || defaultEnquiry,
    isLocal: isLocal
  };
})();
