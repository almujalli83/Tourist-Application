"use client";

import Link from "next/link";
import { Fragment, type ReactNode } from "react";

const TOKEN = /(\[[^\]]+\]\([^)\s]+\)|\*\*[^*]+\*\*|_[^_]+_)/g;

/** Inline markdown subset: in-app links only (/ar/… or /en/…), **bold** and _italic_. */
function inline(text: string, key: string): ReactNode[] {
  return text.split(TOKEN).filter(Boolean).map((part, i) => {
    const k = `${key}-${i}`;
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
    if (link) {
      const [, label, href] = link;
      // Only internal app paths become links; anything else stays plain text.
      return /^\/(ar|en)(\/[^\s]*)?$/.test(href)
        ? <Link key={k} href={href} className="font-semibold text-brand-700 underline decoration-brand-300 underline-offset-2 hover:text-brand-900">{label}</Link>
        : <Fragment key={k}>{label}</Fragment>;
    }
    if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={k}>{part.slice(2, -2)}</strong>;
    if (/^_[^_]+_$/.test(part)) return <em key={k} className="text-slate-500">{part.slice(1, -1)}</em>;
    return <Fragment key={k}>{part}</Fragment>;
  });
}

/** Renders an assistant reply: paragraphs, bullet / numbered lists, headings and inline marks. */
export function RichText({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const Tag = list.ordered ? "ol" : "ul";
    blocks.push(
      <Tag key={`l${blocks.length}`} className={list.ordered ? "list-decimal space-y-0.5 ps-5" : "list-disc space-y-0.5 ps-5"}>
        {list.items.map((it, i) => <li key={i}>{inline(it, `li${blocks.length}-${i}`)}</li>)}
      </Tag>,
    );
    list = null;
  };
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      const ordered = !!numbered;
      if (list && list.ordered !== ordered) flush();
      list ??= { ordered, items: [] };
      list.items.push((bullet ?? numbered)![1]);
      continue;
    }
    flush();
    if (!line.trim()) continue;
    const heading = /^#{1,4}\s+(.*)$/.exec(line);
    blocks.push(heading
      ? <p key={`h${blocks.length}`} className="font-bold">{inline(heading[1], `h${blocks.length}`)}</p>
      : <p key={`p${blocks.length}`}>{inline(line, `p${blocks.length}`)}</p>);
  }
  flush();
  return <div className="space-y-2 break-words">{blocks}</div>;
}
