"use client";

import { createContext, forwardRef, useContext, useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "gold" | "danger";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand-700 text-white hover:bg-brand-800 shadow-sm disabled:bg-brand-700/50",
  secondary: "bg-white text-brand-800 ring-1 ring-inset ring-brand-700/25 hover:bg-brand-50",
  ghost: "text-brand-800 hover:bg-brand-50",
  gold: "bg-gold-500 text-white hover:bg-gold-600 shadow-sm",
  danger: "bg-red-600 text-white hover:bg-red-700",
};

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg"; loading?: boolean }>(
  function Button({ variant = "primary", size = "md", loading, className, children, disabled, ...rest }, ref) {
    const sizes = { sm: "h-9 px-3 text-sm", md: "h-11 px-5 text-sm", lg: "h-12 px-7 text-base" };
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cx(
          "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed",
          VARIANTS[variant],
          sizes[size],
          className,
        )}
        {...rest}
      >
        {loading && <Spinner className="size-4" />}
        {children}
      </button>
    );
  },
);

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cx("animate-spin", className)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Card({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgb(15_27_45/0.04)]", className)} {...rest}>
      {children}
    </div>
  );
}

export function SectionTitle({ title, subtitle, icon }: { title: string; subtitle?: string; icon?: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      {icon && <div className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700">{icon}</div>}
      <div>
        <h2 className="text-base font-bold text-ink sm:text-lg">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
    </div>
  );
}

/** Lets Input/Select/Textarea pick up the id of the surrounding Field so its label is associated. */
const FieldIdContext = createContext<string | undefined>(undefined);

export function Field({ label, error, hint, required, children, className, htmlFor }: {
  label: string; error?: string; hint?: string; required?: boolean; children: ReactNode; className?: string; htmlFor?: string;
}) {
  const autoId = useId();
  const id = htmlFor ?? autoId;
  return (
    <FieldIdContext.Provider value={id}>
    <div className={cx("flex min-w-0 flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium text-slate-700">
        {label}
        {required && <span className="ms-0.5 text-red-600">*</span>}
      </label>
      {children}
      {error ? <p className="text-xs font-medium text-red-600">{error}</p> : hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
    </div>
    </FieldIdContext.Provider>
  );
}

const inputBase =
  "w-full min-w-0 max-w-full rounded-lg border bg-white px-3 text-sm text-ink placeholder:text-slate-400 transition focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:bg-slate-50";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(function Input(
  { invalid, className, id, ...rest }, ref,
) {
  const fieldId = useContext(FieldIdContext);
  return <input ref={ref} id={id ?? fieldId} aria-invalid={invalid || undefined} className={cx(inputBase, "h-11", invalid ? "border-red-400" : "border-slate-300 focus:border-brand-500", className)} {...rest} />;
});

export function Select({ invalid, className, children, id, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  const fieldId = useContext(FieldIdContext);
  return (
    <select id={id ?? fieldId} aria-invalid={invalid || undefined} className={cx(inputBase, "h-11 pe-8", invalid ? "border-red-400" : "border-slate-300 focus:border-brand-500", className)} {...rest}>
      {children}
    </select>
  );
}

export function Textarea({ invalid, className, id, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  const fieldId = useContext(FieldIdContext);
  return <textarea id={id ?? fieldId} aria-invalid={invalid || undefined} className={cx(inputBase, "min-h-20 py-2", invalid ? "border-red-400" : "border-slate-300 focus:border-brand-500", className)} {...rest} />;
}

export function Badge({ children, tone = "slate", className }: { children: ReactNode; tone?: "slate" | "brand" | "gold" | "red" | "amber"; className?: string }) {
  const tones = {
    slate: "bg-slate-100 text-slate-700",
    brand: "bg-brand-50 text-brand-800 ring-1 ring-inset ring-brand-700/15",
    gold: "bg-gold-50 text-gold-700 ring-1 ring-inset ring-gold-500/25",
    red: "bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/15",
    amber: "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-600/20",
  };
  return <span className={cx("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold", tones[tone], className)}>{children}</span>;
}

export function Alert({ tone = "info", children, className }: { tone?: "info" | "error" | "success" | "warning"; children: ReactNode; className?: string }) {
  const tones = {
    info: "border-brand-100 bg-brand-50 text-brand-900",
    error: "border-red-200 bg-red-50 text-red-800",
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
  };
  return <div role={tone === "error" ? "alert" : "status"} className={cx("rounded-xl border px-4 py-3 text-sm", tones[tone], className)}>{children}</div>;
}

export function YesNo({ name, value, onChange, labels, invalid }: {
  name: string; value: "true" | "false" | ""; onChange: (v: "true" | "false") => void; labels: { yes: string; no: string }; invalid?: boolean;
}) {
  return (
    <div role="radiogroup" className={cx("inline-flex overflow-hidden rounded-lg border", invalid ? "border-red-400" : "border-slate-300")}>
      {(["true", "false"] as const).map((v) => (
        <label
          key={v}
          className={cx(
            "cursor-pointer px-4 py-2 text-sm font-medium transition-colors",
            value === v ? (v === "true" ? "bg-gold-500 text-white" : "bg-brand-700 text-white") : "bg-white text-slate-700 hover:bg-slate-50",
          )}
        >
          <input type="radio" className="sr-only" name={name} checked={value === v} onChange={() => onChange(v)} />
          {v === "true" ? labels.yes : labels.no}
        </label>
      ))}
    </div>
  );
}

export function Stars({ n }: { n: number }) {
  return (
    <span className="inline-flex text-gold-500" aria-label={`${n} stars`}>
      {Array.from({ length: n }, (_, i) => (
        <svg key={i} viewBox="0 0 20 20" className="size-3.5 fill-current" aria-hidden>
          <path d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 14.9l-5.2 2.7 1-5.8L1.5 7.7l5.9-.9L10 1.5z" />
        </svg>
      ))}
    </span>
  );
}
