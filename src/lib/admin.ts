/**
 * Back office (operations): items that need a person's attention — MT updates that did not go
 * through, packages whose submission failed, emails that could not be delivered — plus the
 * latest package changes.
 */
import type { StoredBooking } from "./bookings/types";
import { emailConfigured, listOutbox } from "./notify";
import { store } from "./store";

export interface OperationsBooking {
  id: string;
  reference: string;
  userId: string;
  accountType: StoredBooking["accountType"];
  createdAt: string;
  status: string;
  packageStatus: string | null;
  returnDate: string;
  travellers: number;
  leadEmail: string;
}

const summary = (b: StoredBooking): OperationsBooking => ({
  id: b.id,
  reference: b.reference,
  userId: b.userId,
  accountType: b.accountType,
  createdAt: b.createdAt,
  status: b.status,
  packageStatus: b.mt.packageStatus,
  returnDate: b.criteria.returnDate,
  travellers: b.applicants.length,
  leadEmail: b.applicants[0]?.email ?? "",
});

export async function operationsOverview() {
  const [bookings, outbox] = await Promise.all([store().list<StoredBooking>("bookings", 1000), listOutbox(300)]);
  const mtIssues = bookings.flatMap((b) => {
    const m = b.modifications?.at(-1);
    return m && m.mt.status !== "UPDATED"
      ? [{ booking: summary(b), modification: { id: m.id, kind: m.kind, createdAt: m.createdAt, newReturnDate: m.newReturnDate, status: m.mt.status, failed: m.mt.results.filter((r) => !r.ok) } }]
      : [];
  });
  const submissionFailed = bookings
    .filter((b) => b.status === "SUBMISSION_FAILED")
    .map((b) => ({ booking: summary(b), errors: b.applicants.flatMap((a) => (a.submission?.errors ?? []).map((e) => `${a.applicationNo}: ${e.code} ${e.message}`)) }));
  const stuckLocks = bookings.filter((b) => b.lock && Date.now() - Date.parse(b.lock.at) > 5 * 60_000).map(summary);
  const recentChanges = bookings
    .flatMap((b) => (b.modifications ?? []).map((m) => ({ booking: summary(b), modification: m })))
    .sort((a, b) => b.modification.createdAt.localeCompare(a.modification.createdAt))
    .slice(0, 50);
  const emailFailures = outbox.filter((m) => m.status === "failed");
  return {
    counts: {
      bookings: bookings.length,
      mtIssues: mtIssues.length,
      submissionFailed: submissionFailed.length,
      emailFailures: emailFailures.length,
      changes: bookings.reduce((a, b) => a + (b.modifications?.length ?? 0), 0),
    },
    emailProvider: emailConfigured(),
    mtIssues,
    submissionFailed,
    stuckLocks,
    emailFailures,
    recentEmails: outbox.slice(0, 30),
    recentChanges,
  };
}

export function getAnyBooking(id: string) {
  return store().get<StoredBooking>("bookings", id);
}
