/* ============================================================
   SOMA — Provider Factory
   ------------------------------------------------------------
   The rest of the backend (server.js) never imports a specific
   AI provider directly — it asks this factory for "whichever
   provider is configured" and calls the same .chat() method on
   whatever comes back. This is what makes the architecture
   provider-independent: switching AI_PROVIDER in the environment
   is the only thing needed to move from Anthropic to OpenAI (or
   any future adapter added here) — no other file changes.
   ============================================================ */

const { createAnthropicProvider } = require("./anthropic");
const { createOpenAIProvider } = require("./openai");
const { createOpenRouterProvider } = require("./openrouter");

/**
 * Reads AI_PROVIDER / AI_API_KEY / AI_MODEL from the environment
 * and returns a provider object with a single method:
 *   chat({ system, messages }) => Promise<{ reply, action }>
 *
 * Returns null if the backend isn't configured yet, so the caller
 * can return a clear "not configured" response instead of crashing.
 */
function getProvider() {
  const providerName = (process.env.AI_PROVIDER || "").toLowerCase();
  const apiKey = process.env.AI_API_KEY;
  const model = process.env.AI_MODEL;

  if (!providerName || !apiKey || !model) return null;

  switch (providerName) {
    case "anthropic":
      return createAnthropicProvider({ apiKey, model });
    case "openai":
      return createOpenAIProvider({ apiKey, model });
    case "openrouter":
      return createOpenRouterProvider({ apiKey, model });
    default:
      throw new Error(`Unknown AI_PROVIDER "${providerName}". Supported: anthropic, openai, openrouter.`);
  }
}

module.exports = { getProvider };
