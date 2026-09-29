/* ============================================================
   SOMA — Structured Action Schema
   ------------------------------------------------------------
   This is the single source of truth for what SOMA is allowed
   to make the website DO. Every AI provider adapter is told to
   return output matching ACTION_SCHEMA (via tool-calling /
   function-calling, not free text parsing), and every action
   the model returns is re-checked with sanitizeAction() against
   the REAL catalogue before it ever reaches the browser.

   This means a hallucinated experienceId or category can never
   make it to the frontend — worst case, the action is just
   dropped (action: null) and SOMA's text reply is still shown.
   ============================================================ */

const ACTION_TYPES = [
  "OPEN_EXPERIENCE",     // { experienceId }
  "FILTER_EXPERIENCES",  // { category }
  "OPEN_CONTACT",        // {}
  "REQUEST_QUOTE",       // { eventType?, guests? }
  "SCROLL_TO_SECTION",   // { target }
  "SEARCH",              // { query }  -- extra convenience action beyond the spec's five
  "NONE"
];

// JSON-schema-shaped description handed to the AI provider so it can
// return structured output instead of free text SOMA has to parse.
const ACTION_SCHEMA = {
  type: "object",
  properties: {
    reply: {
      type: "string",
      description: "SOMA's articulate, comprehensive natural-language reply. SOMA can answer ANY question across general knowledge, science, coding, math, advice, trivia, creative writing, or SnapAssure event experiences."
    },
    action: {
      type: "object",
      description: "Optional website action to execute alongside the reply. Omit fields that don't apply. Set type to NONE (or omit action) if no action is appropriate.",
      properties: {
        type: { type: "string", enum: ACTION_TYPES },
        experienceId: { type: "string", description: "Required for OPEN_EXPERIENCE — must be a real id from the supplied catalogue context." },
        category: { type: "string", description: "Required for FILTER_EXPERIENCES — must be one of the supplied categories." },
        target: { type: "string", description: "Required for SCROLL_TO_SECTION, e.g. 'contact', 'experiences', 'about', 'clients'." },
        query: { type: "string", description: "Required for SEARCH — a free-text keyword search." },
        eventType: { type: "string", description: "Optional, for REQUEST_QUOTE." },
        guests: { type: "string", description: "Optional, for REQUEST_QUOTE." }
      }
    }
  },
  required: ["reply"]
};

/**
 * Re-validates an action the AI model returned against the REAL catalogue.
 * Returns a clean action object, or null if the action is missing,
 * malformed, or references something that doesn't exist.
 */
function sanitizeAction(action, knowledge) {
  if (!action || typeof action !== "object" || !action.type) return null;
  const type = String(action.type).toUpperCase();
  if (!ACTION_TYPES.includes(type) || type === "NONE") return null;

  switch (type) {
    case "OPEN_EXPERIENCE": {
      const exists = knowledge.experiences.some(e => e.id === action.experienceId);
      return exists ? { type, experienceId: action.experienceId } : null;
    }
    case "FILTER_EXPERIENCES": {
      const cat = knowledge.categories.find(
        c => c.toLowerCase() === String(action.category || "").toLowerCase()
      );
      return cat ? { type, category: cat } : null;
    }
    case "SCROLL_TO_SECTION":
      return action.target ? { type, target: String(action.target) } : null;
    case "SEARCH":
      return action.query ? { type, query: String(action.query) } : null;
    case "OPEN_CONTACT":
      return { type };
    case "REQUEST_QUOTE":
      return {
        type,
        eventType: action.eventType ? String(action.eventType) : null,
        guests: action.guests ? String(action.guests) : null
      };
    default:
      return null;
  }
}

module.exports = { ACTION_TYPES, ACTION_SCHEMA, sanitizeAction };
