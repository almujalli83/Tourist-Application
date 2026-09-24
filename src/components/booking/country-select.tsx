"use client";

import { COUNTRIES } from "@/lib/data/countries";
import { useApp } from "../app-provider";
import { Select } from "../ui";

export function CountrySelect({ value, onChange, placeholder, invalid, id }: {
  value: string; onChange: (v: string) => void; placeholder?: string; invalid?: boolean; id?: string;
}) {
  const { locale } = useApp();
  const sorted = [...COUNTRIES].sort((a, b) => a[locale].localeCompare(b[locale], locale));
  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value)} invalid={invalid}>
      <option value="">{placeholder ?? "—"}</option>
      {sorted.map((c) => (
        <option key={c.iso2} value={c.iso2}>{c[locale]}</option>
      ))}
    </Select>
  );
}
