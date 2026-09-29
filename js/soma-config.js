/* ============================================================
   leo — Public runtime config
   ------------------------------------------------------------
   Safe to ship to the browser: it contains NO secrets, just a
   flag and a URL. The real AI API key lives only on the backend
   server (see /backend/.env.example), read from environment
   variables — never here, never in any frontend file.

   To go live with a real AI backend:
     1. Deploy /backend (see backend/README section in the
        project README) with AI_PROVIDER / AI_API_KEY / AI_MODEL
        set as environment variables on the server.
     2. Set useRealBackend to true and point backendUrl at your
        deployed backend's /api/chat endpoint.
   No other file needs to change — ai-agent.js reads this object
   at call time.
   ============================================================ */

window.SOMA_CONFIG = {
  useRealBackend: true,                            // Set to true when running node backend on port 3000
  backendUrl: "http://localhost:3000/api/chat",    // Local backend server AI endpoint
  enquiryUrl: "http://localhost:3000/api/enquiry"  // Local backend server Enquiry submission endpoint
};
