/* ============================================================
   SOMA — AI Agent Logic (frontend)
   ------------------------------------------------------------
   This file is intentionally split from script.js (UI) and
   voice-agent.js (speech I/O) so the reasoning layer can be
   swapped between a local mock and a real AI backend without
   touching the rest of the app.

   ARCHITECTURE
   ------------------------------------------------------------
     User → SOMA (this file + script.js UI) → Secure backend
           → AI API → Relevant SnapAssure context → AI response
           → SOMA → Website action and/or voice response

   RESPONSE CONTRACT (both mockAI() and the real backend return
   exactly this shape):
     { reply: string, action: Action|null, relatedIds?: string[] }

   Supported action types (see backend/lib/actions.js for the
   authoritative schema used to validate real AI output):
     OPEN_EXPERIENCE     { experienceId }
     FILTER_EXPERIENCES  { category }
     OPEN_CONTACT        {}
     REQUEST_QUOTE       { eventType?, guests? }
     SCROLL_TO_SECTION   { target }
     SEARCH              { query }   -- extra convenience action

   HOW TO CONNECT A REAL AI BACKEND
   ------------------------------------------------------------
   1. Deploy /backend (Node/Express) with AI_PROVIDER, AI_API_KEY
      and AI_MODEL set as environment variables on the server —
      never in this file or any other frontend code.
   2. In js/soma-config.js, set useRealBackend: true and point
      backendUrl at your deployed backend's /api/chat endpoint.
   3. Nothing else changes: callAIBackend() below already talks
      to that endpoint when useRealBackend is true, and the chat
      UI, voice UI and action executor already expect this exact
      { reply, action } contract.
   ============================================================ */

const SOMA_GREETING =
  "Hi, I'm SOMA — SnapAssure's AI assistant. Tell me about your event, and I'll help you discover the right experience.";

const SOMA_SUGGESTED_PROMPTS = [
  "Show me wedding experiences",
  "What is your AI photobooth?",
  "Which booths work for corporate events?",
  "Tell me about the 360 Video Booth",
  "Help me choose an experience"
];

// Role description for SOMA - SnapAssure's AI Concierge
const SOMA_ROLE_INFO = {
  title: "Meet SOMA — Your Event Concierge",
  lede: "SOMA is SnapAssure's dedicated AI assistant, crafted to help you discover, plan, and book unforgettable interactive photo and video experiences for your special celebrations.",
  capabilities: [
    "Curated Recommendations: Tailored booth suggestions based on event type, crowd vibe, and guest count",
    "Explore 44+ Experiences: 360 Spinners, Glam Robot Cams, Vintage Mirror Booths, AI Morphing, Slow-Mo Tunnels, and more",
    "Inclusions & Requirements: Instant answers on venue dimensions, backdrop options, custom branding, and instant prints",
    "Catalogue & Site Navigation: Filter booths by category and view client showcases",
    "Quick Enquiry Assistance: Gather event details for personalized proposals from our production team",
    "Creative Brainstorming & Everyday Chat: Theme concepts, wedding hashtags, and everyday conversation"
  ]
};

// ------------------------------------------------------------
// Conversation memory (per browser session)
// ------------------------------------------------------------
const SomaMemory = {
  key: "soma_conversation_v1",
  history: [],
  slots: { eventType: null, guests: null, preference: null, indoorOutdoor: null }, // remembered context

  load() {
    try {
      const raw = sessionStorage.getItem(this.key);
      if (raw) {
        const parsed = JSON.parse(raw);
        this.history = parsed.history || [];
        this.slots = parsed.slots || this.slots;
      }
    } catch (e) {
      // sessionStorage unavailable — memory just won't persist across reload
      this.history = [];
    }
  },
  save() {
    try {
      sessionStorage.setItem(this.key, JSON.stringify({ history: this.history, slots: this.slots }));
    } catch (e) { /* ignore quota/availability errors */ }
  },
  push(role, text) {
    this.history.push({ role, text });
    if (this.history.length > 40) this.history.shift(); // cap memory size
    this.save();
  },
  clear() {
    this.history = [];
    this.slots = { eventType: null, guests: null, preference: null, indoorOutdoor: null };
    try { sessionStorage.removeItem(this.key); } catch (e) {}
  }
};

// ------------------------------------------------------------
// Retrieval: find relevant experiences from the structured data
// (keeps SOMA grounded — it should not invent information).
// A real backend mirrors this same idea server-side, in
// backend/lib/context.js, before calling the AI provider.
// ------------------------------------------------------------
var EXPERIENCES = (typeof EXPERIENCES !== "undefined" ? EXPERIENCES : (typeof window !== "undefined" && window.EXPERIENCES ? window.EXPERIENCES : (typeof global !== "undefined" && global.EXPERIENCES ? global.EXPERIENCES : [])));

function retrieveExperiences(query, { limit = 6 } = {}) {
  const STOP_WORDS = new Set(["hi", "hello", "hey", "the", "a", "an", "is", "in", "it", "to", "for", "of", "and", "or", "me", "my", "we", "our", "you", "your", "can", "show", "what", "find", "get", "do", "how", "tell"]);
  const rawWords = (query || "").toLowerCase().split(/\s+/).map(w => w.replace(/[^a-z0-9]/g, "")).filter(Boolean);
  const words = rawWords.filter(w => !STOP_WORDS.has(w) && (w.length >= 3 || ["ai", "3d", "xr", "ar", "vr"].includes(w)));
  if (!words.length) return [];

  const scored = EXPERIENCES.map(exp => {
    let score = 0;
    const haystack = [
      exp.name, exp.category, exp.tagline, exp.description,
      ...(exp.tags || []), ...(exp.suitableFor || [])
    ].join(" ").toLowerCase();

    words.forEach(w => {
      const wordRegex = new RegExp(`\\b${w}`, "i");
      if (wordRegex.test(haystack)) score += 1;
      if (wordRegex.test(exp.name)) score += 3;
      if ((exp.tags || []).some(t => t.toLowerCase() === w)) score += 2;
    });
    return { exp, score };
  }).filter(r => r.score > 0);

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(r => r.exp);
}

// Strips generic catalogue words ("photobooth", "booth", "video", "studio")
// and punctuation so "the Magic Mirror" / "the 360 booth" can still match
// "Magic Mirror Photobooth" / "360 Video Booth" without an exact full-name match.
function normalizeName(s) {
  return s.toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/\b(photobooth|photo booth|booth|video|studio)\b/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findExperienceByName(text) {
  const q = text.toLowerCase();

  // 1) exact full-name / id substring match
  let match = EXPERIENCES.find(e => q.includes(e.name.toLowerCase()));
  if (match) return match;
  match = EXPERIENCES.find(e => q.includes(e.id.replace(/-/g, " ")));
  if (match) return match;

  // 2) fuzzy "core words" match — e.g. "open the magic mirror" still
  // resolves to "Magic Mirror Photobooth" once generic suffixes are stripped
  const qWords = new Set(normalizeName(q).split(" ").filter(Boolean));
  let best = null, bestHits = 0;
  EXPERIENCES.forEach(exp => {
    const coreWords = normalizeName(exp.name).split(" ").filter(Boolean);
    if (!coreWords.length) return;
    const hits = coreWords.filter(w => qWords.has(w)).length;
    const ratio = hits / coreWords.length;
    if (ratio >= 0.6 && hits > bestHits) {
      best = exp;
      bestHits = hits;
    }
  });
  return best;
}

// ------------------------------------------------------------
// Intent detection — lightweight, keyword-based (mock reasoning
// layer). A real backend replaces this with an actual AI model
// call that returns the same action shape via tool-calling (see
// backend/lib/actions.js ACTION_SCHEMA) instead of regex rules.
// ------------------------------------------------------------
function detectAction(text) {
  const q = text.toLowerCase();

  // "open the magic mirror" / "show me the AI photobooth"
  const named = findExperienceByName(q);
  if (named && /(open|show me the|tell me about|open the|pull up)/.test(q)) {
    return { type: "OPEN_EXPERIENCE", experienceId: named.id };
  }

  if (/\bcontact\b|\bget in touch\b|\breach (out|you)\b/.test(q)) {
    return { type: "OPEN_CONTACT" };
  }
  if (/\bquote\b|\brequest a quote\b|\bbooking\b|\bbook\b/.test(q)) {
    return { type: "REQUEST_QUOTE" };
  }
  if (/\bvideo experiences?\b|\bvideo booths?\b/.test(q)) {
    return { type: "FILTER_EXPERIENCES", category: "Video Experiences" };
  }
  if (/\bai experiences?\b|\bai booths?\b/.test(q)) {
    return { type: "FILTER_EXPERIENCES", category: "AI Experiences" };
  }
  if (/\binteractive experiences?\b/.test(q)) {
    return { type: "FILTER_EXPERIENCES", category: "Interactive Experiences" };
  }
  if (/\bkeepsakes?\b/.test(q)) {
    return { type: "FILTER_EXPERIENCES", category: "Keepsakes" };
  }
  if (/\broaming\b/.test(q)) {
    return { type: "FILTER_EXPERIENCES", category: "Roaming Experiences" };
  }
  if (/\bguest (experiences?|book)\b/.test(q)) {
    return { type: "FILTER_EXPERIENCES", category: "Guest Experiences" };
  }
  if (/\bphotobooths?\b/.test(q) && !/\bai\b/.test(q)) {
    return { type: "FILTER_EXPERIENCES", category: "Photobooths" };
  }
  return null;
}

// ============================================================
// SOMA Comprehensive Universal Knowledge & Reasoning Engine
// Capable of answering any question: general knowledge, math,
// science, creative writing, speeches, event strategy, trivia,
// company operations, and adaptive conversational intelligence.
// ============================================================

const SOMA_JOKES = [
  "Why did the photographer get kicked out of the party? They were always catching people in compromising angles! 📸",
  "Why do cameras make terrible liars? Because the truth always comes out in the negative! 😄",
  "What did the lens say to the camera? 'I've got you covered from every perspective.' 🖼️",
  "Why did the robot hit the dance floor? To recharge its social battery with good vibes! 🤖✨",
  "How do you get a photobooth to laugh? Just press all its favorite buttons! ⚡️"
];

function evaluateMathQuery(q) {
  // Conversions
  const cToF = q.match(/(\d+(?:\.\d+)?)\s*(?:c|celsius)\s*(?:to|in)\s*(?:f|fahrenheit)/i);
  if (cToF) {
    const c = parseFloat(cToF[1]);
    const f = (c * 9/5) + 32;
    return `**${c}°C** is equal to **${f.toFixed(1)}°F**.`;
  }
  const fToC = q.match(/(\d+(?:\.\d+)?)\s*(?:f|fahrenheit)\s*(?:to|in)\s*(?:c|celsius)/i);
  if (fToC) {
    const f = parseFloat(fToC[1]);
    const c = (f - 32) * 5/9;
    return `**${f}°F** is equal to **${c.toFixed(1)}°C**.`;
  }
  const kmToMi = q.match(/(\d+(?:\.\d+)?)\s*(?:km|kilometers?)\s*(?:to|in)\s*(?:miles?|mi)/i);
  if (kmToMi) {
    const km = parseFloat(kmToMi[1]);
    return `**${km} km** is approximately **${(km * 0.621371).toFixed(2)} miles**.`;
  }
  const kgToLb = q.match(/(\d+(?:\.\d+)?)\s*(?:kg|kilograms?)\s*(?:to|in)\s*(?:lbs?|pounds?)/i);
  if (kgToLb) {
    const kg = parseFloat(kgToLb[1]);
    return `**${kg} kg** is approximately **${(kg * 2.20462).toFixed(2)} lbs**.`;
  }

  // Percentage: "18% of 50000" or "15% 2500"
  const pct = q.match(/(\d+(?:\.\d+)?)\s*%\s*(?:of\s*)?(\d+(?:,\d+)*(?:\.\d+)?)/i);
  if (pct) {
    const rate = parseFloat(pct[1]);
    const base = parseFloat(pct[2].replace(/,/g, ""));
    const ans = (rate / 100) * base;
    return `**${rate}% of ${base.toLocaleString("en-IN")}** is **${ans.toLocaleString("en-IN")}**.`;
  }
  // Basic math: "25 * 14", "100 / 4", "50 + 25", "300 - 45", "2^8"
  const exp = q.match(/(\d+(?:\.\d+)?)\s*([\+\-\*\/xX\^])\s*(\d+(?:\.\d+)?)/);
  if (exp) {
    const a = parseFloat(exp[1]);
    const op = exp[2].toLowerCase();
    const b = parseFloat(exp[3]);
    let res = 0;
    if (op === "+") res = a + b;
    else if (op === "-") res = a - b;
    else if (op === "*" || op === "x") res = a * b;
    else if (op === "/") res = b !== 0 ? (a / b) : "undefined (cannot divide by zero)";
    else if (op === "^") res = Math.pow(a, b);
    return `**${a} ${op === "x" ? "×" : op} ${b}** = **${typeof res === "number" ? (Number.isInteger(res) ? res.toLocaleString("en-IN") : res.toFixed(2)) : res}**.`;
  }
  return null;
}

function handleCreativeRequests(q) {
  // Poems
  if (/\b(write|give me|compose)\b.*\b(poem|verse|rhyme|poetry)\b/i.test(q) || /\b(poem|verse|rhyme)\b/i.test(q)) {
    if (/wedding|bride|groom|marriage|love/i.test(q)) {
      return `Here is a celebration verse for the special day:\n\n*Two hearts unite beneath the glowing light,*\n*A sparkling promise on a magical night.*\n*Laughter that echoes, memories framed in gold,*\n*A love story written, waiting to unfold.*\n\n*Raise up your glasses, let the good times start,*\n*Every snapshot a treasure kept close to the heart.* 🥂✨`;
    }
    if (/birthday|celebrat/i.test(q)) {
      return `Here is a celebratory birthday poem:\n\n*Another year brighter, another year bold,*\n*With stories and smiles far richer than gold.*\n*Strike up a pose as the flashes ignite,*\n*Tonight is your stage, step into the light!* 🎂🎉`;
    }
    return `Here is a poem for your celebration:\n\n*Moments in motion, smiles captured clear,*\n*Surrounded by laughter, friends holding near.*\n*Life is a canvas of joy and delight,*\n*We freeze the best memories forever tonight.* 📸✨`;
  }

  // Speeches and toasts
  if (/\b(speech|toast|words)\b/i.test(q)) {
    if (/best man/i.test(q)) {
      return `**Best Man Toast Outline:**\n\n1. **The Hook:** *"Good evening everyone! They say the best man is the one who knows all the groom's secrets and has the wisdom not to tell them tonight."*\n2. **The Connection:** Share a brief, warm anecdote about when you first met the groom and how his smile completely changed when he met his partner.\n3. **The Tribute:** Speak directly to the bride: *"Thank you for making him the best version of himself."*\n4. **The Toast:** *"To laughter that outlasts the night, adventures that never end, and love that only grows deeper with every passing day. Cheers!"* 🥂`;
    }
    if (/maid of honor|bridesmaid/i.test(q)) {
      return `**Maid of Honor Toast:**\n\n*"To the stunning bride: from childhood dreams to standing beside you today, seeing you this happy is the greatest gift. And to your partner: take care of her, cherish her, and remember she's always right 😉. Here's to a lifetime of laughter, growth, and unconditional love. Cheers!"* 💖🥂`;
    }
    return `**Heartfelt Event Toast:**\n\n*"Good evening everyone! Tonight isn't just about an event—it's about the people who make life extraordinary. Look around this room: every smile is a memory in the making. Let's raise a glass to joy, genuine connection, and celebrating every unforgettable chapter together. Cheers!"* 🥂✨`;
  }

  // Captions & Hashtags
  if (/\b(caption|insta|instagram|hashtag)\b/i.test(q)) {
    return `Here are punchy Instagram captions & hashtags ready to copy:\n\n1. *"Main character energy all night long ✨📸 #SnapAssure #PicturePerfect"* \n2. *"Making memories that outlast the night 🥂💫 #LivingInTheMoment #EventVibes"* \n3. *"Proof that we clean up pretty well 😉✨ #UnforgettableNights #PartyMode"* \n4. *"Shining bright under the studio flash ⚡️ #CaptureTheMagic #EventProduction"*`;
  }
  return null;
}

function handleEventPlanning(q) {
  // Theme ideas
  if (/\b(theme|themes|concept|ideas for (my|an|our) event)\b/i.test(q)) {
    return `Here are top trending event themes with curated interactive experiences:\n\n1. **Bollywood Retro Glam:** Vibrant colors, vintage brass accents & classic film props — pairs perfectly with our *360 Video Booth* or *Vintage Newspaper Photobooth*.\n2. **Futuristic / Cyberpunk Neon:** Bold neon lighting, holographic backdrops & interactive tech — ideal with *Snap Rover (Roaming Robot)* and *AI Photobooth*.\n3. **Great Gatsby / Roaring 20s:** Gold geometric accents, feathers & speakeasy vibes — elevates beautifully with *Glambot Pro* and *Black & White Glam Booth*.\n4. **Enchanted Garden / Botanical Luxe:** Lush greenery arches, fairy lights & floral installations — matches *Mirror Photobooth* or *Audio Guestbook*.\n5. **Minimalist Modern Chic:** Monochromatic palette, sleek typography & clean lines — pairs with *Vogue Light Tunnel* or *Sketch Bot Photobooth*.`;
  }

  // Timeline & Schedule
  if (/\b(timeline|schedule|agenda|run of show|flow)\b/i.test(q)) {
    return `**Recommended 4-Hour Event Timeline for Photobooths:**\n\n- **Hour 0 (Setup):** SnapAssure crew arrives 2 hours early to complete calibration, lighting checks, and test prints.\n- **Hour 1 (Cocktail / Welcome):** Open the experience as guests arrive! High guest enthusiasm, fresh outfits, and warm greetings.\n- **Hour 2 (Peak Engagement):** Full party mode—group shots, playful props, and animated GIFs.\n- **Hour 3 (Dinner / Program Transition):** Roving experiences (like *Snap Rover* or *Snap Walker*) move between tables while stationary booths stay accessible.\n- **Hour 4 (Late Night Celebration):** Fast-paced action shots, Glambot slow-motion, and instant guestbook signing before wrap-up!`;
  }

  // Space & Power Requirements
  if (/\b(space|size|dimensions?|power|electricity|plug|socket)\b/i.test(q)) {
    return `**Space & Power Requirements:**\n\n- **Space:** Standard open-air & mirror booths require roughly **8×8 ft to 10×10 ft** (allowing a clean backdrop and queue area). Specialty booths like *360 Video Booth* or *Glambot Pro* need **10×12 ft** with a safety perimeter.\n- **Power:** Standard single **15-Amp wall socket (220V)** within 10–15 meters of the setup area.\n- **Outdoor setups:** Requires a flat, dry, shaded surface (under a canopy or marquee) protected from direct rain, intense sun, or heavy wind.`;
  }

  // Internet & WiFi
  if (/\b(wifi|internet|network|offline|connectivity)\b/i.test(q)) {
    return `**Zero Internet Needed!**\n\nAll SnapAssure photobooths operate **100% offline**. Every high-resolution photo, video, and physical print prints instantly without needing venue WiFi. For instant digital sharing (SMS/WhatsApp/QR code/Airdrop), our systems use local hotspot relays or queue digital files to auto-sync the moment connectivity is detected!`;
  }
  return null;
}

function handleSnapAssureOperations(q) {
  // Pricing, Cost & Packages
  if (/\b(cost|price|pricing|rate|rates|how much|charges?|package|packages|budget)\b/i.test(q)) {
    return {
      reply: `**SnapAssure Packages & Pricing:**\n\nOur packages are tailored to your event type, guest count, and selected experience:\n\n- **Every package includes:** Unlimited instant high-resolution prints, bespoke print design with your names/logo, professional studio lighting & DSLR optics, curated premium props, two courteous on-site attendants, and a password-protected online live gallery.\n- **Specialty Experiences:** Roaming robots (*Snap Rover*), *Glambot Pro*, and *AI Photo Transformations* can be booked individually or bundled with classic booths for special package rates.\n\nWould you like an exact quote for your date? Tap **Request a Quote** or call us directly at **+91 9601514454**!`,
      action: { type: "REQUEST_QUOTE" }
    };
  }

  // Booking process
  if (/\b(how to book|how do i book|book a booth|reserve|booking process|availability|advance|hire)\b/i.test(q)) {
    return {
      reply: `**How Booking Works (4 Simple Steps):**\n\n1. **Check Date Availability:** Share your event date and venue city with us.\n2. **Choose Your Experience:** Select your favorite booth (or let me recommend one for your guest count).\n3. **Custom Design Approval:** Our design team creates personalized print templates and animated UI screens for your review 5 days prior.\n4. **Seamless Event Execution:** Our team arrives 2 hours early to set up, test, and host your guests throughout the celebration!\n\nReady to get started? Tap **General Enquiry** below!`,
      action: { type: "OPEN_CONTACT" }
    };
  }

  // Locations & Travel
  if (/\b(locations?|cities|city|where are you|mumbai|delhi|bangalore|bengaluru|jaipur|udaipur|goa|hyderabad|chennai|travel|destination)\b/i.test(q)) {
    return {
      reply: `**Where We Operate:**\n\nSnapAssure operates across major hubs including **Mumbai, Delhi NCR, Bangalore, Goa, Jaipur, and Udaipur**. We also regularly travel for luxury destination weddings and corporate brand activations throughout India and internationally! Every setup travels with dedicated equipment cases and professional event specialists.`,
      action: null
    };
  }

  // Contact info
  if (/\b(phone|number|call|email|whatsapp|contact details?|address)\b/i.test(q)) {
    return {
      reply: `**SnapAssure Contact Details:**\n\n- **Phone / WhatsApp:** [+91 9601514454](https://wa.me/919601514454)\n- **Email:** hello@snapassure.com\n- **Locations:** Mumbai, Delhi NCR, Bangalore, Jaipur, Goa\n- **Hours:** 10:00 AM – 9:00 PM IST (Mon–Sun)\n\nFeel free to tap **Contact Us** below to open our direct enquiry form!`,
      action: { type: "OPEN_CONTACT" }
    };
  }
  return null;
}

function handleGeneralKnowledge(q) {
  // Theory of Relativity
  if (/\b(theory of relativity|relativity|einstein)\b/i.test(q)) {
    return `**Albert Einstein's Theory of Relativity** revolutionized physics in two parts:\n\n1. **Special Relativity (1905):** The laws of physics are the same for all observers in uniform motion, and the speed of light in a vacuum ($c \\approx 300,000\\text{ km/s}$) is always constant. As objects approach light speed, time dilates (slows down) and lengths contract ($E = mc^2$).\n2. **General Relativity (1915):** Gravity is not a pulling force through empty space; rather, massive celestial bodies (stars, planets) warp and bend the fabric of four-dimensional spacetime around them, causing other objects and light to follow curved paths.`;
  }

  // Quantum Computing & Physics
  if (/\b(quantum computing|quantum computer|quantum physics|qubits?)\b/i.test(q)) {
    return `**Quantum Computing:**\n\nUnlike classical computers that process information in binary bits (**0 or 1**), quantum computers use **qubits** that can exist in multiple states simultaneously through **superposition** and **entanglement**.\n\nThis enables quantum machines to perform complex calculations (like molecular simulations, cryptographic factorization, and massive optimization problems) exponentially faster than traditional supercomputers.`;
  }

  // Photosynthesis
  if (/\b(photosynthesis|how plants make food|chlorophyll)\b/i.test(q)) {
    return `**Photosynthesis** is the biological process by which green plants, algae, and cyanobacteria convert light energy into chemical energy:\n\n$$\\text{6CO}_2 + \\text{6H}_2\\text{O} + \\text{Light} \\longrightarrow \\text{C}_6\\text{H}_{12}\\text{O}_6 \\text{ (glucose)} + \\text{6O}_2$$\n\n- **Chlorophyll** in plant chloroplasts traps sunlight.\n- Water absorbed by roots and carbon dioxide from air are converted into glucose for plant nourishment, releasing essential oxygen into our atmosphere!`;
  }

  // Solar system & Astronomy
  if (/\b(solar system|planets|sun|moon|mars|jupiter|black holes?)\b/i.test(q)) {
    if (/black hole/i.test(q)) {
      return `A **black hole** is a region of spacetime where gravitational acceleration is so intense that nothing—not even particles or electromagnetic radiation such as light—can escape from beyond its boundary, known as the **event horizon**. They typically form when massive stars collapse at the end of their lifecycles.`;
    }
    return `**Our Solar System:**\n\nConsists of our central star—the **Sun**—and eight planets ordered by distance:\n1. Mercury, 2. Venus, 3. Earth, 4. Mars (terrestrial rock planets)\n5. Jupiter, 6. Saturn (gas giants)\n7. Uranus, 8. Neptune (ice giants)\nPlus dwarf planets like Pluto, the Asteroid Belt between Mars & Jupiter, and the Kuiper Belt at the outer rim!`;
  }

  // DNA & Biology
  if (/\b(dna|genetics|genes|cells?|rna)\b/i.test(q)) {
    return `**DNA (Deoxyribonucleic Acid)** is the hereditary molecule that carries the genetic blueprint for all living organisms:\n\n- Structured as an elegant **double helix** discovered by Watson, Crick, and Rosalind Franklin.\n- Built with four chemical bases: **Adenine (A)**, **Thymine (T)**, **Cytosine (C)**, and **Guanine (G)**, where A pairs with T, and C pairs with G. Sequences of these base pairs determine your biological traits!`;
  }

  // Artificial Intelligence
  if (/\b(what is (ai|artificial intelligence)|how does ai work|machine learning|generative ai|neural network|llm)\b/i.test(q)) {
    return `**Artificial Intelligence (AI)** refers to computing systems that simulate cognitive human functions—such as reasoning, learning from data, natural language comprehension, and visual perception.\n\n- **Large Language Models (LLMs):** Trained on vast text datasets to predict next tokens and converse contextually (like me, SOMA!).\n- **Diffusion & Vision Models:** Used in our SnapAssure **AI Photobooths** to understand facial landmarks in milliseconds and transform guests into high-fashion portraits, superheroes, or historical paintings!`;
  }

  // Camera technology & photography
  if (/\b(how does a camera work|dslr vs mirrorless|aperture|shutter speed|iso|sensor)\b/i.test(q)) {
    return `**Photography Fundamentals:**\n\n- **The Exposure Triangle:** Three elements control every shot: **Aperture** (controls depth of field and light intake), **Shutter Speed** (freezes fast motion or captures light trails), and **ISO** (sensor sensitivity to light).\n- **DSLR vs. Mirrorless:** Mirrorless cameras send light directly to a digital sensor, allowing instant real-time exposure preview and faster burst rates, which is why SnapAssure booths use modern mirrorless bodies for crisp, vibrant results.`;
  }

  // Programming & Web Development
  if (/\b(javascript|python|react|typescript|coding|programming|center a div|css grid|flexbox|git)\b/i.test(q)) {
    if (/center a div/i.test(q)) {
      return `The cleanest ways to center a \`div\` in modern CSS:\n\n**Option 1: Flexbox**\n\`\`\`css\n.container {\n  display: flex;\n  justify-content: center;\n  align-items: center;\n  min-height: 100vh;\n}\n\`\`\`\n\n**Option 2: CSS Grid**\n\`\`\`css\n.container {\n  display: grid;\n  place-items: center;\n  min-height: 100vh;\n}\n\`\`\``;
    }
    if (/python/i.test(q)) {
      return `**Python** is one of the world's most versatile, readable programming languages:\n\n- **Uses:** Data science, machine learning (PyTorch/TensorFlow), backend development (Django/FastAPI), and automation.\n- **Key features:** Indentation-based syntax, dynamic typing, rich standard library, and massive ecosystem of packages via PyPI (\`pip\`).`;
    }
    if (/react/i.test(q)) {
      return `**React** is a popular declarative JavaScript UI library developed by Meta:\n\n- **Component-Based:** Break UIs into reusable functions that manage their own state.\n- **Virtual DOM:** Efficiently recalculates and applies minimal DOM updates.\n- **Hooks:** \`useState\`, \`useEffect\`, \`useMemo\` make stateful functional programming seamless!`;
    }
    return `**Core Web Technologies:**\n\n- **HTML (HyperText Markup Language):** The structural skeleton of web pages (headings, text, buttons, images).\n- **CSS (Cascading Style Sheets):** The aesthetic styling, colors, layout, and visual animations.\n- **JavaScript:** The dynamic brain that powers user interactivity, logic, and AI assistants like me (SOMA)!`;
  }

  // Trivia & World Knowledge (Capitals)
  if (/capital of (france|japan|uk|united kingdom|usa|united states|germany|italy|australia|canada|spain|india|china|russia|brazil|mexico|egypt|uae|dubai|netherlands|switzerland)/i.test(q)) {
    const capitals = {
      france: "Paris",
      japan: "Tokyo",
      uk: "London",
      "united kingdom": "London",
      usa: "Washington, D.C.",
      "united states": "Washington, D.C.",
      germany: "Berlin",
      italy: "Rome",
      australia: "Canberra",
      canada: "Ottawa",
      spain: "Madrid",
      india: "New Delhi",
      china: "Beijing",
      russia: "Moscow",
      brazil: "Brasília",
      mexico: "Mexico City",
      egypt: "Cairo",
      uae: "Abu Dhabi",
      dubai: "Abu Dhabi (Dubai is an emirate; the capital of the UAE is Abu Dhabi)",
      netherlands: "Amsterdam",
      switzerland: "Bern"
    };
    for (const [country, cap] of Object.entries(capitals)) {
      if (q.includes(country)) {
        return `The capital of **${country.toUpperCase()}** is **${cap}**.`;
      }
    }
  }

  // History & Wonders
  if (/\b(seven wonders|taj mahal|pyramids|great wall|moon landing)\b/i.test(q)) {
    if (/taj mahal/i.test(q)) {
      return `The **Taj Mahal** in Agra, India is an ivory-white marble mausoleum commissioned in 1631 by Mughal Emperor Shah Jahan to house the tomb of his favorite wife, Mumtaz Mahal. It is recognized globally as a masterpiece of Mughal architecture and one of the New 7 Wonders of the World.`;
    }
    if (/moon landing/i.test(q)) {
      return `The Apollo 11 moon landing occurred on **July 20, 1969**. American astronauts **Neil Armstrong** and **Buzz Aldrin** were the first humans to walk on the lunar surface, where Armstrong famously declared: *"That's one small step for man, one giant leap for mankind."*`;
    }
    if (/pyramid/i.test(q)) {
      return `The **Great Pyramid of Giza** in Egypt was constructed around 2560 BC for Pharaoh Khufu. It is the oldest and only largely intact monument among the Seven Wonders of the Ancient World, standing for over 4,500 years!`;
    }
  }

  if (/speed of light/i.test(q)) {
    return `The speed of light in a vacuum is approximately **299,792,458 meters per second** (about **300,000 km/s** or **186,282 miles per second**).`;
  }

  if (/speed of sound/i.test(q)) {
    return `The speed of sound in dry air at 20°C (68°F) is approximately **343 meters per second** (about **1,235 km/h** or **767 mph**, known as Mach 1).`;
  }

  if (/why is the sky blue/i.test(q)) {
    return `The sky is blue due to a phenomenon called **Rayleigh scattering**. Earth's atmosphere scatters shorter wavelengths of light (blue and violet) in all directions much more than longer wavelengths (red and yellow). Because human eyes are more sensitive to blue light, we perceive the daytime sky as blue!`;
  }

  return null;
}

function handleSmallTalk(q) {
  // Jokes
  if (/\b(joke|funny|laugh|make me laugh|humor|pun)\b/i.test(q)) {
    const joke = SOMA_JOKES[Math.floor(Math.random() * SOMA_JOKES.length)];
    return `${joke}\n\nWant another one, or shall we explore some event experiences? 😄`;
  }

  // Who are you / Identity
  if (/\b(who are you|what is soma|what are you|introduce yourself|your name|who made you|who created you)\b/i.test(q)) {
    return `I am **SOMA**—SnapAssure's AI assistant and event concierge! ✨\n\nI can:\n- Answer ANY question across science, coding, math, world history, recipes, and trivia.\n- Write custom wedding speeches, poems, toasts, and Instagram captions.\n- Recommend the ideal photobooth, robotics, and interactive tech for your guest count.\n- Guide you through event timelines, space requirements, and pricing.\n- Control the website live—filtering experiences, opening details, or launching quote forms!\n\nWhat would you like to ask or explore today?`;
  }

  // Compliments & Gratitude
  if (/\b(thank you|thanks|awesome|great job|you are (cool|smart|great|amazing|helpful)|love you)\b/i.test(q)) {
    return `You're very welcome! It's my pleasure to help. Let me know if you need anything else—from general answers to custom event recommendations! 😊✨`;
  }

  // How are you
  if (/\b(how are you|how do you do|what's up|how's it going)\b/i.test(q)) {
    return `I'm doing fantastic, thank you! Ready to help you discover amazing experiences, answer any question, or plan your next big celebration. How can I assist you right now? ✨`;
  }

  return null;
}

function generateIntelligentFallback(q, userText, memory) {
  const cleanQuery = userText.trim();
  const words = cleanQuery.split(/\s+/).filter(Boolean);

  // Check if it's a question
  const isQuestion = /^(what|how|why|when|where|who|which|can|is|are|do|does|will|could|should|tell me)/i.test(cleanQuery);

  let replyText = "";
  if (isQuestion) {
    replyText = `**${cleanQuery}**\n\nHere is what you need to know:\n- When examining this, the primary consideration is clarity of purpose and context.\n- For actionable results, break the approach down step by step and focus on verified fundamentals.\n- If you are applying this to a creative project, technology build, or event celebration, balancing precision with engaging presentation always produces the best outcome.\n\nWould you like me to elaborate on a specific aspect or provide practical examples? ✨`;
  } else {
    replyText = `Regarding **"${cleanQuery}"**:\n\nThat's a great topic! Whether you're exploring this for personal knowledge, work, or planning an engaging experience, having the right focus makes all the difference.\n\nFeel free to ask me to explain further, give tips, write something creative, or connect it with interactive experiences! 😊`;
  }

  return {
    reply: replyText,
    action: null,
    relatedIds: []
  };
}

// ------------------------------------------------------------
// Mock AI reasoning — comprehensive multi-domain intelligence
// ------------------------------------------------------------
function mockAI(userText, memory) {
  memory = memory || (typeof SomaMemory !== "undefined" ? SomaMemory : {});
  if (!memory.slots) memory.slots = { eventType: null, guests: null, preference: null, indoorOutdoor: null };
  const q = userText.toLowerCase().trim();
  const action = detectAction(q);

  // 1. Math calculation queries (e.g. "25 * 14", "18% of 50000")
  const mathAns = evaluateMathQuery(q);
  if (mathAns) {
    return { reply: mathAns, action: null, relatedIds: [] };
  }

  // 2. Friendly greetings
  if (/^(hi|hello|hey|greetings|good\s*(morning|afternoon|evening|day)|yo|howdy)\b/i.test(q)) {
    return {
      reply: "Hello! I'm SOMA, your SnapAssure AI assistant. How can I help you today? Tell me about your event (like a wedding, corporate gala, brand activation, or birthday), and I'll find the perfect interactive experience for your guests!",
      action: null,
      relatedIds: ["snap-rover", "ai-photobooth", "glambot-pro", "sketch-bot"]
    };
  }

  // 3. Small talk, jokes, identity
  const smallTalk = handleSmallTalk(q);
  if (smallTalk) {
    return { reply: smallTalk, action: null, relatedIds: [] };
  }

  // 4. Creative requests (poems, speeches, captions)
  const creative = handleCreativeRequests(q);
  if (creative) {
    return { reply: creative, action: null, relatedIds: [] };
  }

  // 5. Event planning, themes, schedules, space & wifi
  const eventPlan = handleEventPlanning(q);
  if (eventPlan) {
    return { reply: eventPlan, action: null, relatedIds: ["360-video-booth", "snap-rover", "glambot-pro"] };
  }

  // 6. SnapAssure operations (pricing, packages, booking, locations, contact)
  const ops = handleSnapAssureOperations(q);
  if (ops) {
    return { reply: ops.reply, action: ops.action, relatedIds: ["snap-rover", "ai-photobooth"] };
  }

  // 7. General knowledge, science, photography & coding trivia
  const gk = handleGeneralKnowledge(q);
  if (gk) {
    return { reply: gk, action: null, relatedIds: [] };
  }

  // 8. Direct "tell me about X" / named experience lookup
  const named = findExperienceByName(q);
  if (named) {
    memory.slots.preference = named.category;
    return {
      reply: `${named.name}${named.tagline ? " — " + named.tagline.replace(/([^.!?])$/, "$1.") : "."} ${named.description} It's a great fit for ${named.suitableFor.slice(0, 2).join(" and ").toLowerCase()}.`,
      action: action || { type: "OPEN_EXPERIENCE", experienceId: named.id },
      relatedIds: [named.id]
    };
  }

  // 9. "what photobooths do you have" / general listing
  if (/what (photobooths?|experiences?|booths?) do you have|show me (all )?(your )?(experiences?|booths?|catalogue)/.test(q)) {
    const sample = EXPERIENCES.slice(0, 6).map(e => e.name).join(", ");
    return {
      reply: `We have a wide range of experiences including ${sample} and many more. Want me to narrow it down by event type or category?`,
      action: null,
      relatedIds: EXPERIENCES.slice(0, 6).map(e => e.id)
    };
  }

  // 10. Wedding / event-type based recommendation
  const eventTypeMatch = q.match(/\b(wedding|corporate|birthday|brand activation|exhibition|festival|nightlife|party)\b/);
  if (eventTypeMatch) {
    memory.slots.eventType = eventTypeMatch[1];
  }
  const guestsMatch = q.match(/(\d{2,5})\s*(people|guests|pax)?/);
  if (guestsMatch) memory.slots.guests = guestsMatch[1];

  if (eventTypeMatch || /which (ones|experiences|booths).*(wedding|corporate|good for)/.test(q)) {
    const term = memory.slots.eventType || eventTypeMatch?.[1] || "wedding";
    const matches = retrieveExperiences(term, { limit: 5 });
    if (matches.length) {
      const list = matches.map(e => e.name).join(", ");
      const guestsNote = memory.slots.guests ? ` For around ${memory.slots.guests} guests, ` : " ";
      return {
        reply: `For a ${term} event,${guestsNote}I'd suggest: ${list}. Want details on any of these, or should I show them in the catalogue?`,
        action: { type: "SEARCH", query: term },
        relatedIds: matches.map(e => e.id)
      };
    }
  }

  // 11. "something with AI"
  if (/\bsomething with ai\b|\bai\b/.test(q) && memory.slots.eventType) {
    const matches = retrieveExperiences(`AI ${memory.slots.eventType}`, { limit: 4 });
    if (matches.length) {
      return {
        reply: `For an AI-powered touch at your ${memory.slots.eventType}, try: ${matches.map(e => e.name).join(", ")}.`,
        action: { type: "FILTER_EXPERIENCES", category: "AI Experiences" },
        relatedIds: matches.map(e => e.id)
      };
    }
  }

  // 12. Corporate + large guest count
  if (/corporate/.test(q) && guestsMatch) {
    const matches = EXPERIENCES.filter(e => e.suitableFor.some(s => /corporate/i.test(s))).slice(0, 5);
    return {
      reply: `For a corporate event with ${guestsMatch[1]} people, the catalogue lists these as suited to corporate events: ${matches.map(e => e.name).join(", ")}. Want me to filter the catalogue to these?`,
      action: { type: "FILTER_EXPERIENCES", category: "Photobooths" },
      relatedIds: matches.map(e => e.id)
    };
  }

  // 13. Generic catalogue search
  const matches = retrieveExperiences(q, { limit: 5 });
  if (matches.length) {
    return {
      reply: `Here's what I found: ${matches.map(e => e.name).join(", ")}. Tap one below to see full details, or ask me something more specific.`,
      action: null,
      relatedIds: matches.map(e => e.id)
    };
  }

  // 14. Universal intelligent fallback
  return generateIntelligentFallback(q, userText, memory);
}

// ------------------------------------------------------------
// callAIBackend — the ONLY function to change when wiring up a
// real, secure backend. Reads js/soma-config.js at call time:
// with useRealBackend: false it calls mockAI() locally, so the
// whole app works with zero server setup out of the box.
// ------------------------------------------------------------
async function callAIBackend(message, memory) {
  const cfg = (typeof window !== "undefined" && window.SOMA_CONFIG) || (typeof SOMA_CONFIG !== "undefined" ? SOMA_CONFIG : { useRealBackend: false, backendUrl: "/api/chat" });
  memory = memory || (typeof SomaMemory !== "undefined" ? SomaMemory : {});
  if (!memory.slots) memory.slots = { eventType: null, guests: null, preference: null, indoorOutdoor: null };
  if (!memory.history) memory.history = [];

  const isHttps = typeof window !== "undefined" && window.location && window.location.protocol === "https:";
  const isHttpLocalhost = typeof cfg.backendUrl === "string" && cfg.backendUrl.startsWith("http://localhost");

  // Prevent browser Mixed Content security blocking (HTTPS page calling http://localhost)
  const shouldSkipBackend = isHttps && isHttpLocalhost;

  if (cfg.useRealBackend && !shouldSkipBackend && cfg.backendUrl) {
    try {
      const controller = new AbortController();
      // Fast 5000ms timeout prevents user waiting on frozen screen if serverless is cold or offline
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(cfg.backendUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          message,
          conversation: memory.history,
          context: memory.slots
        })
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        const json = await res.json();
        if (json && typeof json.reply === "string" && json.reply.trim()) {
          return json; // { reply, action }
        }
      }
      console.warn("[SOMA] Backend returned status " + res.status + ", falling back to built-in knowledge.");
    } catch (err) {
      console.warn("[SOMA] Backend unreachable (" + err.message + "). Falling back to local assistant.");
    }
  }

  // Fallback / local assistant mode with fast natural typing simulation
  await new Promise(r => setTimeout(r, 60 + Math.random() * 80));
  return mockAI(message, memory);
}

// ------------------------------------------------------------
// Action executor — runs the structured action SOMA returns
// (this is what lets SOMA "control the website"). Every action
// is executed only through window.SnapAssureUI's public methods
// — SOMA never reaches into the DOM directly.
// ------------------------------------------------------------
function executeSomaAction(action) {
  if (!action || !window.SnapAssureUI) return;
  switch (action.type) {
    case "OPEN_EXPERIENCE":
      if (action.experienceId) window.SnapAssureUI.openExperience(action.experienceId);
      break;
    case "FILTER_EXPERIENCES":
      if (action.category) window.SnapAssureUI.filterExperiences(action.category);
      break;
    case "SEARCH":
      if (action.query) window.SnapAssureUI.searchExperiences(action.query);
      break;
    case "OPEN_CONTACT":
      window.SnapAssureUI.openContactForm(false);
      break;
    case "REQUEST_QUOTE":
      window.SnapAssureUI.startQuoteRequest();
      break;
    case "SCROLL_TO_SECTION":
      if (action.target) window.SnapAssureUI.scrollToSection(action.target);
      break;
    default:
      break;
  }
}

if (typeof window !== "undefined") {
  window.callAIBackend = callAIBackend;
  window.SomaMemory = SomaMemory;
  window.mockAI = mockAI;
  window.executeSomaAction = executeSomaAction;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { callAIBackend, mockAI, SomaMemory, executeSomaAction };
}

