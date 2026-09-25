/**
 * Transport guide (information only — no fares, not linked to trips). Curated content; review
 * it with the official sources before launch as services change.
 */
export type ModeKind = "train" | "metro" | "bus" | "taxi" | "car" | "airport" | "flight" | "tour";

export interface ModeInfo {
  kind: ModeKind;
  titleAr: string;
  titleEn: string;
  bodyAr: string;
  bodyEn: string;
  tipsAr?: string[];
  tipsEn?: string[];
  link?: { url: string; labelAr: string; labelEn: string };
  /** Shows the "book train tickets" button. */
  trainBooking?: boolean;
}

const RIDE_APPS: ModeInfo = {
  kind: "taxi",
  titleAr: "سيارات الأجرة وتطبيقات النقل",
  titleEn: "Taxis & ride-hailing apps",
  bodyAr: "تتوفر في المدن تطبيقات نقل مرخّصة مثل أوبر وكريم وجيني، إضافة إلى سيارات الأجرة الرسمية. الطلب عبر التطبيق يعرض السعر قبل الركوب.",
  bodyEn: "Licensed ride-hailing apps such as Uber, Careem and Jeeny operate in the cities, alongside official taxis. Booking in the app shows the price before the ride.",
  tipsAr: ["استخدم التطبيقات المرخّصة أو سيارات الأجرة الرسمية فقط.", "تحقّق من رقم اللوحة واسم السائق قبل الركوب."],
  tipsEn: ["Use licensed apps or official taxis only.", "Check the plate number and driver name before getting in."],
};

const CAR_RENTAL: ModeInfo = {
  kind: "car",
  titleAr: "تأجير السيارات",
  titleEn: "Car rental",
  bodyAr: "مكاتب التأجير متوفرة في المطارات ووسط المدن. القيادة على يمين الطريق، وحزام الأمان إلزامي، والسرعة مراقبة بكاميرات نظام ساهر.",
  bodyEn: "Rental desks are available at airports and in city centres. Driving is on the right, seat belts are mandatory and speed is monitored by the Saher camera system.",
  tipsAr: ["تحقّق مع شركة التأجير من متطلبات رخصة القيادة للزوار (قد تُطلب رخصة دولية).", "استخدام الجوال أثناء القيادة ممنوع."],
  tipsEn: ["Check the rental company's licence requirements for visitors (an international driving permit may be required).", "Using a phone while driving is prohibited."],
};

/** Travelling between cities. */
export const INTERCITY: ModeInfo[] = [
  {
    kind: "train",
    titleAr: "القطارات (الخطوط الحديدية السعودية — سار)",
    titleEn: "Trains (Saudi Arabia Railways — SAR)",
    bodyAr: "ثلاثة خطوط للركاب: قطار الحرمين السريع (مكة — جدة — مطار الملك عبدالعزيز — مدينة الملك عبدالله الاقتصادية — المدينة المنورة)، وقطار الشمال (الرياض — المجمعة — القصيم — حائل — الجوف — القريات)، وقطار الشرق (الرياض — الهفوف — بقيق — الدمام).",
    bodyEn: "Three passenger lines: the Haramain High-Speed Railway (Makkah — Jeddah — King Abdulaziz Airport — King Abdullah Economic City — Madinah), the North Train (Riyadh — Majmaah — Qassim — Hail — Al Jouf — Qurayyat) and the East Train (Riyadh — Hofuf — Abqaiq — Dammam).",
    tipsAr: ["يحمل كل راكب جواز سفره عند السفر.", "احضر إلى المحطة قبل موعد القطار بوقت كافٍ.", "محطة مكة المكرمة: الدخول إلى مكة للمسلمين فقط."],
    tipsEn: ["Every passenger must carry their passport.", "Arrive at the station well before departure.", "Makkah station: entry to Makkah is for Muslims only."],
    link: { url: "https://www.sar.com.sa", labelAr: "موقع سار", labelEn: "SAR website" },
    trainBooking: true,
  },
  {
    kind: "flight",
    titleAr: "الرحلات الداخلية",
    titleEn: "Domestic flights",
    bodyAr: "تربط الرحلات الداخلية معظم مدن المملكة، وهي الخيار الأسرع للمسافات الطويلة مثل الرياض — العُلا أو جدة — أبها.",
    bodyEn: "Domestic flights connect most cities of the Kingdom and are the fastest option for long distances such as Riyadh — AlUla or Jeddah — Abha.",
  },
  {
    kind: "bus",
    titleAr: "الحافلات بين المدن",
    titleEn: "Intercity buses",
    bodyAr: "تشغّل سابتكو وغيرها من الشركات المرخّصة رحلات حافلات منتظمة بين المدن.",
    bodyEn: "SAPTCO and other licensed operators run scheduled bus services between cities.",
    link: { url: "https://www.saptco.com.sa", labelAr: "موقع سابتكو", labelEn: "SAPTCO website" },
  },
  CAR_RENTAL,
];

/** Getting around each city. */
export const CITY_TRANSPORT: Record<string, ModeInfo[]> = {
  RUH: [
    { kind: "metro", titleAr: "مترو الرياض", titleEn: "Riyadh Metro", bodyAr: "شبكة من ستة خطوط تغطي أهم مناطق المدينة، منها مركز الملك عبدالله المالي وقصر الحكم، ويصل الخط الأصفر إلى مطار الملك خالد الدولي.", bodyEn: "A six-line network covering the main districts, including King Abdullah Financial District and Qasr Al-Hokm; the Yellow Line reaches King Khalid International Airport.", tipsAr: ["تتوفر عربات للعائلات ودرجة أولى.", "ادفع ببطاقة النقل أو التطبيق الرسمي أو البطاقة البنكية عند البوابات حيث يتاح ذلك."], tipsEn: ["Family and first-class carriages are available.", "Pay with the transit card, the official app or a bank card at the gates where available."], link: { url: "https://www.rcrc.gov.sa", labelAr: "الهيئة الملكية لمدينة الرياض", labelEn: "Royal Commission for Riyadh City" } },
    { kind: "bus", titleAr: "حافلات الرياض", titleEn: "Riyadh Bus", bodyAr: "شبكة حافلات حضرية واسعة تكمل خطوط المترو وتربط الأحياء بالمحطات.", bodyEn: "A wide urban bus network that complements the metro and links neighbourhoods to the stations." },
    { kind: "airport", titleAr: "مطار الملك خالد الدولي", titleEn: "King Khalid International Airport", bodyAr: "يقع شمال المدينة، ويرتبط بها بالمترو وسيارات الأجرة الرسمية وتطبيقات النقل ومكاتب تأجير السيارات.", bodyEn: "North of the city, connected by the metro, official taxis, ride-hailing apps and car rental desks." },
    RIDE_APPS,
    CAR_RENTAL,
  ],
  JED: [
    { kind: "train", titleAr: "قطار الحرمين داخل جدة", titleEn: "Haramain train in Jeddah", bodyAr: "في جدة محطتان: السليمانية، ومحطة مطار الملك عبدالعزيز الدولي. القطار يربط جدة بمكة والمدينة.", bodyEn: "Jeddah has two stations: Al-Sulaimaniyah and King Abdulaziz International Airport. The train links Jeddah with Makkah and Madinah.", link: { url: "https://www.hhr.sa", labelAr: "قطار الحرمين", labelEn: "Haramain Railway" }, trainBooking: true },
    { kind: "bus", titleAr: "حافلات جدة", titleEn: "Jeddah buses", bodyAr: "خطوط حافلات عامة تخدم الأحياء الرئيسية والكورنيش وجدة التاريخية.", bodyEn: "Public bus routes serve the main districts, the Corniche and historic Jeddah." },
    { kind: "airport", titleAr: "مطار الملك عبدالعزيز الدولي", titleEn: "King Abdulaziz International Airport", bodyAr: "شمال المدينة، وفيه محطة قطار الحرمين، إضافة إلى سيارات الأجرة وتطبيقات النقل وتأجير السيارات.", bodyEn: "North of the city, with a Haramain train station, taxis, ride-hailing apps and car rental." },
    RIDE_APPS,
    CAR_RENTAL,
  ],
  MED: [
    { kind: "train", titleAr: "قطار الحرمين", titleEn: "Haramain train", bodyAr: "محطة المدينة المنورة تربط المدينة بجدة ومكة.", bodyEn: "Madinah station links the city with Jeddah and Makkah.", trainBooking: true },
    { kind: "bus", titleAr: "حافلات المدينة", titleEn: "Madinah buses", bodyAr: "حافلات منتظمة تربط الأحياء والفنادق بالمسجد النبوي والمعالم.", bodyEn: "Regular buses link districts and hotels with the Prophet's Mosque and landmarks." },
    { kind: "airport", titleAr: "مطار الأمير محمد بن عبدالعزيز الدولي", titleEn: "Prince Mohammad bin Abdulaziz International Airport", bodyAr: "شرق المدينة، وتتوفر منه سيارات الأجرة وتطبيقات النقل وتأجير السيارات.", bodyEn: "East of the city, with taxis, ride-hailing apps and car rental." },
    RIDE_APPS,
  ],
  ULH: [
    { kind: "tour", titleAr: "التنقل في العُلا", titleEn: "Getting around AlUla", bodyAr: "لا توجد شبكة نقل عام تقليدية؛ يتنقل الزوار بالسيارات المستأجرة أو الجولات المنظمة أو حافلات المواقع السياحية المخصصة للزوار.", bodyEn: "There is no conventional public transport network; visitors get around by rental car, organised tours or the visitor shuttles to the heritage sites.", tipsAr: ["احجز جولات المواقع التراثية مسبقًا؛ بعضها لا يُزار إلا بجولة.", "المسافات بين المواقع طويلة — خطط لليوم مسبقًا."], tipsEn: ["Book heritage-site tours in advance; some sites can only be visited on a tour.", "Distances between sites are long — plan the day ahead."] },
    { kind: "airport", titleAr: "مطار العُلا الدولي", titleEn: "AlUla International Airport", bodyAr: "تتوفر فيه مكاتب تأجير السيارات وسيارات الأجرة.", bodyEn: "Car rental desks and taxis are available." },
    CAR_RENTAL,
  ],
  DMM: [
    { kind: "train", titleAr: "قطار الشرق", titleEn: "East Train", bodyAr: "محطة الدمام تربط المنطقة الشرقية بالهفوف والرياض.", bodyEn: "Dammam station links the Eastern Province with Hofuf and Riyadh.", trainBooking: true },
    { kind: "bus", titleAr: "حافلات الدمام والخبر", titleEn: "Dammam & Al Khobar buses", bodyAr: "خطوط حافلات عامة تربط الدمام والخبر والظهران.", bodyEn: "Public bus routes connect Dammam, Al Khobar and Dhahran." },
    { kind: "airport", titleAr: "مطار الملك فهد الدولي", titleEn: "King Fahd International Airport", bodyAr: "يقع شمال غرب الدمام على مسافة بعيدة نسبيًا من وسط المدينة؛ خطط لوقت كافٍ للوصول.", bodyEn: "North-west of Dammam, relatively far from the city centre; allow enough time to get there." },
    RIDE_APPS,
    CAR_RENTAL,
  ],
  HOF: [
    { kind: "train", titleAr: "قطار الشرق", titleEn: "East Train", bodyAr: "محطة الهفوف على خط الرياض — الدمام.", bodyEn: "Hofuf station is on the Riyadh — Dammam line.", trainBooking: true },
    RIDE_APPS,
    CAR_RENTAL,
  ],
  ELQ: [
    { kind: "train", titleAr: "قطار الشمال", titleEn: "North Train", bodyAr: "محطة القصيم على خط الرياض — القريات.", bodyEn: "Qassim station is on the Riyadh — Qurayyat line.", trainBooking: true },
    RIDE_APPS,
    CAR_RENTAL,
  ],
  HAS: [
    { kind: "train", titleAr: "قطار الشمال", titleEn: "North Train", bodyAr: "محطة حائل على خط الرياض — القريات.", bodyEn: "Hail station is on the Riyadh — Qurayyat line.", trainBooking: true },
    RIDE_APPS,
    CAR_RENTAL,
  ],
};

/** Cities without a dedicated section get the common options. */
export const DEFAULT_CITY: ModeInfo[] = [RIDE_APPS, CAR_RENTAL];

export const GENERAL_TIPS: { ar: string; en: string }[] = [
  { ar: "أوقات الذروة في المدن الكبرى صباحًا ومساءً — خطط لتنقلاتك خارجها.", en: "Big cities have morning and evening rush hours — plan trips outside them." },
  { ar: "في الصيف تجنّب المشي الطويل وقت الظهيرة.", en: "In summer, avoid long walks around midday." },
  { ar: "تتغير مواعيد بعض الخدمات في رمضان والأعياد والمواسم.", en: "Some services change their hours during Ramadan, Eid and the seasons." },
  { ar: "المعلومات إرشادية؛ راجع المصادر الرسمية قبل السفر.", en: "This information is a guide; check the official sources before travelling." },
];
