/**
 * UC Water Quality AI Chat
 * POST /api/uc/ai/water-chat
 *
 * Accepts a conversation history and optional filter context.
 * Returns an AI-generated reply from Claude, personalised to
 * the user's registered filter product and Nairobi water conditions.
 */
import { Router, type Request, type Response, type IRouter } from "express";
import { anthropic } from "@workspace/integrations-anthropic-ai";

const router: IRouter = Router();

// ─── System prompt ────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are the Ultra-Clear AI Water Assistant — a friendly, knowledgeable helper for UCFilters customers in Nairobi and across Kenya.

## Your role
Help customers understand water quality, get the most from their Ultra-Clear filter, troubleshoot problems, and make informed decisions about water filtration.

## Ultra-Clear Product Catalogue (2026)
**Portable & Bottle Filters (90-day cartridge)**
- Hydra Flux, Truva Go, Viva Drop, Flex, Timbo, Gym Buddy, Breeze — personal bottle filters
- Survivor Straw — portable straw filter, ideal for hiking and emergencies
- EcoSmart Elite — solar-powered portable filter (120-day cartridge)

**Home Water Filters**
- Sweet Home — faucet-mounted filter (120-day cartridge), easy DIY installation
- Counter Reverse Osmosis — under-counter or countertop RO system (180-day membrane), removes dissolved salts, heavy metals, and fluoride
- Electric Pitcher — filtered pitcher with UV indicator (90-day filter)

**Shower & Skin Filters**
- J'adore, Derma Care, Pure Drop — shower filters, 150-day cartridge, reduce chlorine and sediment for better skin and hair
- Channel, Derma Flux — specialised shower filter lines, 135-day cartridge

## Kenya / Nairobi Water Quality Facts
- **Nairobi Water & Sewerage Company (NWSC) mains water** is chlorinated (0.2–0.5 mg/L residual) and treated, but chlorine taste and sediment spikes are common after heavy rains. Safe to drink after filtration.
- **Borehole water** in Nairobi is often hard (high calcium/magnesium), may contain iron, fluoride (especially in Rift Valley areas), nitrates, and bacteria. Not safe without filtration. Hard water shortens filter cartridge life by ~30%.
- **Surface water** (rivers, rainwater harvest) carries high sediment, bacteria, and organic matter — especially during the April–May long rains and October–November short rains. Harshest on filters; reduces cartridge life by ~45%.
- **Mixed sources** (mains + borehole backup tank) are common in estates and apartments — effective filter life reduced by ~18%.
- Nairobi's altitude (1,700 m) means cooler water temperatures year-round, which slightly reduces chlorine degradation rates.
- Common Nairobi complaints: post-rain turbidity, chlorine taste on mains, iron staining from boreholes, and low-pressure affecting faucet filter flow.
- The recommended replacement schedule assumes Nairobi mains water. Borehole and surface water users should replace cartridges earlier.

## Advice guidelines
- Be practical, direct, and warm. Use plain conversational English — avoid jargon unless the customer uses it first.
- Personalise responses to the customer's filter product and water source when that context is provided.
- For safety-critical concerns (suspected heavy metals, illness after drinking), recommend a professional water test. Mention that UCFilters offers a free water quality assessment — the customer can book through the app.
- Recommend Ultra-Clear products by name only when they genuinely fit the customer's need.
- For complex installation or persistent issues, guide users to submit a maintenance ticket through the app or contact UCFilters directly.
- Keep responses concise (2–4 short paragraphs) unless more detail is clearly needed.
- Never claim a filter removes contaminants it is not rated for. When unsure of specifications, say so and suggest contacting support.
- Use simple formatting — short paragraphs, avoid heavy markdown since the output renders in a mobile chat bubble.`;

// ─── Route ────────────────────────────────────────────────────────────────────
router.post("/uc/ai/water-chat", async (req: Request, res: Response): Promise<void> => {
  const { messages, filterContext } = req.body as {
    messages: Array<{ role: "user" | "assistant"; content: string }>;
    filterContext?: {
      productName?:   string;
      daysRemaining?: number;
      waterSource?:   string;
      lastCheckIn?:   string;  // human-readable recommendation string
      cleanCount?:    number;
    };
  };

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages array is required" });
    return;
  }

  // Validate that all messages have the correct shape
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

  // Conversations must start with a user turn
  if (messages[0]?.role !== "user") {
    res.status(400).json({ error: "First message must have role 'user'" });
    return;
  }

  // Build a context preamble from the user's filter activation data
  let contextPreamble = "";
  if (filterContext && Object.values(filterContext).some(v => v !== undefined)) {
    const parts: string[] = ["[Customer's filter context]"];
    if (filterContext.productName)           parts.push(`Filter product: ${filterContext.productName}`);
    if (filterContext.daysRemaining !== undefined) {
      parts.push(filterContext.daysRemaining > 0
        ? `Days remaining on current cartridge: ${filterContext.daysRemaining}`
        : "Cartridge overdue for replacement");
    }
    if (filterContext.waterSource) {
      const sourceLabels: Record<string, string> = {
        mains:     "Nairobi NWSC mains water",
        borehole:  "borehole water",
        surface:   "surface / rainwater",
        mixed:     "mixed mains + borehole",
      };
      parts.push(`Water source: ${sourceLabels[filterContext.waterSource] ?? filterContext.waterSource}`);
    }
    if (filterContext.cleanCount !== undefined) {
      parts.push(`Times cartridge cleaned: ${filterContext.cleanCount}`);
    }
    if (filterContext.lastCheckIn) {
      parts.push(`Last performance check-in result: ${filterContext.lastCheckIn}`);
    }
    contextPreamble = parts.join(" | ");
  }

  // Inject context preamble into the first user message only
  const anthropicMessages = messages.map((m, i) => {
    if (i === 0 && contextPreamble) {
      return { role: m.role as "user" | "assistant", content: `${contextPreamble}\n\nCustomer question: ${m.content}` };
    }
    return { role: m.role as "user" | "assistant", content: m.content };
  });

  try {
    const response = await anthropic.messages.create({
      model:      "claude-haiku-4-5",
      max_tokens: 8192,
      system:     SYSTEM_PROMPT,
      messages:   anthropicMessages,
    });

    const replyBlock = response.content.find(b => b.type === "text");
    const reply = replyBlock?.type === "text"
      ? replyBlock.text
      : "I'm sorry, I couldn't generate a response. Please try again.";

    res.json({ reply });
  } catch (err) {
    console.error("[uc/ai/water-chat] AI error:", err);
    res.status(502).json({
      error: "AI service temporarily unavailable. Please try again shortly or contact support at +254 700 000 000.",
    });
  }
});

export default router;
