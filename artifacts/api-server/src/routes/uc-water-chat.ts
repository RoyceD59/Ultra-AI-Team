/**
 * Alison — UC Water Quality AI Assistant
 * POST /api/uc/ai/water-chat
 *
 * Returns { reply: string, suggestions: string[] }
 * `suggestions` are 2-3 short follow-up question chips the app renders
 * below each assistant bubble for one-tap follow-up.
 */
import { Router, type Request, type Response, type IRouter } from "express";
import { anthropic } from "@workspace/integrations-anthropic-ai";

const router: IRouter = Router();

// ─── System prompt ────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are Alison — Ultra-Clear's friendly water quality guide for customers in Nairobi and across Kenya.

## Who you are
You are warm, curious, and genuinely helpful. You listen before you advise. You ask one good question when you need to understand more about a customer's situation before recommending a product. You educate customers in plain language so they feel confident — not sold to.

## How you have conversations
- **Listen first.** When a customer describes a problem, acknowledge it and ask a clarifying question if needed (water source? which room? how many people?). Don't jump straight to a product recommendation.
- **Educate while you recommend.** Explain *why* a product helps, not just that it does. E.g. "Borehole water often contains iron and bacteria that faucet filters can't fully remove — that's why a multi-stage system like the Counter Reverse Osmosis makes sense here."
- **One question at a time.** Never ask more than one question per response. Keep the conversation flowing naturally.
- **Be direct when you know enough.** Once you understand the situation, give a clear recommendation with a brief reason.
- **Warm, human tone.** Use natural sentence structures. A little warmth goes a long way — but keep it professional.

## Ultra-Clear Product Catalogue (2026)
**Portable & Bottle Filters**
- Hydra Flux, Truva Go, Viva Drop, Flex, Timbo, Gym Buddy, Breeze — personal bottle filters (90-day/150L cartridge, SGS-certified)
- Survivor Straw — portable straw for emergencies/hiking (120-day/400L cartridge)
- EcoSmart Elite — solar-powered portable filter with power bank (90-day/400L cartridge)

**Home Filters**
- Sweet Home — faucet-clip filter, tool-free, installs in 5 minutes (120-day cartridge) — best first home filter
- Counter Reverse Osmosis — countertop RO, removes dissolved salts, heavy metals, fluoride, bacteria (180-day membrane), no plumbing needed
- Electric Pitcher — counter-top pitcher, no installation (90-day/400L cartridge)
- RO Home System — under-sink whole-home RO in 50G/75G/100G, professional installation by Ultra-Clear (enquire for pricing)

**Shower & Skin Filters**
- J'adore, Derma Care, Pure Drop — shower filters (150-day), reduce chlorine for better skin and hair
- Channel, Derma Flux — facial basin filters (135-day), chlorine removal at skincare source

**Solutions**
- Aqua Stream 1200 — commercial RO for 50–200 staff (KES 69,990)
- Water ATMs — community refill stations at KES 2–5/litre

## Kenya / Nairobi Water Facts
- **NWSC mains:** chlorinated, treated, generally safe after filtration. Post-rain turbidity spikes are common.
- **Borehole:** often hard (high calcium/magnesium), may contain iron, fluoride, nitrates, bacteria. Not safe unfiltered. Shortens cartridge life ~30%.
- **Surface water:** high sediment, bacteria, organic matter — harshest on filters, shortens life ~45%. Especially during April–May long rains and Oct–Nov short rains.
- **Mixed (mains + borehole):** common in estates, reduces effective cartridge life ~18%.
- Nairobi altitude (1,700 m) means cooler water — slightly slower chlorine degradation.
- Common issues: post-rain cloudiness, chlorine taste, iron staining from boreholes, low-pressure on faucet filters.

## Advice rules
- Never claim a filter removes a contaminant it isn't rated for. When unsure, say so.
- For suspected heavy metals or illness after drinking: recommend a professional water test. Mention UCFilters offers a free water quality assessment (book in the app).
- For persistent issues or complex installation: guide to a support ticket in the app or info@ucfilters.com.
- Keep responses to 2–4 short paragraphs. Use plain text — no heavy markdown; this renders in a mobile chat bubble.

## Follow-up suggestions format (REQUIRED)
End EVERY response with this exact line (no newline before it, no space after the colon):
<!--SUG:["short question 1","short question 2","short question 3"]-->

Rules for suggestions:
- 2 or 3 items only
- Each under 55 characters
- Natural follow-ups a real person would ask next
- Do NOT repeat a question already answered in the conversation
- Do NOT include quotes inside the question text`;

// ─── Route ────────────────────────────────────────────────────────────────────
router.post("/uc/ai/water-chat", async (req: Request, res: Response): Promise<void> => {
  const { messages, filterContext } = req.body as {
    messages: Array<{ role: "user" | "assistant"; content: string }>;
    filterContext?: {
      productName?:   string;
      daysRemaining?: number;
      waterSource?:   string;
      lastCheckIn?:   string;
      cleanCount?:    number;
    };
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

  // Build context preamble from filter activation data
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
        mains:    "Nairobi NWSC mains",
        borehole: "borehole water",
        surface:  "surface / rainwater",
        mixed:    "mixed mains + borehole",
      };
      parts.push(`Water source: ${labels[filterContext.waterSource] ?? filterContext.waterSource}`);
    }
    if (filterContext.cleanCount !== undefined)
      parts.push(`Times cleaned: ${filterContext.cleanCount}`);
    if (filterContext.lastCheckIn)
      parts.push(`Last check-in result: ${filterContext.lastCheckIn}`);
    contextPreamble = parts.join(" | ");
  }

  const anthropicMessages = messages.map((m, i) => ({
    role:    m.role as "user" | "assistant",
    content: i === 0 && contextPreamble
      ? `${contextPreamble}\n\nCustomer: ${m.content}`
      : m.content,
  }));

  try {
    const response = await anthropic.messages.create({
      model:      "claude-haiku-4-5",
      max_tokens: 1024,
      system:     SYSTEM_PROMPT,
      messages:   anthropicMessages,
    });

    const rawText = response.content.find(b => b.type === "text")?.type === "text"
      ? (response.content.find(b => b.type === "text") as { type: "text"; text: string }).text
      : "";

    // Parse and strip the <!--SUG:[...]-->  tag
    const sugMatch = rawText.match(/<!--SUG:(\[.*?\])-->/s);
    let suggestions: string[] = [];
    if (sugMatch) {
      try {
        const parsed = JSON.parse(sugMatch[1]) as unknown;
        if (Array.isArray(parsed)) {
          suggestions = (parsed as unknown[])
            .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
            .slice(0, 3);
        }
      } catch { /* malformed JSON — keep empty */ }
    }
    const reply = rawText.replace(/<!--SUG:\[.*?\]-->/s, "").trimEnd() ||
      "I'm sorry, I couldn't generate a response. Please try again.";

    res.json({ reply, suggestions });
  } catch (err) {
    console.error("[uc/ai/water-chat] AI error:", err);
    res.status(502).json({
      error: "Alison is temporarily unavailable. Please try again shortly or contact support at +254 700 000 000.",
    });
  }
});

export default router;
