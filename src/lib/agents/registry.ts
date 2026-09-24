import type { TravelAgentProvider } from "./provider";
import { createSandboxAgent } from "./sandbox-agent";

/**
 * Registered travel agents. Each one currently runs as a sandbox provider (generated test
 * inventory); replace it with the agent's live API integration once the contract is in place.
 * Every provider returning offers is shown to the customer with its agent name.
 */
export const AGENTS: TravelAgentProvider[] = [
  createSandboxAgent({ id: "almatar", nameEn: "Almatar", nameAr: "المطار", priceFactor: 1.0, latencyMs: 250 }),
  createSandboxAgent({ id: "almosafer", nameEn: "Almosafer", nameAr: "المسافر", priceFactor: 0.96, latencyMs: 350 }),
  createSandboxAgent({ id: "webook", nameEn: "WeBook", nameAr: "ويبوك", priceFactor: 0.93, latencyMs: 400 }),
  createSandboxAgent({ id: "reserval", nameEn: "Reserval", nameAr: "ريزيرفال", priceFactor: 1.04, latencyMs: 300 }),
  createSandboxAgent({ id: "akbar", nameEn: "Akbar Travels", nameAr: "أكبر", priceFactor: 0.98, latencyMs: 280 }),
];
