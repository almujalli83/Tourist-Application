import { describe, expect, it } from "vitest";
import { aiErrorCode, AiUnavailableError } from "@/lib/assistant/claude";

describe("Claude failure codes", () => {
  it("tells a rejected key and missing credit apart from a busy service", () => {
    expect(aiErrorCode(new AiUnavailableError("key"))).toBe("aiKey");
    expect(aiErrorCode(new AiUnavailableError("credit"))).toBe("aiCredit");
    expect(aiErrorCode(new AiUnavailableError("busy"))).toBe("unavailable");
    expect(aiErrorCode(new AiUnavailableError("error"))).toBe("unavailable");
  });
});
