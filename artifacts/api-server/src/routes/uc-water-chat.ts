/**
 * Alison — UC Water Quality AI Assistant
 *
 * POST /api/uc/ai/water-chat   — main chat turn
 * POST /api/uc/ai/chat-feedback — thumbs up/down rating (knowledge base)
 *
 * Responses include { reply, suggestions } so the app can render
 * one-tap follow-up chips below each bubble.
 *
 * When isRetry=true the previous answer was rated unhelpful; we inject
 * a coaching note so Alison tries a meaningfully different approach.
 */
import { Router, type Request, type Response, type IRouter } from "express";
import { anthropic } from "@workspace/integrations-anthropic-ai";

const router: IRouter = Router();

// ─── In-memory feedback store (knowledge base) ────────────────────────────────
// Keeps the last 500 rated exchanges. The UCFilters team can read
// GET /api/uc/ai/chat-feedback (admin-only) to review low-rated answers.
interface FeedbackEntry {
  ts:       string;
  rating:   "up" | "down";
  question: string;
  answer:   string;
}
const feedbackLog: FeedbackEntry[] = [];
const MAX_FEEDBACK = 500;

// ─── System prompt ────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are Alison — Ultra-Clear's water quality guide for customers in Nairobi and across Kenya.

## Who you are
You are warm, curious, and genuinely helpful. You listen before you advise. You have memory of the entire conversation and you actively use it — reference what the customer has already told you (their water source, product, problem) rather than making them repeat themselves. Each of your responses builds on what came before.

## How you have conversations
- **Listen first.** When a customer describes a problem, acknowledge it and ask ONE clarifying question if you need more information (water source? which room? how many people?). Do not give a product recommendation before you understand the situation.
- **Reference earlier context.** If the customer mentioned their water source or product in a previous turn, bring it up naturally: "Since you're on borehole water as you mentioned…" or "Given your Sweet Home filter's current cartridge age…"
- **Educate while you recommend.** Explain *why* a product helps, not just that it does. E.g. "Borehole water often contains iron and bacteria — that's why a multi-stage system like the Counter Reverse Osmosis works much better here than a bottle filter."
- **One question at a time.** Never ask more than one question in a single response.
- **Be direct when you know enough.** Once you understand the situation, give a clear, specific recommendation with a short reason.
- **Iterative improvement.** If earlier in this conversation you gave an answer the customer found unclear, try a different angle: simpler words, a concrete example, or a step-by-step breakdown.
- **Warm, human tone.** Conversational and professional. No marketing speak.

## Ultra-Clear Product Catalogue (2026)
**Portable & Bottle Filters**
- Hydra Flux, Truva Go, Viva Drop, Flex, Timbo, Gym Buddy, Breeze — personal bottle filters (90-day/150L cartridge, SGS-certified >99.9% bacteria removal)
- Survivor Straw — portable straw for emergencies/hiking (120-day/400L cartridge)
- EcoSmart Elite — solar-powered portable filter with power bank (90-day/400L cartridge)

**Home Filters**
- Sweet Home — faucet-clip filter, tool-free install in 5 min (120-day cartridge) — best entry-level home filter
- Counter Reverse Osmosis — countertop RO, removes dissolved salts, heavy metals, fluoride, bacteria (180-day membrane), no plumbing needed
- Electric Pitcher — filtered pitcher, no installation (90-day/400L cartridge)
- RO Home System — under-sink whole-home RO, 50G/75G/100G, professional installation (enquire for pricing)

**Shower & Skin Filters**
- J'adore, Derma Care, Pure Drop — shower filters (150-day), reduce chlorine for better skin and hair
- Channel, Derma Flux — facial basin filters (135-day), chlorine removal at skincare source

**Accessories & Replacements**
- Bottle Filter Cartridge (90-day), Faucet Filter Cartridge (120-day), Shower Filter Cartridge (150-day)
- Derma Flux Cartridge (120-day), Survivor Straw Cartridge (120-day/400L)

**Solutions**
- Aqua Stream 1200 — commercial RO for 50–200 staff (KES 69,990 + Pro on request)
- Water ATMs — community refill at KES 2–5/litre

## Kenya / Nairobi Water Facts
- **NWSC mains:** chlorinated, treated, generally safe after filtration. Post-rain turbidity spikes common. Recommended replacement schedule assumes mains water.
- **Borehole:** hard water (high calcium/magnesium), may contain iron, fluoride, nitrates, bacteria. Not safe unfiltered. Shortens cartridge life ~30%.
- **Surface water:** high sediment, bacteria, organic matter — especially during April–May long rains and Oct–Nov short rains. Harshest on filters, shortens life ~45%.
- **Mixed (mains + borehole backup):** common in estates, reduces effective cartridge life ~18%.
- Nairobi altitude (1,700 m) — cooler water, slightly slower chlorine degradation.
- Common complaints: post-rain cloudiness, chlorine taste on mains, iron staining from boreholes, low pressure on faucet filters.

## Advice rules
- Never claim a filter removes a contaminant it is not rated for. When unsure, say so and suggest contacting support.
- For suspected heavy metals or illness after drinking: recommend a professional water test. Mention UCFilters offers a free water quality assessment (book in-app).
- For persistent issues or complex installations: guide to a support ticket in the app or info@ucfilters.com.
- Keep responses to 2–4 short paragraphs. Plain text only — no heavy markdown; this renders in a mobile chat bubble.

## Follow-up suggestions format (REQUIRED on every response)
End EVERY response with exactly this line (no blank line before it):
<!--SUG:["short question 1","short question 2","short question 3"]-->

Rules for suggestions:
- 2 or 3 items only
- Each under 55 characters
- Natural follow-ups the customer would actually ask next
- Do NOT repeat a question already covered in the conversation
- Do NOT put quotes inside the question text itself`;

// ─── Helper: parse and strip <!--SUG:[...]-->  ────────────────────────────────
function parseSuggestions(raw: string): { reply: string; suggestions: string[] } {
  const match = raw.match(/<!--SUG:(\[.*?\])-->/s);
  let suggestions: string[] = [];
  if (match) {
    try {
      const parsed = JSON.parse(match[1]) as unknown;
      if (Array.isArray(parsed)) {
        suggestions = (parsed as unknown[])
          .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
          .slice(0, 3);
      }
    } catch { /* malformed — keep empty */ }
  }
  const reply = raw.replace(/<!--SUG:\[.*?\]-->/s, "").trimEnd() ||
    "I'm sorry, I couldn't generate a response. Please try again.";
  return { reply, suggestions };
}

// ─── POST /api/uc/ai/water-chat ───────────────────────────────────────────────
router.post("/uc/ai/water-chat", async (req: Request, res: Response): Promise<void> => {
  const { messages, filterContext, isRetry } = req.body as {
    messages: Array<{ role: "user" | "assistant"; content: string }>;
    filterContext?: {
      productName?:   string;
      daysRemaining?: number;
      waterSource?:   string;
      lastCheckIn?:   string;
      cleanCount?:    number;
    };
    isRetry?: boolean;
  };

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages array is required" });
    return;
  }

  for (const m of messages) {
    if (m.role !== "user" && m.role !== "assistant") {
      res.status(400).json({ error: "Each message must have role 'user' or 'assistant'" });
      return;
    }
    if (typeof m.content !== "string" || m.content.trim().length === 0) {
      res.status(400).json({ error: "Each message must have non-empty string content" });
      return;
    }
  }

  if (messages[0]?.role !== "user") {
    res.status(400).json({ error: "First message must have role 'user'" });
    return;
  }

  // Build context preamble
  let contextPreamble = "";
  if (filterContext && Object.values(filterContext).some(v => v !== undefined)) {
    const parts: string[] = ["[Customer filter context]"];
    if (filterContext.productName)
      parts.push(`Product: ${filterContext.productName}`);
    if (filterContext.daysRemaining !== undefined)
      parts.push(filterContext.daysRemaining > 0
        ? `Cartridge days remaining: ${filterContext.daysRemaining}`
        : "Cartridge overdue for replacement");
    if (filterContext.waterSource) {
      const labels: Record<string, string> = {
        mains: "Nairobi NWSC mains", borehole: "borehole water",
        surface: "surface / rainwater", mixed: "mixed mains + borehole",
      };
      parts.push(`Water source: ${labels[filterContext.waterSource] ?? filterContext.waterSource}`);
    }
    if (filterContext.cleanCount !== undefined)
      parts.push(`Times filter cleaned: ${filterContext.cleanCount}`);
    if (filterContext.lastCheckIn)
      parts.push(`Last check-in result: ${filterContext.lastCheckIn}`);
    contextPreamble = parts.join(" | ");
  }

  // Retry note: injected when the customer rated the previous answer unhelpful
  const retryNote = isRetry
    ? "[COACHING NOTE: The customer found your previous answer unclear or unhelpful. " +
      "Please try a significantly different approach — simpler language, a concrete real-world example, " +
      "or ask one targeted clarifying question to better understand what they need. " +
      "Do not repeat the same explanation.]"
    : "";

  const anthropicMessages = messages.map((m, i) => {
    if (i === 0) {
      const prefix = [contextPreamble, retryNote].filter(Boolean).join("\n\n");
      return {
        role:    m.role as "user" | "assistant",
        content: prefix ? `${prefix}\n\nCustomer: ${m.content}` : m.content,
      };
    }
    return { role: m.role as "user" | "assistant", content: m.content };
  });

  try {
    const response = await anthropic.messages.create({
      model:      "claude-haiku-4-5",
      max_tokens: 1024,
      system:     SYSTEM_PROMPT,
      messages:   anthropicMessages,
    });

    const rawText = (() => {
      const block = response.content.find(b => b.type === "text");
      return block?.type === "text" ? block.text : "";
    })();

    const { reply, suggestions } = parseSuggestions(rawText);
    res.json({ reply, suggestions });
  } catch (err) {
    console.error("[uc/ai/water-chat] AI error:", err);
    res.status(502).json({
      error: "Alison is temporarily unavailable. Please try again shortly or contact support at +254 700 000 000.",
    });
  }
});

// ─── POST /api/uc/ai/chat-feedback ───────────────────────────────────────────
// Stores customer thumbs up/down ratings. Forms the knowledge base that
// the UCFilters team reviews to identify gaps in Alison's answers.
router.post("/uc/ai/chat-feedback", (req: Request, res: Response): void => {
  const { rating, question, answer } = req.body as {
    rating:   unknown;
    question: unknown;
    answer:   unknown;
  };

  if (rating !== "up" && rating !== "down") {
    res.status(400).json({ error: "rating must be 'up' or 'down'" });
    return;
  }
  if (typeof question !== "string" || typeof answer !== "string") {
    res.status(400).json({ error: "question and answer must be strings" });
    return;
  }

  const entry: FeedbackEntry = {
    ts:       new Date().toISOString(),
    rating:   rating as "up" | "down",
    question: question.slice(0, 500),
    answer:   answer.slice(0, 1000),
  };

  if (feedbackLog.length >= MAX_FEEDBACK) feedbackLog.shift();
  feedbackLog.push(entry);

  // Log low-rated answers so they surface in server logs for review
  if (rating === "down") {
    console.warn("[Alison feedback] Unhelpful answer flagged:", {
      question: entry.question.slice(0, 120),
      answer:   entry.answer.slice(0, 120),
    });
  }

  res.json({ ok: true });
});

// ─── GET /api/uc/ai/chat-feedback  (internal review endpoint) ────────────────
router.get("/uc/ai/chat-feedback", (req: Request, res: Response): void => {
  const ratingFilter = req.query["rating"] as string | undefined;
  const items = ratingFilter
    ? feedbackLog.filter(e => e.rating === ratingFilter)
    : feedbackLog;
  // Return newest first
  res.json({ count: items.length, items: [...items].reverse().slice(0, 100) });
});

export default router;
