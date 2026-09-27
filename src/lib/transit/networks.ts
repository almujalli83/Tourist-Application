/**
 * Sample city bus networks (sandbox) for the cities without a linked operator yet: lines from a
 * central hub (the Haram in Makkah, the Prophet's Mosque in Madinah, Al-Balad in Jeddah, central
 * Dammam) to the main landmarks. Stop locations are approximate; the operator's own network
 * replaces this once linked.
 */
export interface NetStop { id: string; nameAr: string; nameEn: string; lat: number; lng: number }
export interface NetLine { id: string; nameAr: string; nameEn: string; color: string; stops: NetStop[] }
export interface BusNetwork { city: string; hub: NetStop; lines: NetLine[] }

const s = (id: string, nameAr: string, nameEn: string, lat: number, lng: number): NetStop => ({ id, nameAr, nameEn, lat, lng });

const HARAM = s("mkx-haram", "المسجد الحرام", "Masjid al-Haram", 21.4225, 39.8262);
const NABAWI = s("med-nabawi", "المسجد النبوي", "The Prophet's Mosque", 24.4672, 39.6112);
const BALAD = s("jed-balad", "جدة التاريخية (البلد)", "Historic Jeddah (Al-Balad)", 21.4858, 39.1868);
const DAMMAM = s("dmm-center", "وسط الدمام — حديقة الملك فهد", "Central Dammam — King Fahd Park", 26.402, 50.088);

export const BUS_NETWORKS: Record<string, BusNetwork> = {
  MKX: {
    city: "MKX", hub: HARAM,
    lines: [
      { id: "M1", nameAr: "خط العزيزية ومنى", nameEn: "Aziziyah & Mina line", color: "#0f766e", stops: [HARAM, s("mkx-aziziyah", "العزيزية", "Al-Aziziyah", 21.419, 39.8725), s("mkx-mina", "منى", "Mina", 21.4133, 39.8933)] },
      { id: "M2", nameAr: "خط التنعيم", nameEn: "Al-Taneem line", color: "#b45309", stops: [HARAM, s("mkx-zahir", "الزاهر", "Al-Zahir", 21.4395, 39.8095), s("mkx-taneem", "مسجد التنعيم (مسجد عائشة)", "Al-Taneem Mosque (Masjid Aisha)", 21.4638, 39.7836)] },
      { id: "M3", nameAr: "خط جبل النور", nameEn: "Jabal al-Nour line", color: "#7c3aed", stops: [HARAM, s("mkx-maabdah", "المعابدة", "Al-Maabdah", 21.4395, 39.8435), s("mkx-nour", "جبل النور (غار حراء)", "Jabal al-Nour (Cave of Hira)", 21.4575, 39.8617)] },
      { id: "M4", nameAr: "خط كدي", nameEn: "Kudai line", color: "#be185d", stops: [HARAM, s("mkx-kudai", "كدي", "Kudai", 21.4065, 39.829)] },
    ],
  },
  MED: {
    city: "MED", hub: NABAWI,
    lines: [
      { id: "D1", nameAr: "خط قباء", nameEn: "Quba line", color: "#15803d", stops: [NABAWI, s("med-ghamamah", "مسجد الغمامة", "Al-Ghamamah Mosque", 24.466, 39.6086), s("med-hejaz", "متحف سكة حديد الحجاز", "Hejaz Railway Museum", 24.4636, 39.601), s("med-darmadinah", "متحف دار المدينة", "Dar Al Madinah Museum", 24.446, 39.6165), s("med-quba", "مسجد قباء", "Quba Mosque", 24.4393, 39.6173)] },
      { id: "D2", nameAr: "خط القبلتين", nameEn: "Qiblatain line", color: "#b45309", stops: [NABAWI, s("med-sirah", "المعرض الدولي للسيرة النبوية", "Prophet's Biography Museum", 24.4705, 39.609), s("med-dates", "سوق التمور", "Date Market", 24.4712, 39.6045), s("med-seven", "المساجد السبعة", "The Seven Mosques", 24.4777, 39.593), s("med-qiblatain", "مسجد القبلتين", "Masjid Al-Qiblatain", 24.4838, 39.5791)] },
      { id: "D3", nameAr: "خط أحد", nameEn: "Uhud line", color: "#1d4ed8", stops: [NABAWI, s("med-noor", "النور مول", "Al Noor Mall", 24.494, 39.634), s("med-uhud", "جبل أحد", "Mount Uhud", 24.504, 39.613)] },
    ],
  },
  JED: {
    city: "JED", hub: BALAD,
    lines: [
      { id: "J1", nameAr: "خط الكورنيش", nameEn: "Corniche line", color: "#0284c7", stops: [BALAD, s("jed-fountain", "نافورة الملك فهد", "King Fahd's Fountain", 21.515, 39.145), s("jed-rahma", "مسجد الرحمة", "Al-Rahma Mosque", 21.543, 39.105), s("jed-sculpture", "متحف المجسمات المفتوح", "Open-Air Sculpture Museum", 21.572, 39.111), s("jed-waterfront", "الواجهة البحرية", "Jeddah Waterfront", 21.6045, 39.105), s("jed-redsea", "رد سي مول", "Red Sea Mall", 21.6268, 39.1106), s("jed-obhur", "شاطئ أبحر", "Obhur Beach", 21.72, 39.1)] },
      { id: "J2", nameAr: "خط التحلية", nameEn: "Tahlia line", color: "#c2410c", stops: [BALAD, s("jed-shallal", "مدينة الشلال", "Al Shallal Theme Park", 21.516, 39.1415), s("jed-tayebat", "متحف الطيبات", "Tayebat Museum", 21.5566, 39.1872), s("jed-tahlia", "شارع التحلية", "Tahlia Street", 21.548, 39.162), s("jed-arabia", "مول العرب", "Mall of Arabia", 21.632, 39.156)] },
    ],
  },
  DMM: {
    city: "DMM", hub: DAMMAM,
    lines: [
      { id: "E1", nameAr: "خط الكورنيش وتاروت", nameEn: "Corniche & Tarout line", color: "#0891b2", stops: [DAMMAM, s("dmm-village", "القرية التراثية", "Heritage Village", 26.457, 50.111), s("dmm-corniche", "كورنيش الدمام", "Dammam Corniche", 26.4475, 50.127), s("dmm-tarout", "قلعة تاروت", "Tarout Castle", 26.572, 50.064)] },
      { id: "E2", nameAr: "خط الخبر", nameEn: "Al Khobar line", color: "#9333ea", stops: [DAMMAM, s("dmm-ithra", "إثراء", "Ithra", 26.3328, 50.1177), s("dmm-rashid", "الراشد مول", "Al Rashid Mall", 26.3, 50.205), s("dmm-tower", "برج الماء بالخبر", "Al Khobar Water Tower", 26.301, 50.223), s("dmm-khobar", "كورنيش الخبر", "Al Khobar Corniche", 26.295, 50.22)] },
    ],
  },
};

export const allStops = (n: BusNetwork): NetStop[] => {
  const seen = new Map<string, NetStop>();
  for (const l of n.lines) for (const st of l.stops) seen.set(st.id, st);
  return [...seen.values()];
};
