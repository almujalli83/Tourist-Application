/** Static inventory used by the sandbox travel-agent providers. */

export const CARRIERS = [
  { code: "SV", en: "Saudia", ar: "السعودية" },
  { code: "XY", en: "flynas", ar: "طيران ناس" },
  { code: "F3", en: "flyadeal", ar: "طيران أديل" },
  { code: "RX", en: "Riyadh Air", ar: "طيران الرياض" },
  { code: "MS", en: "EgyptAir", ar: "مصر للطيران" },
  { code: "EK", en: "Emirates", ar: "طيران الإمارات" },
  { code: "TK", en: "Turkish Airlines", ar: "الخطوط التركية" },
  { code: "RJ", en: "Royal Jordanian", ar: "الملكية الأردنية" },
  { code: "AI", en: "Air India", ar: "طيران الهند" },
  { code: "PK", en: "PIA", ar: "الخطوط الباكستانية" },
];

export const DOMESTIC_CARRIERS = ["SV", "XY", "F3", "RX"];

/** Approximate block time in minutes from each origin to Saudi Arabia. */
export const ORIGIN_BLOCK_MIN: Record<string, number> = {
  CAI: 150, DXB: 130, AMM: 130, BEY: 160, CMN: 400, TUN: 330, IST: 240, BOM: 280, DEL: 290,
  KHI: 180, LHE: 250, DAC: 380, CGK: 540, KUL: 500, LHR: 380, CDG: 360, FRA: 340, JFK: 750,
  PEK: 560, NRT: 700,
};

export const ORIGIN_HOME_CARRIER: Record<string, string> = {
  CAI: "MS", DXB: "EK", AMM: "RJ", IST: "TK", BOM: "AI", DEL: "AI", KHI: "PK", LHE: "PK",
};

export const HOTEL_BRANDS = [
  { en: "Al Faisaliah Residence", ar: "مساكن الفيصلية", stars: 5 },
  { en: "Najd Grand Hotel", ar: "فندق نجد الكبير", stars: 5 },
  { en: "Red Sea Pearl Resort", ar: "منتجع لؤلؤة البحر الأحمر", stars: 5 },
  { en: "Heritage Court Hotel", ar: "فندق ساحة التراث", stars: 4 },
  { en: "Oasis Suites", ar: "أجنحة الواحة", stars: 4 },
  { en: "Palm Gate Hotel", ar: "فندق بوابة النخيل", stars: 4 },
  { en: "Desert Rose Inn", ar: "نزل وردة الصحراء", stars: 3 },
  { en: "City Square Hotel", ar: "فندق ميدان المدينة", stars: 3 },
  { en: "Mountain View Lodge", ar: "نُزل إطلالة الجبل", stars: 4 },
  { en: "Corniche Tower Hotel", ar: "فندق برج الكورنيش", stars: 5 },
];

export const DISTRICTS = [
  { en: "City Centre", ar: "وسط المدينة" },
  { en: "Business District", ar: "الحي التجاري" },
  { en: "Waterfront", ar: "الواجهة البحرية" },
  { en: "Historic Quarter", ar: "الحي التاريخي" },
  { en: "Near Airport", ar: "بالقرب من المطار" },
];

export const ROOM_TYPES = [
  { en: "Deluxe Room", ar: "غرفة ديلوكس" },
  { en: "Superior Room", ar: "غرفة سوبيريور" },
  { en: "Family Suite", ar: "جناح عائلي" },
  { en: "Executive Room", ar: "غرفة تنفيذية" },
];

export const AMENITIES = ["wifi", "pool", "gym", "spa", "parking", "breakfast", "airportShuttle", "familyRooms"];

export const ACTIVITIES: {
  kind: "event" | "tour" | "restaurant";
  en: string;
  ar: string;
  venueEn: string;
  venueAr: string;
  price: number;
  from: string;
  to: string;
}[] = [
  { kind: "tour", en: "Guided heritage city tour", ar: "جولة تراثية مع مرشد سياحي", venueEn: "Old town", venueAr: "البلدة القديمة", price: 180, from: "09:00", to: "13:00" },
  { kind: "tour", en: "Desert safari & dune bashing", ar: "رحلة سفاري صحراوية", venueEn: "Desert camp", venueAr: "المخيم الصحراوي", price: 320, from: "15:00", to: "21:00" },
  { kind: "event", en: "Season live concert", ar: "حفل موسيقي ضمن الموسم", venueEn: "Season arena", venueAr: "مسرح الموسم", price: 250, from: "20:00", to: "23:30" },
  { kind: "event", en: "Cultural exhibition pass", ar: "تذكرة المعرض الثقافي", venueEn: "Cultural centre", venueAr: "المركز الثقافي", price: 95, from: "10:00", to: "22:00" },
  { kind: "restaurant", en: "Traditional Saudi dinner", ar: "عشاء سعودي تقليدي", venueEn: "Heritage restaurant", venueAr: "مطعم تراثي", price: 220, from: "20:00", to: "22:00" },
  { kind: "tour", en: "Boat trip & snorkelling", ar: "رحلة بحرية وغطس", venueEn: "Marina", venueAr: "المرسى", price: 280, from: "08:00", to: "14:00" },
];
