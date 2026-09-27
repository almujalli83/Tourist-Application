"use client";

import { useEffect, useState } from "react";
import { useApp } from "../app-provider";
import { ShieldIcon } from "../icons";

/** Complaint tickets: our team follows up with high priority; the official MoT complaint service is linked too. */
export function SupportComplaintCard() {
  const { t } = useApp();
  const c = t.support.complaint;
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/support/config").then((r) => r.json()).then((d) => setUrl(d.complaintsUrl)).catch(() => undefined);
  }, []);
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm" data-testid="support-complaint">
      <p className="font-bold text-amber-900">{c.title}</p>
      <p className="mt-1 leading-6 text-amber-900/90">{c.body}</p>
      {url && (
        <a href={url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex h-9 items-center gap-2 rounded-lg bg-brand-800 px-3 text-xs font-semibold text-white hover:bg-brand-900" data-testid="support-complaint-link">
          <ShieldIcon className="size-4" />{c.button}
        </a>
      )}
    </div>
  );
}
