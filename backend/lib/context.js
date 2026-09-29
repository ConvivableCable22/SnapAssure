/* ============================================================
   SOMA — Relevant Context Retrieval
   ------------------------------------------------------------
   Instead of dumping the entire 44-experience catalogue into
   every AI request (slow, expensive, and makes it easier for
   the model to drift off-topic), this module picks only the
   experiences relevant to the current message + remembered
   conversation slots, plus the always-relevant company info.

   This is the "Relevant SnapAssure context" step in:
     User → SOMA → Secure backend → AI API →
     Relevant SnapAssure context → AI response → SOMA → Website action

   Nothing here is invented — it only selects and returns a
   subset of what's already in snapassure-knowledge.json.
   ============================================================ */

const knowledge = require("../snapassure-knowledge.json");

function scoreExperience(exp, words) {
  const haystack = [
    exp.name, exp.category, exp.tagline, exp.description,
    ...(exp.tags || []), ...(exp.suitableFor || [])
  ].join(" ").toLowerCase();

  let score = 0;
  words.forEach(w => {
    if (!w) return;
    if (haystack.includes(w)) score += 1;
    if (exp.name.toLowerCase().includes(w)) score += 3;
    if ((exp.tags || []).some(t => t.toLowerCase() === w)) score += 2;
  });
  return score;
}

const EVENT_KEYWORDS = /\b(booth|photobooth|photo|video|glambot|roamer|camera|print|prints|wedding|party|corporate|activation|birthday|reception|cocktail|anniversary|celebration|experience|snapassure|package|quote|pricing|cost|hire|rent|booking|book|reserve|setup)\b/i;

/**
 * @param {string} message - the user's latest message
 * @param {object} slots - remembered conversation state (eventType, guests, preference, indoorOutdoor)
 * @param {object} opts
 * @returns {{ company: object, categories: string[], experiences: object[] }}
 */
function getRelevantContext(message, slots = {}, opts = {}) {
  const limit = opts.limit || Math.min(Number(process.env.MAX_CONTEXT_EXPERIENCES) || 4, 4);

  const q = `${message || ""} ${slots.eventType || ""} ${slots.preference || ""}`.toLowerCase();
  const isEventQuery = EVENT_KEYWORDS.test(q) || Boolean(slots.eventType || slots.preference);

  // For non-event queries (science, math, coding, creative, general chat),
  // return minimal context so prompt stays lightweight and blazing fast.
  if (!isEventQuery) {
    return {
      company: {
        name: knowledge.company.name,
        tagline: knowledge.company.tagline,
        phone: knowledge.company.phone
      },
      categories: [],
      experiences: []
    };
  }

  const words = q.split(/\s+/).filter(Boolean);
  const scored = knowledge.experiences
    .map(exp => ({ exp, score: scoreExperience(exp, words) }))
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score);

  // Return top scored experiences, or a concise sample if no exact keyword match
  let matched = scored.slice(0, limit).map(r => r.exp);
  if (matched.length === 0) {
    matched = knowledge.experiences.slice(0, limit);
  }

  return {
    company: {
      name: knowledge.company.name,
      tagline: knowledge.company.tagline,
      phone: knowledge.company.phone,
      email: knowledge.company.email
    },
    categories: knowledge.categories,
    experiences: matched.map(e => ({
      id: e.id,
      name: e.name,
      category: e.category,
      tagline: e.tagline,
      description: e.description,
      suitableFor: e.suitableFor
    }))
  };
}

module.exports = { getRelevantContext, knowledge };
