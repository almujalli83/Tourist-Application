"use client";

import { useRef, useState } from "react";
import { useApp } from "../app-provider";
import { CameraIcon, UserIcon } from "../icons";
import { Button, cx, Spinner } from "../ui";
import { preparePersonPhoto, readAsDataURL } from "./image-utils";

export function PhotoUploader({ value, onChange, error }: { value: string; onChange: (v: string) => void; error?: string }) {
  const { t } = useApp();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function handle(file: File | undefined) {
    if (!file) return;
    setLocalError(null);
    if (!/^image\/(jpeg|png)$/.test(file.type)) {
      setLocalError(t.travellers.errors.imageType);
      return;
    }
    setBusy(true);
    try {
      onChange(await preparePersonPhoto(await readAsDataURL(file)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-semibold">{t.travellers.photo.title}<span className="ms-0.5 text-red-600">*</span></p>
      <div className="flex gap-4">
        <button
          type="button"
          onClick={() => input.current?.click()}
          className={cx("relative grid size-32 shrink-0 place-items-center overflow-hidden rounded-xl border-2 border-dashed bg-slate-50 hover:border-brand-500", error || localError ? "border-red-400" : "border-slate-300")}
          aria-label={t.travellers.photo.upload}
        >
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" className="h-full w-full object-cover" />
          ) : (
            <UserIcon className="size-12 text-slate-300" />
          )}
          {busy && <span className="absolute inset-0 grid place-items-center bg-white/70"><Spinner className="size-6 text-brand-700" /></span>}
        </button>
        <div className="flex flex-col gap-2">
          <p className="text-xs leading-relaxed text-slate-500">{t.travellers.photo.hint}</p>
          <Button type="button" size="sm" variant="secondary" onClick={() => input.current?.click()} className="self-start">
            <CameraIcon className="size-4" />{value ? t.travellers.photo.replace : t.travellers.photo.upload}
          </Button>
        </div>
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png" className="hidden" onChange={(e) => { handle(e.target.files?.[0]); e.target.value = ""; }} />
      {(localError || error) && <p className="text-xs font-medium text-red-600">{localError ?? error}</p>}
    </div>
  );
}
