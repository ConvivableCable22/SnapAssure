/* ============================================================
   SOMA — Anthropic Provider Adapter
   ------------------------------------------------------------
   Talks to the Anthropic Messages API. Uses tool-calling (not
   free-text JSON parsing) to force a structured { reply, action }
   response — the model MUST call the "soma_response" tool.

   Requires: npm install @anthropic-ai/sdk
   Requires env: AI_API_KEY, AI_MODEL (e.g. "claude-sonnet-4-6")
   ============================================================ */

const Anthropic = require("@anthropic-ai/sdk");
const { ACTION_SCHEMA } = require("../actions");

function createAnthropicProvider({ apiKey, model }) {
  const client = new Anthropic({ apiKey });

  return {
    name: "anthropic",
    async chat({ system, messages }) {
      const completion = await client.messages.create({
        model,
        max_tokens: 500,
        system,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        tools: [
          {
            name: "soma_response",
            description: "Return SOMA's structured reply and optional website action.",
            input_schema: ACTION_SCHEMA
          }
        ],
        tool_choice: { type: "tool", name: "soma_response" }
      });

      const toolUse = completion.content.find(b => b.type === "tool_use");
      if (!toolUse) throw new Error("Anthropic response did not include a structured tool_use block.");
      return toolUse.input; // { reply, action }
    }
  };
}

module.exports = { createAnthropicProvider };
