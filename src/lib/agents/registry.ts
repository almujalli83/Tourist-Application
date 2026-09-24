import type { TravelAgentProvider } from "./provider";
import { createSandboxAgent } from "./sandbox-agent";

/**
 * Registered travel agents. Replace / extend with live integrations; every provider
 * returning offers is shown to the customer with its agent name.
 */
export const AGENTS: TravelAgentProvider[] = [
  createSandboxAgent({ id: "alrihla", nameEn: "Al-Rihla Travel", nameAr: "الرحلة للسفر والسياحة", priceFactor: 1.0, latencyMs: 250 }),
  createSandboxAgent({ id: "sahara", nameEn: "Sahara Voyages", nameAr: "رحلات الصحراء", priceFactor: 0.94, latencyMs: 400 }),
  createSandboxAgent({ id: "najdtours", nameEn: "Najd Tours", nameAr: "نجد للسياحة", priceFactor: 1.07, latencyMs: 320 }),
];
