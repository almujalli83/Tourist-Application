/**
 * Sample licensed guides for sandbox mode (no MoT credentials), labelled «تجريبي». One of them has
 * an expired licence so the automatic hiding can be seen (verification shows «منتهٍ»).
 * Off with DEMO_GUIDES=off. Phone numbers and emails are fictitious.
 */
import type { PublicGuide } from "./types";

const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);

export const DEMO_GUIDES = (): Omit<PublicGuide, "demo">[] => [
  {
    licenseNo: "TG-DEMO-1001", licenseExpiry: inDays(420), nameAr: "عبدالله الحربي", nameEn: "Abdullah Alharbi", gender: "male",
    phone: "+966500000101", email: "guide1001@example.com",
    languages: [{ code: "ar", level: "native" }, { code: "en", level: "fluent" }, { code: "fr", level: "good" }],
    cities: ["RUH"], tracks: ["heritage", "city", "desert"],
    bioAr: "مرشد مرخّص منذ ٨ سنوات، متخصص في الدرعية التاريخية وحي الطريف وجولات الرياض القديمة.",
    bioEn: "Licensed for 8 years, specialising in historic Diriyah, At-Turaif and old Riyadh walks.", hasPhoto: false,
  },
  {
    licenseNo: "TG-DEMO-1002", licenseExpiry: inDays(300), nameAr: "نورة القحطاني", nameEn: "Noura Alqahtani", gender: "female",
    phone: "+966500000102", email: "guide1002@example.com",
    languages: [{ code: "ar", level: "native" }, { code: "en", level: "native" }, { code: "de", level: "fluent" }],
    cities: ["RUH"], tracks: ["culture", "city", "food"],
    bioAr: "جولات ثقافية ومتاحف ومطبخ نجدي للعائلات والمجموعات النسائية.",
    bioEn: "Cultural tours, museums and Najdi cuisine for families and women's groups.", hasPhoto: false,
  },
  {
    licenseNo: "TG-DEMO-1003", licenseExpiry: inDays(510), nameAr: "فهد العنزي", nameEn: "Fahad Alanazi", gender: "male",
    phone: "+966500000103", email: "guide1003@example.com",
    languages: [{ code: "ar", level: "native" }, { code: "en", level: "good" }, { code: "zh", level: "fluent" }],
    cities: ["ULH"], tracks: ["heritage", "nature", "adventure"],
    bioAr: "مرشد في العُلا: الحِجر (مدائن صالح) ودادان وجبل الفيل ومسارات المشي.",
    bioEn: "AlUla guide: Hegra, Dadan, Elephant Rock and hiking trails.", hasPhoto: false,
  },
  {
    licenseNo: "TG-DEMO-1004", licenseExpiry: inDays(200), nameAr: "ريم الزهراني", nameEn: "Reem Alzahrani", gender: "female",
    phone: "+966500000104", email: "guide1004@example.com",
    languages: [{ code: "ar", level: "native" }, { code: "en", level: "fluent" }, { code: "ur", level: "good" }],
    cities: ["JED", "TIF"], tracks: ["heritage", "city", "diving", "food"],
    bioAr: "جدة التاريخية (البلد) والواجهة البحرية ورحلات الغوص في البحر الأحمر.",
    bioEn: "Historic Jeddah (Al-Balad), the corniche and Red Sea diving trips.", hasPhoto: false,
  },
  {
    licenseNo: "TG-DEMO-1005", licenseExpiry: inDays(365), nameAr: "محمد السلمي", nameEn: "Mohammed Alsulami", gender: "male",
    phone: "+966500000105", email: "guide1005@example.com",
    languages: [{ code: "ar", level: "native" }, { code: "ur", level: "fluent" }, { code: "id", level: "fluent" }, { code: "en", level: "good" }],
    cities: ["MED", "JED"], tracks: ["religious", "heritage"],
    bioAr: "زيارة المعالم الإسلامية والتاريخية في المدينة المنورة: قباء وجبل أحد والمساجد السبعة.",
    bioEn: "Islamic and historic sites of Madinah: Quba, Mount Uhud and the Seven Mosques.", hasPhoto: false,
  },
  {
    licenseNo: "TG-DEMO-1006", licenseExpiry: inDays(250), nameAr: "سارة الشهري", nameEn: "Sarah Alshehri", gender: "female",
    phone: "+966500000106", email: "guide1006@example.com",
    languages: [{ code: "ar", level: "native" }, { code: "en", level: "fluent" }, { code: "es", level: "good" }],
    cities: ["AHB"], tracks: ["nature", "adventure", "culture"],
    bioAr: "أبها ورجال ألمع والسودة: طبيعة الجبال والقرى التراثية.",
    bioEn: "Abha, Rijal Almaa and Al-Soudah: mountain nature and heritage villages.", hasPhoto: false,
  },
  {
    // Expired licence: hidden everywhere; verification shows «منتهٍ».
    licenseNo: "TG-DEMO-1099", licenseExpiry: inDays(-10), nameAr: "خالد المطيري", nameEn: "Khalid Almutairi", gender: "male",
    phone: "+966500000199", email: "guide1099@example.com",
    languages: [{ code: "ar", level: "native" }, { code: "en", level: "fluent" }],
    cities: ["RUH"], tracks: ["desert", "adventure"],
    bioAr: "رحلات صحراوية حول الرياض.", bioEn: "Desert trips around Riyadh.", hasPhoto: false,
  },
];
