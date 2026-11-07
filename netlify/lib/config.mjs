// ===== Your channel profile. Gemini uses this to pick and write ideas. =====
export const CHANNEL = {
  name: "Zeecomedia",
  positioning: "a practical AI experimentation channel: test tools, build real things, show what is actually possible (not just AI news)",
  audience: "creators, developers and small-business owners who want to use AI tools and automation today",
  style: "hands-on demos, honest results, curiosity-driven titles, no hype",
  avoid: ["pure news recaps", "celebrity or politics stories", "clickbait that the video can't deliver"],
};

// Each pillar has seed searches. Rising searches are pulled for every seed.
export const PILLARS = [
  { name: "AI video creation", seeds: ["ai video generator", "ai avatar", "ai video editing"] },
  { name: "AI coding", seeds: ["ai coding", "vibe coding", "cursor ai"] },
  { name: "Agents & automation", seeds: ["ai agents", "ai automation", "n8n"] },
  { name: "AI tools & experiments", seeds: ["ai tools", "chatgpt", "gemini"] },
  { name: "AI for business", seeds: ["ai for business", "make money with ai"] },
];

export const MODIFIERS = ["", " tutorial", " vs", " free"]; // YouTube autocomplete long-tail
export const GEOS = ["US"];            // add "GB", "NG", "ES", "BR" (more calls = more rate-limit risk)
export const TREND_TIME = "now 7-d";   // "now 7-d", "today 1-m", "today 3-m"
export const TREND_PROPERTY = "youtube"; // "youtube" or "" for Google web search
export const TRENDING_NOW_GEOS = ["US", "GB", "NG"];
export const TECH_FILTER = /\b(ai|gpt|openai|claude|gemini|llm|chatbot|robot|agent|code|coding|software|app|iphone|android|nvidia|tech|google|microsoft|meta|startup|cyber|chip|api)\b/i;
export const MAX_IDEAS = 24;
