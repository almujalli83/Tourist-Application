import type { ReactNode } from "react";
import { BookingProvider } from "@/components/booking/booking-context";
import { VISA_INSURANCE_FEE_SAR } from "@/lib/config";

export default function PackageVisaLayout({ children }: { children: ReactNode }) {
  return <BookingProvider visaFeeSAR={VISA_INSURANCE_FEE_SAR}>{children}</BookingProvider>;
}
