"use client";

import { forwardRef, useState, type InputHTMLAttributes } from "react";
import { useApp } from "./app-provider";
import { cx, Input } from "./ui";

/** Password field with show/hide. */
export const PasswordInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function PasswordInput(props, ref) {
  const { t } = useApp();
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input ref={ref} {...props} type={show ? "text" : "password"} dir="ltr" className={cx("pe-16", props.className)} />
      <button
        type="button"
        onClick={() => setShow(!show)}
        aria-pressed={show}
        aria-label={show ? t.auth.hidePassword : t.auth.showPassword}
        className="absolute inset-y-0 end-0 px-3 text-xs font-semibold text-brand-700 hover:text-brand-900"
      >
        {show ? t.auth.hidePassword.split(" ")[0] : t.auth.showPassword.split(" ")[0]}
      </button>
    </div>
  );
});

/** 0–3 from length and variety (a hint only; the server enforces the rules). */
export function passwordScore(pw: string): number {
  if (pw.length < 8) return 0;
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length + (pw.length >= 12 ? 1 : 0);
  return kinds <= 1 ? 0 : kinds === 2 ? 1 : kinds === 3 ? 2 : 3;
}

export function PasswordStrength({ value }: { value: string }) {
  const { t } = useApp();
  if (!value) return null;
  const s = passwordScore(value);
  const labels = [t.auth.strength.weak, t.auth.strength.fair, t.auth.strength.good, t.auth.strength.strong];
  const colors = ["bg-red-500", "bg-amber-500", "bg-brand-500", "bg-brand-700"];
  return (
    <div className="mt-1.5 flex items-center gap-2" aria-live="polite">
      <div className="flex flex-1 gap-1">
        {[0, 1, 2, 3].map((i) => <span key={i} className={cx("h-1 flex-1 rounded-full", i <= s ? colors[s] : "bg-slate-200")} />)}
      </div>
      <span className="text-xs text-slate-600">{labels[s]}</span>
    </div>
  );
}
