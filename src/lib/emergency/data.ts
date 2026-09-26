/**
 * Emergency numbers in Saudi Arabia (National Numbering Plan of the Communications, Space &
 * Technology Commission, and the National Platform my.gov.sa), and phrases a traveller can show.
 * Client-safe.
 */
export interface EmergencyNumber {
  id: "unified" | "police" | "ambulance" | "civilDefense" | "traffic" | "highway" | "health";
  number: string;
  /** Shown first, as the main call button. */
  primary?: boolean;
}

export const EMERGENCY_NUMBERS: EmergencyNumber[] = [
  { id: "unified", number: "911", primary: true },
  { id: "ambulance", number: "997" },
  { id: "police", number: "999" },
  { id: "civilDefense", number: "998" },
  { id: "traffic", number: "993" },
  { id: "highway", number: "996" },
  { id: "health", number: "937" },
];

export const SOURCES = { portal: "https://my.gov.sa/en/content/93", numbering: "https://www.cst.gov.sa/en/about/Numbering" };

/** Phrases in Arabic with a pronunciation guide, to show or read out. */
export const PHRASES: { id: string; ar: string; say: string; en: string }[] = [
  { id: "ambulance", ar: "أحتاج إسعافًا، من فضلك", say: "aḥtāj isʿāfan, min faḍlak", en: "I need an ambulance, please" },
  { id: "help", ar: "ساعدني من فضلك", say: "sāʿidnī min faḍlak", en: "Please help me" },
  { id: "police", ar: "اتصل بالشرطة", say: "ittaṣil bish-shurṭa", en: "Call the police" },
  { id: "hospital", ar: "أين أقرب مستشفى؟", say: "ayna aqrab mustashfā?", en: "Where is the nearest hospital?" },
  { id: "pharmacy", ar: "أين أقرب صيدلية؟", say: "ayna aqrab ṣaydaliyya?", en: "Where is the nearest pharmacy?" },
  { id: "diabetic", ar: "أنا مريض سكري", say: "ana marīḍ sukkarī", en: "I am diabetic" },
  { id: "allergy", ar: "عندي حساسية", say: "ʿindī ḥassāsiyya", en: "I have an allergy" },
  { id: "heart", ar: "عندي مشكلة في القلب", say: "ʿindī mushkila fil-qalb", en: "I have a heart condition" },
  { id: "lost", ar: "أنا تائه، هذا موقعي", say: "ana tāʾih, hādhā mawqiʿī", en: "I am lost, this is my location" },
  { id: "passport", ar: "فقدت جواز سفري", say: "faqadtu jawāz safarī", en: "I lost my passport" },
  { id: "accident", ar: "حصل حادث", say: "ḥaṣal ḥādith", en: "There has been an accident" },
  { id: "english", ar: "هل يوجد من يتكلم الإنجليزية؟", say: "hal yūjad man yatakallam al-injilīziyya?", en: "Does anyone speak English?" },
];
