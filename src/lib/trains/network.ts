/**
 * Saudi Arabia Railways (SAR) passenger network: the Haramain high-speed line, the North line
 * and the East line. Station coordinates are approximate (for the map) and should be reviewed.
 */
export type LineId = "haramain" | "north" | "east";

export interface Station {
  code: string;
  nameAr: string;
  nameEn: string;
  /** App city code when the city is one of the destinations (MAK: Makkah, not a destination). */
  city: string;
  lat: number;
  lng: number;
  line: LineId;
  /** Entry restricted to Muslims (Makkah). */
  muslimsOnly?: boolean;
}

export interface Line {
  id: LineId;
  nameAr: string;
  nameEn: string;
  color: string;
  /** Stops in order with minutes from the first stop. */
  stops: { code: string; min: number }[];
  /** Departure times (Saudi time) from each end of the line. */
  departures: string[];
}

export const STATIONS: Station[] = [
  { code: "MKK", nameAr: "محطة مكة المكرمة", nameEn: "Makkah Station", city: "MAK", lat: 21.4127, lng: 39.7947, line: "haramain", muslimsOnly: true },
  { code: "JSL", nameAr: "محطة جدة — السليمانية", nameEn: "Jeddah Al-Sulaimaniyah Station", city: "JED", lat: 21.5176, lng: 39.2194, line: "haramain" },
  { code: "JAP", nameAr: "محطة مطار الملك عبدالعزيز", nameEn: "King Abdulaziz Airport Station", city: "JED", lat: 21.6787, lng: 39.1612, line: "haramain" },
  { code: "KEC", nameAr: "محطة مدينة الملك عبدالله الاقتصادية", nameEn: "King Abdullah Economic City Station", city: "KEC", lat: 22.3747, lng: 39.1219, line: "haramain" },
  { code: "MDN", nameAr: "محطة المدينة المنورة", nameEn: "Madinah Station", city: "MED", lat: 24.5553, lng: 39.6978, line: "haramain" },
  { code: "RUN", nameAr: "محطة الرياض (قطار الشمال)", nameEn: "Riyadh North Line Station", city: "RUH", lat: 24.8434, lng: 46.7446, line: "north" },
  { code: "MJM", nameAr: "محطة المجمعة", nameEn: "Majmaah Station", city: "MJM", lat: 25.9016, lng: 45.3462, line: "north" },
  { code: "QSM", nameAr: "محطة القصيم", nameEn: "Qassim Station", city: "ELQ", lat: 26.3021, lng: 43.8497, line: "north" },
  { code: "HAL", nameAr: "محطة حائل", nameEn: "Hail Station", city: "HAS", lat: 27.4539, lng: 41.7652, line: "north" },
  { code: "JOF", nameAr: "محطة الجوف", nameEn: "Al Jouf Station", city: "AJF", lat: 29.8923, lng: 40.1321, line: "north" },
  { code: "QRY", nameAr: "محطة القريات", nameEn: "Qurayyat Station", city: "URY", lat: 31.3066, lng: 37.3717, line: "north" },
  { code: "RUE", nameAr: "محطة الرياض (قطار الشرق)", nameEn: "Riyadh East Line Station", city: "RUH", lat: 24.6433, lng: 46.7443, line: "east" },
  { code: "HFF", nameAr: "محطة الهفوف", nameEn: "Hofuf Station", city: "HOF", lat: 25.3707, lng: 49.5566, line: "east" },
  { code: "ABQ", nameAr: "محطة بقيق", nameEn: "Abqaiq Station", city: "ABQ", lat: 25.9339, lng: 49.6641, line: "east" },
  { code: "DMS", nameAr: "محطة الدمام", nameEn: "Dammam Station", city: "DMM", lat: 26.3914, lng: 50.1411, line: "east" },
];

export const LINES: Line[] = [
  { id: "haramain", nameAr: "قطار الحرمين السريع", nameEn: "Haramain High-Speed Railway", color: "#9f1239", stops: [{ code: "MKK", min: 0 }, { code: "JSL", min: 35 }, { code: "JAP", min: 47 }, { code: "KEC", min: 80 }, { code: "MDN", min: 140 }], departures: ["06:00", "08:00", "10:00", "12:00", "14:00", "16:00", "18:00", "20:00", "22:00"] },
  { id: "north", nameAr: "قطار الشمال", nameEn: "North Train", color: "#1d4ed8", stops: [{ code: "RUN", min: 0 }, { code: "MJM", min: 95 }, { code: "QSM", min: 200 }, { code: "HAL", min: 320 }, { code: "JOF", min: 520 }, { code: "QRY", min: 680 }], departures: ["07:30", "15:00"] },
  { id: "east", nameAr: "قطار الشرق", nameEn: "East Train", color: "#047857", stops: [{ code: "RUE", min: 0 }, { code: "HFF", min: 180 }, { code: "ABQ", min: 225 }, { code: "DMS", min: 265 }], departures: ["06:15", "10:30", "15:45", "19:30"] },
];

export const stationByCode = (code: string) => STATIONS.find((s) => s.code === code) ?? null;
export const lineById = (id: string) => LINES.find((l) => l.id === id) ?? null;

/** Stations reachable from `from` (same line). */
export const destinationsFrom = (from: string) => {
  const s = stationByCode(from);
  return s ? STATIONS.filter((x) => x.line === s.line && x.code !== s.code) : [];
};

/** Key Riyadh Metro stations for the guide map (approximate positions; the network has many more). */
export const METRO_STATIONS: { code: string; nameAr: string; nameEn: string; lat: number; lng: number; linesAr: string; linesEn: string }[] = [
  { code: "M-QH", nameAr: "محطة قصر الحكم", nameEn: "Qasr Al-Hokm Station", lat: 24.6297, lng: 46.7127, linesAr: "الخط الأزرق والخط البرتقالي", linesEn: "Blue and Orange lines" },
  { code: "M-NM", nameAr: "محطة المتحف الوطني", nameEn: "National Museum Station", lat: 24.6452, lng: 46.7105, linesAr: "الخط الأزرق والخط الأحمر", linesEn: "Blue and Red lines" },
  { code: "M-STC", nameAr: "محطة STC", nameEn: "STC Station", lat: 24.7003, lng: 46.6866, linesAr: "الخط الأزرق والخط الأحمر", linesEn: "Blue and Red lines" },
  { code: "M-KAFD", nameAr: "محطة مركز الملك عبدالله المالي", nameEn: "KAFD Station", lat: 24.7672, lng: 46.6422, linesAr: "الخط الأزرق والخط الأصفر والخط البنفسجي", linesEn: "Blue, Yellow and Purple lines" },
  { code: "M-AIR", nameAr: "محطة المطار (الصالات 1–2)", nameEn: "Airport Station (Terminals 1–2)", lat: 24.957, lng: 46.7007, linesAr: "الخط الأصفر", linesEn: "Yellow line" },
];
