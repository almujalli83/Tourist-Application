import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;
const base = (p: P) => ({ viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true, ...p });

export const PlaneIcon = (p: P) => (<svg {...base(p)}><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" /></svg>);
export const HotelIcon = (p: P) => (<svg {...base(p)}><path d="M3 21V7a2 2 0 0 1 2-2h6v16M11 9h8a2 2 0 0 1 2 2v10M3 21h18M7 9h.01M7 13h.01M7 17h.01M15 13h2M15 17h2" /></svg>);
export const TicketIcon = (p: P) => (<svg {...base(p)}><path d="M3 9a3 3 0 0 0 0 6v3a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-3a3 3 0 0 0 0-6V6a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1zM13 5v2M13 17v2M13 11v2" /></svg>);
export const PassportIcon = (p: P) => (<svg {...base(p)}><rect x="4" y="2.5" width="16" height="19" rx="2" /><circle cx="12" cy="10" r="3.2" /><path d="M8.8 10h6.4M12 6.8c1 .9 1.4 2 1.4 3.2s-.4 2.3-1.4 3.2c-1-.9-1.4-2-1.4-3.2s.4-2.3 1.4-3.2M8.5 17h7" /></svg>);
export const ShieldIcon = (p: P) => (<svg {...base(p)}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" /></svg>);
export const UserIcon = (p: P) => (<svg {...base(p)}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>);
export const BuildingIcon = (p: P) => (<svg {...base(p)}><path d="M4 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17M16 9h3a1 1 0 0 1 1 1v11M2 21h20M8 7h4M8 11h4M8 15h4" /></svg>);
export const CheckIcon = (p: P) => (<svg {...base(p)}><path d="M20 6 9 17l-5-5" /></svg>);
export const GlobeIcon = (p: P) => (<svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></svg>);
export const CalendarIcon = (p: P) => (<svg {...base(p)}><rect x="3" y="4.5" width="18" height="17" rx="2" /><path d="M3 9.5h18M8 2.5v4M16 2.5v4" /></svg>);
export const UsersIcon = (p: P) => (<svg {...base(p)}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5" /></svg>);
export const CardIcon = (p: P) => (<svg {...base(p)}><rect x="2.5" y="5" width="19" height="14" rx="2" /><path d="M2.5 10h19M6.5 15h4" /></svg>);
export const CameraIcon = (p: P) => (<svg {...base(p)}><path d="M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z" /><circle cx="12" cy="13" r="4" /></svg>);
export const MenuIcon = (p: P) => (<svg {...base(p)}><path d="M4 6h16M4 12h16M4 18h16" /></svg>);
export const XIcon = (p: P) => (<svg {...base(p)}><path d="M18 6 6 18M6 6l12 12" /></svg>);
export const ChevronIcon = (p: P) => (<svg {...base(p)}><path d="m9 6 6 6-6 6" /></svg>);
export const MapPinIcon = (p: P) => (<svg {...base(p)}><path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z" /><circle cx="12" cy="10" r="2.5" /></svg>);
export const LockIcon = (p: P) => (<svg {...base(p)}><rect x="4" y="10.5" width="16" height="11" rx="2" /><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" /></svg>);
export const RefreshIcon = (p: P) => (<svg {...base(p)}><path d="M20 11a8 8 0 0 0-14.9-3.9M4 4v4h4M4 13a8 8 0 0 0 14.9 3.9M20 20v-4h-4" /></svg>);
export const HeartPulseIcon = (p: P) => (<svg {...base(p)}><path d="M20.8 11.2A5.5 5.5 0 0 0 12 5.6a5.5 5.5 0 0 0-8.8 5.6C4.6 15.5 12 20.5 12 20.5s7.4-5 8.8-9.3z" /><path d="M3.5 12h4l1.5-3 3 6 1.5-3h4" /></svg>);

export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden>
      <rect width="40" height="40" rx="10" fill="#0b5a47" />
      <path d="M20 7c-3.5 4.2-5.3 8.4-5.3 12.6 0 3.2 1.8 5.4 5.3 6.6 3.5-1.2 5.3-3.4 5.3-6.6C25.3 15.4 23.5 11.2 20 7z" fill="#b8913f" />
      <path d="M9 28.5c3.4 2.4 7 3.5 11 3.5s7.6-1.1 11-3.5" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" fill="none" />
      <path d="M20 26.2V33" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
