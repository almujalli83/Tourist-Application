import type { Metadata } from "next";
import { FamilyJoin } from "@/components/family-join";

export const metadata: Metadata = { referrer: "no-referrer", robots: { index: false } };

export default function FamilyJoinPage() {
  return <FamilyJoin />;
}
