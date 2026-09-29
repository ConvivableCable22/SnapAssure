/* ============================================================
   SOMA — OpenAI Provider Adapter
   ------------------------------------------------------------
   Talks to the OpenAI Chat Completions API via native fetch
   (Node 18+), so no extra SDK dependency is required. Uses
   function-calling to force a structured { reply, action }
   response, the same contract every other provider adapter
   returns — server.js and the frontend never know or care
   which provider answered.

   Requires env: AI_API_KEY, AI_MODEL (e.g. "gpt-4.1")
   ============================================================ */

const { ACTION_SCHEMA } = require("../actions");

function createOpenAIProvider({ apiKey, model }) {
  return {
    name: "openai",
    async chat({ system, messages }) {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "system", content: system }, ...messages],
          tools: [
            {
              type: "function",
              function: {
                name: "soma_response",
                description: "Return SOMA's structured reply and optional website action.",
                parameters: ACTION_SCHEMA
              }
            }
          ],
          tool_choice: { type: "function", function: { name: "soma_response" } }
        })
      });

      if (!res.ok) {
        throw new Error(`OpenAI error ${res.status}: ${await res.text()}`);
      }
      const data = await res.json();
      const call = data.choices?.[0]?.message?.tool_calls?.[0];
      if (!call) throw new Error("OpenAI response did not include a structured tool call.");
      return JSON.parse(call.function.arguments); // { reply, action }
    }
  };
}

module.exports = { createOpenAIProvider };
