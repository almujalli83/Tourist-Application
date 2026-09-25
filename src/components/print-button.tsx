"use client";

import { Button } from "./ui";

export function PrintButton({ label }: { label: string }) {
  return <Button className="print:hidden" onClick={() => window.print()}>{label}</Button>;
}
