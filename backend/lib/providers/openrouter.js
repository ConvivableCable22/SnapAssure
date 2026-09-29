/* ============================================================
   SOMA — OpenRouter Provider Adapter
   ------------------------------------------------------------
   Talks to the OpenRouter Chat Completions API via native fetch
   (Node 18+). Uses OpenAI-compatible format to call Claude models
   (e.g. "anthropic/claude-3.5-haiku", "anthropic/claude-3.5-sonnet").

   Supports tool-calling for structured { reply, action } responses
   with a graceful fallback if the model returns a plain text reply.

   Requires env:
     AI_API_KEY  (OpenRouter API key starting with "sk-or-...")
     AI_MODEL    (e.g. "anthropic/claude-3.5-haiku" or "anthropic/claude-3.5-sonnet")
   ============================================================ */

const { ACTION_SCHEMA } = require("../actions");

function createOpenRouterProvider({ apiKey, model }) {
  const preferredModel = model || "openrouter/free";
  const fallbackModels = ["openrouter/free", "openrouter/auto"];

  async function requestCompletions(currentModel, { system, messages }) {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "http://localhost:5500",
        "X-Title": "SnapAssure SOMA AI"
      },
      signal: AbortSignal.timeout(7000),
      body: JSON.stringify({
        model: currentModel,
        messages: [{ role: "system", content: system }, ...messages],
        max_tokens: 450,
        temperature: 0.7,
        reasoning: { effort: "low" },
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
        tool_choice: "auto"
      })
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`OpenRouter error ${res.status} on model ${currentModel}: ${errorText}`);
    }

    return await res.json();
  }

  return {
    name: "openrouter",
    async chat({ system, messages }) {
      const modelsToTry = [preferredModel, ...fallbackModels.filter(m => m !== preferredModel)];
      let lastError = null;
      let data = null;

      for (const m of modelsToTry) {
        try {
          data = await requestCompletions(m, { system, messages });
          if (data && data.choices && data.choices.length) break;
        } catch (err) {
          lastError = err;
          console.warn(`[OpenRouter] Model ${m} failed: ${err.message}. Trying next fallback...`);
        }
      }

      if (!data) {
        throw lastError || new Error("All OpenRouter models failed to respond.");
      }

      const choice = data.choices?.[0];
      const call = choice?.message?.tool_calls?.[0];

      if (call?.function?.arguments) {
        try {
          return JSON.parse(call.function.arguments); // { reply, action }
        } catch (e) {
          console.warn("[OpenRouter] Failed to parse tool arguments, falling back to message text.");
        }
      }

      // If the model responded with plain content instead of tool call
      const textReply = choice?.message?.content || "";
      if (textReply) {
        // Try parsing JSON if model wrapped response in JSON string
        try {
          const jsonMatch = textReply.match(/\{[\s\S]*"reply"\s*:[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.reply) return parsed;
          }
        } catch (e) {}
      }

      return {
        reply: textReply || "I'm here to help with any question or SnapAssure experience! What would you like to know?",
        action: null
      };
    }
  };
}

module.exports = { createOpenRouterProvider };

