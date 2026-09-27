/** Multilingual support (service 13): shared types (client-safe). */
import type { Lang } from "../assistant/translate";

export const SUPPORT_CATEGORIES = ["complaint", "visa", "payment", "booking", "events", "restaurants", "trains", "esim", "account", "other"] as const;
export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];
export type TicketStatus = "open" | "waiting" | "closed";
export type TicketPriority = "high" | "normal";

export const MAX_SUBJECT = 120;
export const MAX_MESSAGE = 2000;
export const MAX_ATTACHMENTS = 3;
export const MAX_ATTACHMENT_BYTES = 1_500_000;

export interface SupportAttachment {
  id: string;
  name: string;
  contentType: string;
  size: number;
}

export interface SupportMessage {
  id: string;
  from: "traveller" | "staff" | "assistant" | "system";
  /** Staff member's display name (staff messages). */
  author: string | null;
  at: string;
  /** As written. */
  text: string;
  lang: Lang;
  /** Translation for the other side: Arabic for the team, the traveller's language for staff replies. */
  translation: { lang: Lang; text: string } | null;
  attachments: SupportAttachment[];
}

export interface PublicTicket {
  id: string;
  number: string;
  subject: string;
  category: SupportCategory;
  status: TicketStatus;
  priority: TicketPriority;
  /** The traveller's language. */
  lang: Lang;
  booking: { id: string; reference: string } | null;
  createdAt: string;
  updatedAt: string;
  messages: SupportMessage[];
  assignedTo: string | null;
  /** Sample data (sandbox). */
  demo?: boolean;
}
