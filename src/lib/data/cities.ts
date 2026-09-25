/**
 * Departure cities (international) and Saudi destination cities.
 * Saudi cities carry the MT City lookup code (getCity) and the airport code used as
 * entry / exit port (getEntryPort / getExitPort).
 * Packages may cover all regions of Saudi Arabia (Key Package Requirements v1.3). Destinations are
 * airport cities because the itinerary is built from flights; Makkah (no airport) is reached by
 * ground from Jeddah and is not yet offered as a stop.
 */
export interface City {
  code: string; // IATA city/airport code
  en: string;
  ar: string;
  country: string; // ISO2
  airportEn: string;
  airportAr: string;
}

export interface SaudiCity extends City {
  /** Code returned by the MT getCity lookup. */
  mtCityCode: string;
  descriptionEn: string;
  descriptionAr: string;
}

export const SAUDI_CITIES: SaudiCity[] = [
  { code: "RUH", mtCityCode: "RIYADH", en: "Riyadh", ar: "الرياض", country: "SA", airportEn: "King Khalid International", airportAr: "مطار الملك خالد الدولي", descriptionEn: "The capital — Diriyah, Boulevard, Riyadh Season", descriptionAr: "العاصمة — الدرعية، البوليفارد، موسم الرياض" },
  { code: "JED", mtCityCode: "JEDDAH", en: "Jeddah", ar: "جدة", country: "SA", airportEn: "King Abdulaziz International", airportAr: "مطار الملك عبدالعزيز الدولي", descriptionEn: "Red Sea gateway and historic Al-Balad", descriptionAr: "بوابة البحر الأحمر وجدة التاريخية" },
  { code: "ULH", mtCityCode: "ALULA", en: "AlUla", ar: "العُلا", country: "SA", airportEn: "AlUla International", airportAr: "مطار العُلا الدولي", descriptionEn: "Hegra, Elephant Rock and desert heritage", descriptionAr: "الحِجر وجبل الفيل والتراث الصحراوي" },
  { code: "DMM", mtCityCode: "DAMMAM", en: "Dammam", ar: "الدمام", country: "SA", airportEn: "King Fahd International", airportAr: "مطار الملك فهد الدولي", descriptionEn: "Eastern Province and Arabian Gulf coast", descriptionAr: "المنطقة الشرقية وساحل الخليج العربي" },
  { code: "AHB", mtCityCode: "ABHA", en: "Abha", ar: "أبها", country: "SA", airportEn: "Abha International", airportAr: "مطار أبها الدولي", descriptionEn: "Asir mountains and mild summers", descriptionAr: "جبال عسير وصيف معتدل" },
  { code: "TIF", mtCityCode: "TAIF", en: "Taif", ar: "الطائف", country: "SA", airportEn: "Taif International", airportAr: "مطار الطائف الدولي", descriptionEn: "City of roses on the Sarawat range", descriptionAr: "مدينة الورد على جبال السروات" },
  { code: "TUU", mtCityCode: "TABUK", en: "Tabuk", ar: "تبوك", country: "SA", airportEn: "Prince Sultan bin Abdulaziz", airportAr: "مطار الأمير سلطان بن عبدالعزيز", descriptionEn: "Gateway to NEOM and the northern coast", descriptionAr: "بوابة نيوم والساحل الشمالي" },
  { code: "HOF", mtCityCode: "ALAHSA", en: "Al-Ahsa", ar: "الأحساء", country: "SA", airportEn: "Al-Ahsa International", airportAr: "مطار الأحساء الدولي", descriptionEn: "UNESCO oasis and palm groves", descriptionAr: "واحة مسجلة في اليونسكو وبساتين النخيل" },
  { code: "YNB", mtCityCode: "YANBU", en: "Yanbu", ar: "ينبع", country: "SA", airportEn: "Prince Abdulmohsin bin Abdulaziz", airportAr: "مطار الأمير عبدالمحسن بن عبدالعزيز", descriptionEn: "Coral reefs and diving", descriptionAr: "الشعاب المرجانية والغوص" },
  { code: "MED", mtCityCode: "MADINAH", en: "Madinah", ar: "المدينة المنورة", country: "SA", airportEn: "Prince Mohammad bin Abdulaziz International", airportAr: "مطار الأمير محمد بن عبدالعزيز الدولي", descriptionEn: "The Prophet's City, Quba and historic landmarks", descriptionAr: "مدينة الرسول ﷺ، قباء والمعالم التاريخية" },
  { code: "ELQ", mtCityCode: "BURAYDAH", en: "Qassim (Buraydah)", ar: "القصيم (بريدة)", country: "SA", airportEn: "Prince Nayef bin Abdulaziz International", airportAr: "مطار الأمير نايف بن عبدالعزيز الدولي", descriptionEn: "Date festivals and Najdi heritage", descriptionAr: "مهرجانات التمور والتراث النجدي" },
  { code: "HAS", mtCityCode: "HAIL", en: "Hail", ar: "حائل", country: "SA", airportEn: "Hail International", airportAr: "مطار حائل الدولي", descriptionEn: "Rock art of Jubbah and the Aja mountains", descriptionAr: "نقوش جبة الصخرية وجبال أجا" },
  { code: "GIZ", mtCityCode: "JAZAN", en: "Jazan", ar: "جازان", country: "SA", airportEn: "King Abdullah bin Abdulaziz", airportAr: "مطار الملك عبدالله بن عبدالعزيز", descriptionEn: "Farasan Islands and coffee terraces", descriptionAr: "جزر فرسان ومدرجات البن" },
  { code: "EAM", mtCityCode: "NAJRAN", en: "Najran", ar: "نجران", country: "SA", airportEn: "Najran Domestic", airportAr: "مطار نجران", descriptionEn: "Al-Ukhdood archaeological site and mud palaces", descriptionAr: "موقع الأخدود الأثري والقصور الطينية" },
  { code: "ABT", mtCityCode: "ALBAHA", en: "Al Baha", ar: "الباحة", country: "SA", airportEn: "King Saud bin Abdulaziz", airportAr: "مطار الملك سعود بن عبدالعزيز", descriptionEn: "Forests, Dhee Ain village and mountain views", descriptionAr: "الغابات وقرية ذي عين الأثرية" },
  { code: "AJF", mtCityCode: "SAKAKA", en: "Al Jouf (Sakaka)", ar: "الجوف (سكاكا)", country: "SA", airportEn: "Al Jouf Domestic", airportAr: "مطار الجوف", descriptionEn: "Dumat Al-Jandal and the Rajajil pillars", descriptionAr: "دومة الجندل وأعمدة الرجاجيل" },
  { code: "RAE", mtCityCode: "ARAR", en: "Arar", ar: "عرعر", country: "SA", airportEn: "Arar Domestic", airportAr: "مطار عرعر", descriptionEn: "Northern Borders region and desert spring", descriptionAr: "منطقة الحدود الشمالية وربيع الصحراء" },
];

export const ORIGIN_CITIES: City[] = [
  { code: "CAI", en: "Cairo", ar: "القاهرة", country: "EG", airportEn: "Cairo International", airportAr: "مطار القاهرة الدولي" },
  { code: "DXB", en: "Dubai", ar: "دبي", country: "AE", airportEn: "Dubai International", airportAr: "مطار دبي الدولي" },
  { code: "AMM", en: "Amman", ar: "عمّان", country: "JO", airportEn: "Queen Alia International", airportAr: "مطار الملكة علياء الدولي" },
  { code: "BEY", en: "Beirut", ar: "بيروت", country: "LB", airportEn: "Rafic Hariri International", airportAr: "مطار رفيق الحريري الدولي" },
  { code: "CMN", en: "Casablanca", ar: "الدار البيضاء", country: "MA", airportEn: "Mohammed V International", airportAr: "مطار محمد الخامس الدولي" },
  { code: "TUN", en: "Tunis", ar: "تونس", country: "TN", airportEn: "Tunis–Carthage", airportAr: "مطار تونس قرطاج" },
  { code: "IST", en: "Istanbul", ar: "إسطنبول", country: "TR", airportEn: "Istanbul Airport", airportAr: "مطار إسطنبول" },
  { code: "BOM", en: "Mumbai", ar: "مومباي", country: "IN", airportEn: "Chhatrapati Shivaji Maharaj", airportAr: "مطار تشاتراباتي شيفاجي" },
  { code: "DEL", en: "New Delhi", ar: "نيودلهي", country: "IN", airportEn: "Indira Gandhi International", airportAr: "مطار إنديرا غاندي الدولي" },
  { code: "KHI", en: "Karachi", ar: "كراتشي", country: "PK", airportEn: "Jinnah International", airportAr: "مطار جناح الدولي" },
  { code: "LHE", en: "Lahore", ar: "لاهور", country: "PK", airportEn: "Allama Iqbal International", airportAr: "مطار العلامة إقبال الدولي" },
  { code: "DAC", en: "Dhaka", ar: "دكا", country: "BD", airportEn: "Hazrat Shahjalal International", airportAr: "مطار حضرة شاه جلال الدولي" },
  { code: "CGK", en: "Jakarta", ar: "جاكرتا", country: "ID", airportEn: "Soekarno–Hatta International", airportAr: "مطار سوكارنو هاتا الدولي" },
  { code: "KUL", en: "Kuala Lumpur", ar: "كوالالمبور", country: "MY", airportEn: "Kuala Lumpur International", airportAr: "مطار كوالالمبور الدولي" },
  { code: "LHR", en: "London", ar: "لندن", country: "GB", airportEn: "Heathrow", airportAr: "مطار هيثرو" },
  { code: "CDG", en: "Paris", ar: "باريس", country: "FR", airportEn: "Charles de Gaulle", airportAr: "مطار شارل ديغول" },
  { code: "FRA", en: "Frankfurt", ar: "فرانكفورت", country: "DE", airportEn: "Frankfurt am Main", airportAr: "مطار فرانكفورت" },
  { code: "JFK", en: "New York", ar: "نيويورك", country: "US", airportEn: "John F. Kennedy International", airportAr: "مطار جون كينيدي الدولي" },
  { code: "PEK", en: "Beijing", ar: "بكين", country: "CN", airportEn: "Beijing Capital International", airportAr: "مطار بكين الدولي" },
  { code: "NRT", en: "Tokyo", ar: "طوكيو", country: "JP", airportEn: "Narita International", airportAr: "مطار ناريتا الدولي" },
];

const ALL = new Map<string, City>([...ORIGIN_CITIES, ...SAUDI_CITIES].map((c) => [c.code, c]));

export function getCity(code: string): City | undefined {
  return ALL.get(code);
}

export function getSaudiCity(code: string): SaudiCity | undefined {
  return SAUDI_CITIES.find((c) => c.code === code);
}

export function cityName(code: string, locale: "ar" | "en"): string {
  const c = ALL.get(code);
  return c ? c[locale] : code;
}
