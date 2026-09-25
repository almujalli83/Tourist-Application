/**
 * Claude (Anthropic) client for the assistant and translation. Enabled when ANTHROPIC_API_KEY (or
 * ANTHROPIC_AUTH_TOKEN) is set; otherwise the features run in sandbox mode. The model defaults to
 * Claude Opus 5 at low effort (chat and translation do not need deep reasoning) and can be changed
 * with ASSISTANT_MODEL. Refusals fall back server-side to another model ("default" routing).
 */
import Anthropic from "@anthropic-ai/sdk";

export const aiConfigured = () => !!(process.env.ANTHROPIC_API_KEY?.trim() || process.env.ANTHROPIC_AUTH_TOKEN?.trim());
export const aiModel = () => process.env.ASSISTANT_MODEL?.trim() || "claude-opus-5";

let client: Anthropic | null = null;
const getClient = () => (client ??= new Anthropic());

export class AiUnavailableError extends Error {}

export interface AskInput {
  system: Anthropic.Beta.BetaTextBlockParam[];
  messages: Anthropic.Beta.BetaMessageParam[];
  maxTokens?: number;
}

/** One request; returns the reply text, or null when the request was declined. */
export async function askClaude({ system, messages, maxTokens = 4000 }: AskInput): Promise<string | null> {
  try {
    const response = await getClient().beta.messages.create({
      model: aiModel(),
      max_tokens: maxTokens,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      system,
      messages,
    });
    if (response.stop_reason === "refusal") return null;
    return response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError || error instanceof Anthropic.InternalServerError || error instanceof Anthropic.APIConnectionError) {
      throw new AiUnavailableError("busy");
    }
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      console.error("Claude credentials rejected", error.message);
      throw new AiUnavailableError("config");
    }
    if (error instanceof Anthropic.APIError) {
      console.error(`Claude API error ${error.status}`, error.message);
      throw new AiUnavailableError("error");
    }
    throw error;
  }
}
