"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { fmt } from "@/i18n";
import { fmtKsa } from "@/lib/events/format";
import {
  COMPLAINT_MAX_RATING, CRITERIA, MAX_COMMENT, MAX_PHOTOS, type ModerationReason, type PublicReview, type ReviewableItem, type ReviewStatus,
} from "@/lib/reviews/types";
import { useApp } from "../app-provider";
import { BackLink } from "../back-link";
import { CalendarIcon, CameraIcon, HotelIcon, MapPinIcon, PassportIcon, PlaneIcon, ShieldIcon, StarIcon, TicketIcon, XIcon } from "../icons";
import { NOTIFICATIONS_CHANGED } from "../notification-bell";
import { Alert, Badge, Button, Card, cx, Spinner, Textarea } from "../ui";
import { RatingStars, StarInput } from "./shared";

type Mine = PublicReview & { status: ReviewStatus; moderationReason: ModerationReason | null; sourceRef: string };
const ICONS = { package: PassportIcon, hotel: HotelIcon, airline: PlaneIcon, event: TicketIcon, restaurant: CalendarIcon, place: MapPinIcon, service: StarIcon };
const STATUS_TONE = { published: "brand", pending: "amber", rejected: "red" } as const;

/** Resizes a photo in the browser (longest side 1280px, JPEG) before upload. */
async function resize(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, fail) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = fail;
      i.src = url;
    });
    const scale = Math.min(1, 1280 / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The Ministry of Tourism's complaint service (low ratings). */
export function ComplaintCard({ url, className }: { url: string; className?: string }) {
  const { t } = useApp();
  const c = t.reviews.complaint;
  return (
    <div className={cx("rounded-xl border border-amber-200 bg-amber-50 p-4", className)} data-testid="complaint">
      <p className="font-bold text-amber-900">{c.title}</p>
      <p className="mt-1 text-sm leading-6 text-amber-900/90">{c.body}</p>
      <a href={url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex h-10 items-center gap-2 rounded-lg bg-brand-800 px-4 text-sm font-semibold text-white hover:bg-brand-900" data-testid="complaint-link">
        <ShieldIcon className="size-4" />{c.button}
      </a>
    </div>
  );
}

function ReviewForm({ item, onDone, onCancel }: { item: ReviewableItem; onDone: (r: { review: Mine; complaint: boolean }) => void; onCancel: () => void }) {
  const { t, locale } = useApp();
  const r = t.reviews;
  const [rating, setRating] = useState(0);
  const [criteria, setCriteria] = useState<Record<string, number>>({});
  const [comment, setComment] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function addPhotos(files: FileList | null) {
    if (!files) return;
    const out: string[] = [];
    for (const f of [...files].slice(0, MAX_PHOTOS - photos.length)) {
      if (!/^image\/(jpeg|png|webp)$/.test(f.type)) {
        setErr(r.errors.photos);
        continue;
      }
      out.push(await resize(f));
    }
    setPhotos((p) => [...p, ...out].slice(0, MAX_PHOTOS));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!rating) return setErr(r.chooseRating);
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: item.key, rating, criteria, comment, photos }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return setErr((r.errors as Record<string, string>)[body.error] ?? r.errors.generic);
      onDone({ review: { ...body.review, sourceRef: item.sourceEn }, complaint: body.complaint });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-5 border-t border-slate-100 pt-4" data-testid="review-form">
      <div>
        <p className="mb-1 text-sm font-semibold">{r.overall} <span className="text-red-600">*</span></p>
        <StarInput name="overall" value={rating} onChange={setRating} label={r.overall} />
      </div>
      <div>
        <p className="mb-2 text-sm font-semibold">{r.details}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {CRITERIA[item.targetType].map((c) => (
            <div key={c} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
              <span className="text-sm text-slate-700">{(r.criteria as Record<string, string>)[c]}</span>
              <StarInput name={c} value={criteria[c] ?? 0} onChange={(n) => setCriteria((x) => ({ ...x, [c]: n }))} label={(r.criteria as Record<string, string>)[c]} size="size-5" />
            </div>
          ))}
        </div>
      </div>
      <div>
        <label htmlFor={`comment-${item.key}`} className="text-sm font-semibold">{r.comment}</label>
        <Textarea id={`comment-${item.key}`} value={comment} maxLength={MAX_COMMENT} rows={4} onChange={(e) => setComment(e.target.value)} className="mt-1" dir="auto" />
        <p className="mt-1 flex justify-between text-xs text-slate-500"><span>{r.commentHint}</span><span className="ltr-nums">{comment.length}/{MAX_COMMENT}</span></p>
      </div>
      <div>
        <p className="text-sm font-semibold">{fmt(r.photos, { n: MAX_PHOTOS })}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {photos.map((p, i) => (
            <div key={i} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p} alt="" className="size-20 rounded-lg object-cover ring-1 ring-slate-200" />
              <button type="button" onClick={() => setPhotos((x) => x.filter((_, j) => j !== i))} aria-label={r.removePhoto} className="absolute -end-2 -top-2 grid size-6 place-items-center rounded-full bg-white text-slate-600 shadow ring-1 ring-slate-200">
                <XIcon className="size-3.5" />
              </button>
            </div>
          ))}
          {photos.length < MAX_PHOTOS && (
            <button type="button" onClick={() => fileRef.current?.click()} className="grid size-20 place-items-center rounded-lg border-2 border-dashed border-slate-300 text-slate-500 hover:border-brand-600 hover:text-brand-700" aria-label={r.addPhoto}>
              <CameraIcon className="size-6" />
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => { void addPhotos(e.target.files); e.target.value = ""; }} />
        </div>
      </div>
      <p className="text-xs leading-5 text-slate-500">{r.policy}</p>
      {err && <Alert tone="error">{err}</Alert>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={busy} data-testid="review-submit">{r.submit}</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>{r.cancel}</Button>
      </div>
      <span className="sr-only">{locale}</span>
    </form>
  );
}

/** Service 9 — «My reviews»: experiences to rate, and the reviews given. */
export function MyReviews() {
  const { t, locale } = useApp();
  const r = t.reviews;
  const [data, setData] = useState<{ pending: ReviewableItem[]; reviews: Mine[]; complaintsUrl: string } | null>(null);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [done, setDone] = useState<{ review: Mine; complaint: boolean } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/reviews/mine", { cache: "no-store" });
    if (!res.ok) return setError(true);
    setData(await res.json());
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <Alert tone="error">{t.review.errors.generic}</Alert>;
  if (!data) return <div className="grid min-h-[40vh] place-items-center text-brand-700"><Spinner className="size-8" /></div>;

  const groups = new Map<string, ReviewableItem[]>();
  for (const i of data.pending) groups.set(locale === "ar" ? i.sourceAr : i.sourceEn, [...(groups.get(locale === "ar" ? i.sourceAr : i.sourceEn) ?? []), i]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <BackLink href={`/${locale}/account`} label={t.account.title} className="-ms-2.5" />
      <div>
        <h1 className="text-2xl font-bold">{r.title}</h1>
        <p className="mt-1 text-sm leading-6 text-slate-600">{r.intro}</p>
      </div>

      {done && (
        <div className="space-y-3" data-testid="review-done">
          <Alert tone={done.review.status === "published" ? "success" : "info"}>
            {r.submitted[done.review.status === "published" ? "published" : "pending"]}
            {done.review.moderationReason && done.review.status !== "published" && <> ({r.reasons[done.review.moderationReason]})</>}
          </Alert>
          {done.complaint && <ComplaintCard url={data.complaintsUrl} />}
        </div>
      )}

      <section>
        <h2 className="mb-3 text-lg font-bold">{r.pendingTitle} {data.pending.length > 0 && <Badge tone="gold">{data.pending.length}</Badge>}</h2>
        {data.pending.length === 0 ? (
          <Card className="p-6 text-sm text-slate-500">{r.pendingEmpty}</Card>
        ) : (
          <div className="space-y-5">
            {[...groups].map(([source, items]) => (
              <div key={source}>
                <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-600">{source}{items[0].demo && <Badge>{r.sample}</Badge>}</p>
                <ul className="space-y-3">
                  {items.map((i) => {
                    const Icon = ICONS[i.targetType];
                    return (
                      <li key={i.key}>
                        <Card className={cx("p-4", open === i.key && "ring-2 ring-brand-600/50")} data-testid={`to-rate-${i.targetType}`}>
                          <div className="flex items-center gap-3">
                            <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700"><Icon className="size-5" /></div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold text-brand-700">{r.targets[i.targetType]}</p>
                              <p className="truncate font-bold text-ink">{locale === "ar" ? i.nameAr : i.nameEn}</p>
                            </div>
                            {open !== i.key && <Button size="sm" onClick={() => { setOpen(i.key); setDone(null); }}>{r.rate}</Button>}
                          </div>
                          {open === i.key && (
                            <ReviewForm
                              item={i}
                              onCancel={() => setOpen(null)}
                              onDone={(res) => {
                                setOpen(null);
                                setDone(res);
                                window.scrollTo({ top: 0, behavior: "smooth" });
                                window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
                                void load();
                              }}
                            />
                          )}
                        </Card>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold">{r.mineTitle}</h2>
        {data.reviews.length === 0 ? (
          <Card className="p-6 text-sm text-slate-500">{r.mineEmpty}</Card>
        ) : (
          <ul className="space-y-3" data-testid="my-reviews">
            {data.reviews.map((rv) => (
              <li key={rv.id}>
                <Card className="space-y-2 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold text-brand-700">{r.targets[rv.targetType]}</p>
                      <p className="font-bold">{locale === "ar" ? rv.targetNameAr : rv.targetNameEn}</p>
                      <p className="text-xs text-slate-500">{fmtKsa(rv.createdAt, locale, { day: "numeric", month: "long", year: "numeric" })}</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge tone={STATUS_TONE[rv.status]}>{r.status[rv.status]}</Badge>
                      {rv.demo && <Badge>{r.sample}</Badge>}
                    </div>
                  </div>
                  <RatingStars value={rv.rating} />
                  {rv.comment && <p className="text-sm leading-6 text-slate-700" dir="auto">{rv.comment}</p>}
                  {rv.status !== "published" && rv.moderationReason && <p className="text-xs text-slate-500">{r.reasons[rv.moderationReason]}</p>}
                  {rv.reply && (
                    <div className="rounded-lg border-s-4 border-brand-600 bg-brand-50/60 p-3 text-sm">
                      <p className="text-xs font-bold text-brand-800">{locale === "ar" ? rv.reply.byAr : rv.reply.byEn}</p>
                      <p className="mt-1 text-slate-700" dir="auto">{rv.reply.text}</p>
                    </div>
                  )}
                  {rv.rating <= COMPLAINT_MAX_RATING && (
                    <a href={data.complaintsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 underline">
                      <ShieldIcon className="size-4" />{r.complaint.button}
                    </a>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-center text-sm">
        <Link href={`/${locale}/ratings`} className="font-semibold text-brand-700 underline">{r.servicesTitle}</Link>
      </p>
    </div>
  );
}
