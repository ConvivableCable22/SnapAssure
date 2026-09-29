# SnapAssure — website rebuilt from the PDF

The 47-page SnapAssure catalogue PDF, turned into an interactive website — with the PDF's own photos,
logos, client logos, vector artwork, wording and links — plus **SOMA**, an AI assistant that supports text
chat, voice, and can control the page.

## 1. How the PDF maps to the site

| PDF page | Website |
|---|---|
| 1 — cover | Cover section: master logo, intro copy, Instagram, rings/discs, teal tagline band |
| 2 — clients | "Trusted by…" copy, Testimonials badge, **28 client logos in the PDF's 6/5/4/4/4/5 rows** |
| 3–46 — 44 experiences | 44 sheets: PDF title + wording (verbatim), the PDF's photos, and the real **View Photos & Experience Video** link |
| 47 — Booth Index | Interactive index — all 44 experiences, each linking to its sheet |
| footer strip (every page) | Charcoal "GET IN TOUCH" footer with phone, email, Instagram/Facebook handle, footer logo |

A page-by-page table (with every asset filename and Drive link) is in **`AUDIT.md`**.

## 2. Project structure

```
index.html
css/style.css
js/
  experiences-data.js   ← catalogue: title, PDF copy, images[], mediaUrl, pdfPage, framed
  ai-agent.js           ← SOMA reasoning / memory / action layer (grounded in the data file)
  voice-agent.js        ← Web Speech API wrapper
  script.js             ← sheets, search/filter, gallery + lightbox, Booth Index, form, SOMA UI
assets/
  images/               ← the PDF's product photos, named per experience (50 files)
  logos/                ← snapassure-logo.png (master 861×475) + snapassure-logo-footer.png
  logos/clients/        ← 28 client logos
  icons/                ← view-photos-video.png (hand+play), testimonials-badge.png,
                          instagram.svg, facebook.svg, squiggle.svg
  backgrounds/          ← deco-rings-{intro,experience,index}.svg  (vector, from the PDF's paths)
  extracted/            ← every unique raw image embedded in the PDF (88) + manifest.json
backend/                ← secure Node/Express backend + catalogue as JSON (holds the real AI API key)
  server.js             ← POST /api/chat, GET /api/health
  lib/actions.js         ← the 6 structured website actions + validator against the real catalogue
  lib/context.js          ← picks only the catalogue subset relevant to each request
  lib/systemPrompt.js     ← builds SOMA's system prompt from that context
  lib/providers/           ← one adapter per AI provider (anthropic.js, openai.js) behind a common .chat() interface
  .env.example            ← AI_PROVIDER / AI_API_KEY / AI_MODEL / etc. (no real key committed)
AUDIT.md
```

## 3. Run it locally

No build step. Open `index.html`, or (needed for microphone permission in some browsers):

```
python3 -m http.server 8080      # then open http://localhost:8080
```

Fonts (Barlow Condensed + Noto Serif, the web equivalents of the PDF's Barlow Condensed and Droid Serif)
load from Google Fonts; without a connection the site falls back to system fonts.

## 3a. Things worth knowing about the PDF's own data

- **Photos** are the PDF's embedded images, cropped exactly as the PDF crops them. Four were mirrored in the
  PDF (SkySweep, Instax, Magic Mirror, 360 Video) and keep that orientation. *High Angle* is a layered
  composite in the PDF, so it is rendered as the page shows it. Cut-outs keep transparency, so some files are `.png`.
- **Video / photo links:** each experience's `mediaUrl` is the Google Drive link behind that page's
  "View Photos & Experience Video". The PDF contains no embedded video. **Pages 3, 5, 7, 9, 11, 13 share one
  Drive folder and pages 19 & 20 share another** — kept exactly as in the PDF (likely a copy-paste slip; worth checking).
- **Testimonials badge:** the PDF has no link behind it, so none is invented. Set `COMPANY_INFO.testimonialsUrl`
  in `js/experiences-data.js` and the badge becomes a link.
- **Facebook:** the PDF has no Facebook URL (its Facebook icon sits under the Instagram link), so the icon is shown but not separately linked.
- **Booth Index:** the PDF's index lists 5 items (4 linked, Snap Slip unlinked, one empty bullet). The site lists and links all 44.
- **Taglines:** seven pages (6, 16, 22, 26, 27, 43, 46) have no standalone tagline in the PDF, so none is shown.
- **Logo:** the PDF stores the SnapAssure logo as a transparent raster (861×475), so it is used as-is rather than re-drawn.
- **Contact form:** there is no backend. "Send by email" opens the visitor's email app with the details filled in, and
  "Send on WhatsApp" opens `wa.me/919601514454` (the PDF's own phone link) with the same text.
- Search categories (Photobooths, AI Experiences…) are a navigation aid added by the site, not part of the PDF.

## 4. SOMA's AI architecture

### 4a. What changes when I add a real AI API key?

SOMA can run in two modes. You can see this explanation inside the app
too — click the **ⓘ** button in SOMA's chat header.

**Without a real AI API (current default — `useRealBackend: false`)**
SOMA can:
- Search the local SnapAssure catalogue
- Use predefined, keyword-matched responses
- Execute predefined website actions
- Use the browser's built-in speech recognition
- Use the browser's built-in speech synthesis

**With a real AI API key connected** SOMA can additionally:
- Understand natural language, not just keywords
- Understand complex, multi-part requests
- Handle follow-up questions naturally
- Maintain conversational context across turns
- Ask clarifying questions when a request is ambiguous
- Explain experiences in its own words
- Compare available experiences against each other
- Recommend experiences based on the visitor's actual requirements
- Generate natural, varied responses instead of templates
- Interpret voice conversations, not just fixed phrases

### 4b. Architecture

```
User
  ↓
SOMA (frontend: js/ai-agent.js + script.js)
  ↓
Secure backend (backend/server.js — POST /api/chat)
  ↓
AI API (backend/lib/providers/{anthropic,openai}.js)
  ↓
Relevant SnapAssure context (backend/lib/context.js selects a subset
  of backend/snapassure-knowledge.json for this request)
  ↓
AI response ({ reply, action } via tool-calling — see backend/lib/actions.js)
  ↓
SOMA (frontend)
  ↓
Website action (js/ai-agent.js → window.SnapAssureUI) and/or voice response
  (js/voice-agent.js → SpeechSynthesis)
```

The frontend never talks to an AI provider directly — it only ever calls
its own backend's `/api/chat`. The backend is the only place that holds
the real API key, reads it from an environment variable, and calls the
AI provider.

### 4c. Structured website control

The backend asks the AI model to call a `soma_response` tool/function
(via each provider's native tool-calling — not free-text JSON parsing),
returning:

```json
{
  "reply": "I'll open the Magic Mirror experience.",
  "action": { "type": "OPEN_EXPERIENCE", "experienceId": "magic-mirror-photobooth" }
}
```

Supported action types (`backend/lib/actions.js`):

| Action | Fields | What it does |
|---|---|---|
| `OPEN_EXPERIENCE` | `experienceId` | Opens that experience's detail view |
| `FILTER_EXPERIENCES` | `category` | Filters the catalogue grid to a category |
| `OPEN_CONTACT` | — | Scrolls to and opens the contact form |
| `REQUEST_QUOTE` | `eventType?`, `guests?` | Opens the contact form in "quote" mode |
| `SCROLL_TO_SECTION` | `target` | Scrolls to a named section |
| `SEARCH` | `query` | Free-text catalogue search (extra, beyond the core five) |

Before any action reaches the browser, `sanitizeAction()` re-checks it
against the real catalogue (`backend/snapassure-knowledge.json`) — a
hallucinated `experienceId` or `category` is silently dropped rather than
breaking the page or opening the wrong thing. The frontend executes
whatever action it receives through `window.SnapAssureUI`'s existing
public methods (`js/ai-agent.js` → `executeSomaAction()`); it never
reaches into the DOM directly.

### 4d. Worked examples

- **"I need something for a wedding with 300 guests."** → SOMA extracts
  `eventType: wedding`, `guests: 300` into remembered conversation state,
  recommends catalogue-grounded experiences, and can ask a follow-up
  (indoor/outdoor, budget-sensitive extras) if it needs more to narrow
  things down.
- **"Show me AI experiences."** → `{ type: "FILTER_EXPERIENCES", category: "AI Experiences" }`.
- **"Open the Magic Mirror."** → `{ type: "OPEN_EXPERIENCE", experienceId: "magic-mirror-photobooth" }`.
- **"How does the 360 booth work?"** → answered from the 360 Video
  Booth's actual catalogue description/features — nothing invented.

### 4e. Voice architecture

```
Microphone
  ↓
Speech-to-text (js/voice-agent.js — browser SpeechRecognition API)
  ↓
AI API (via the same /api/chat call as text chat)
  ↓
SOMA reasoning (js/ai-agent.js — same callAIBackend() / executeSomaAction())
  ↓
Response/action
  ↓
Text-to-speech (js/voice-agent.js — browser SpeechSynthesis API)
  ↓
Speaker
```

Voice reuses the exact same `callAIBackend()` → `{ reply, action }` →
`executeSomaAction()` pipeline as text chat; only the input/output layer
(`js/voice-agent.js`) differs. To upgrade to a real-time/streaming voice
API later, replace `startListening()` / `speak()` inside
`js/voice-agent.js` with that provider's streaming SDK — `script.js` and
`js/ai-agent.js` don't need to change, since they only depend on the
callbacks that file already exposes (`onResult`, `onEnd`, `onError`).

### 4f. Connecting a real AI provider

1. `cd backend && npm install`
2. `cp .env.example .env` and fill in `AI_PROVIDER` (`anthropic` or
   `openai`), `AI_API_KEY` (your real key — **never commit this file**),
   and `AI_MODEL`.
3. `npm start` (or `npm run dev`).
4. In `js/soma-config.js`, set `useRealBackend: true` and point
   `backendUrl` at your deployed backend's `/api/chat`. No other frontend
   file needs to change.

**Provider independence:** `backend/server.js` never imports a specific
provider — it asks `backend/lib/providers/index.js` for "whichever
provider `AI_PROVIDER` names," and every adapter exposes the same
`chat({ system, messages }) → { reply, action }` method. Adapters for
Anthropic and OpenAI are included; adding another (Google, Azure OpenAI,
a self-hosted model gateway) means writing one more
`backend/lib/providers/<name>.js` file with that same method — nothing
else in the app changes.

### 4g. Security

- The real API key is **only ever** read from `process.env.AI_API_KEY`
  inside `backend/lib/providers/*.js` — it is never present in any file
  under the site root, never in `js/soma-config.js`, and never sent to
  the browser.
- `backend/.env` is git-ignored (`backend/.gitignore`); `.env.example`
  ships with empty placeholders only.
- CORS is restricted via `ALLOWED_ORIGIN` so only your actual site(s) can
  call the backend.
- Every AI-returned action is re-validated against the real catalogue
  before it reaches the browser (see 4c).

### 4h. Supabase Database Integration (Enquiries & Chat Logs)

The backend natively supports **Supabase (PostgreSQL)** for persisting customer enquiries and conversation logs:
- **Dual-Storage Resilience**: Enquiries are saved to Supabase and mirrored to `backend/data/enquiries.json`. Even during database maintenance or network loss, no enquiry is lost.
- **SQL Schema**: Run `backend/supabase/schema.sql` in the Supabase Dashboard SQL Editor. It creates tables (`enquiries`, `chat_logs`), indices, and Row Level Security (RLS) policies.
- **Environment Setup**: Add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_ANON_KEY`) in `backend/.env`.
- **Test Connection**: Run `npm run db:test` in `backend/` to verify connection and schema.
- **Migrate Existing Leads**: Run `npm run db:migrate` in `backend/` to batch-upload historical JSON records into Supabase.

### 4i. Additional costs / services for going live

- Hosting for `/backend` (Render, Railway, Fly.io, a small VM, etc.) —
  the frontend stays a free static site either way.
- Per-token usage costs from whichever AI provider you choose.
- Supabase free tier or Pro project for hosted PostgreSQL.
- Optional: a real-time/streaming voice API if you outgrow the browser's
  built-in speech APIs (see 4e).
- Optional: logging/monitoring for the backend in production.

## 5. Voice — what's real vs. the honest limitation

- **Push-to-talk voice works today** using the browser's built-in
  `SpeechRecognition` (speech-to-text) and `SpeechSynthesis`
  (text-to-speech) APIs — no extra setup required. Best support is in
  Chrome and Edge; Safari/iOS support varies.
- **"Say SOMA to activate" background wake-word listening is not
  implemented**, because browsers do not allow a webpage to keep the
  microphone open and listening in the background without an active user
  gesture — implementing a fake version of this would be misleading. The
  mic button is the working equivalent of a wake word: one tap starts a
  listening turn.
- If a browser doesn't support speech APIs at all, SOMA automatically
  falls back to text chat and shows a friendly explanation instead of
  failing silently.

## 6. Deploying

This is a fully static site — no server is required for the frontend
(the optional backend in step 4 is separate and only needed for a real
AI provider).

- **GitHub Pages:** push this folder to a repo, enable Pages on the
  `main` branch (root), done.
- **Netlify / Vercel / Cloudflare Pages:** drag-and-drop this folder (or
  connect the repo) with no build command and `/` as the publish
  directory.

## 7. Content accuracy

- **On-screen text** (titles, taglines, paragraphs) is the PDF's own wording, checked programmatically
  against each PDF page (see `AUDIT.md`).
- `description`, `features`, `suitableFor`, `tags` and `category` in `js/experiences-data.js` are condensed
  summaries written from the PDF and used only for search and SOMA's replies. They add no prices, specs or
  availability; SOMA is instructed to point people to SnapAssure for anything not stated in the catalogue.
- Nothing is invented: no stock photography, no extra client logos, no testimonials, awards, statistics,
  pricing, or videos.
