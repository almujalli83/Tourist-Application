/**
 * Umrah guide content (client-safe): the steps with Nusuk, the rites in several languages, the
 * miqat stations and crowd tips. General guidance only; religious questions go to the specialists
 * at the Holy Mosque (the page says so).
 */

export const RITE_LANGS = ["ar", "en", "fr", "ur", "id", "tr"] as const;
export type RiteLang = (typeof RITE_LANGS)[number];
export const RITE_LANG_NAMES: Record<RiteLang, string> = { ar: "العربية", en: "English", fr: "Français", ur: "اردو", id: "Bahasa Indonesia", tr: "Türkçe" };

export const TALBIYAH_AR = "لَبَّيْكَ اللَّهُمَّ لَبَّيْكَ، لَبَّيْكَ لا شَرِيكَ لَكَ لَبَّيْكَ، إِنَّ الحَمْدَ وَالنِّعْمَةَ لَكَ وَالمُلْك، لا شَرِيكَ لَك";
export const TALBIYAH_LATIN = "Labbayka Allāhumma labbayk, labbayka lā sharīka laka labbayk, inna al-ḥamda wan-niʿmata laka wal-mulk, lā sharīka lak";

type Text = Record<RiteLang, string>;
export interface Rite { id: "ihram" | "talbiyah" | "tawaf" | "prayer" | "sai" | "hair"; title: Text; body: Text }

export const RITES: Rite[] = [
  {
    id: "ihram",
    title: { ar: "الإحرام من الميقات", en: "Ihram at the miqat", fr: "L'ihram au miqat", ur: "میقات سے احرام", id: "Ihram dari miqat", tr: "Mîkatta ihrama girmek" },
    body: {
      ar: "اغتسل وتطيّب في بدنك قبل الإحرام، والبس ملابس الإحرام (للرجال إزار ورداء أبيضان، والمرأة تلبس ما شاءت من اللباس الساتر دون نقاب أو قفازين)، ثم انوِ العمرة عند الميقات قائلًا: «لبيك عمرة».",
      en: "Bathe and apply scent to your body before ihram, then put on the ihram clothes (for men two white sheets; women wear any modest clothing without a face veil or gloves). At the miqat make the intention for Umrah, saying “Labbayka ʿumrah”.",
      fr: "Faites vos ablutions complètes et parfumez votre corps avant l'ihram, puis revêtez les habits d'ihram (pour les hommes deux pièces de tissu blanc ; les femmes portent une tenue pudique, sans niqab ni gants). Au miqat, formulez l'intention de la omra en disant « Labbayka ʿumrah ».",
      ur: "احرام سے پہلے غسل کریں اور جسم پر خوشبو لگائیں، پھر احرام کا لباس پہنیں (مردوں کے لیے دو سفید چادریں؛ خواتین ساتر لباس پہنیں، نقاب اور دستانوں کے بغیر)۔ میقات پر عمرے کی نیت کریں اور کہیں: «لبیک عمرۃ»۔",
      id: "Mandi dan pakailah wewangian di badan sebelum ihram, lalu kenakan pakaian ihram (bagi laki-laki dua kain putih; perempuan memakai pakaian yang menutup aurat tanpa cadar dan sarung tangan). Di miqat, niatkan umrah dengan mengucapkan “Labbaika ʿumrah”.",
      tr: "İhramdan önce gusül abdesti alın ve bedeninize koku sürün, sonra ihram elbiselerini giyin (erkekler için iki beyaz örtü; kadınlar peçe ve eldiven olmadan örtünen her kıyafeti giyebilir). Mîkatta umreye niyet edip “Lebbeyke umraten” deyin.",
    },
  },
  {
    id: "talbiyah",
    title: { ar: "التلبية", en: "The Talbiyah", fr: "La talbiya", ur: "تلبیہ", id: "Talbiyah", tr: "Telbiye" },
    body: {
      ar: "أكثِر من التلبية بعد الإحرام حتى تبدأ الطواف (يرفع الرجال أصواتهم بها، وتُسرّ بها المرأة).",
      en: "Repeat the Talbiyah often after entering ihram until you start the tawaf (men aloud, women quietly).",
      fr: "Répétez souvent la talbiya après l'entrée en ihram jusqu'au début du tawaf (les hommes à voix haute, les femmes à voix basse).",
      ur: "احرام کے بعد طواف شروع ہونے تک کثرت سے تلبیہ پڑھیں (مرد بلند آواز سے، خواتین آہستہ)۔",
      id: "Perbanyak talbiyah setelah berihram sampai memulai tawaf (laki-laki dengan suara keras, perempuan dengan pelan).",
      tr: "İhrama girdikten sonra tavafa başlayana kadar telbiyeyi çokça tekrarlayın (erkekler yüksek sesle, kadınlar sessizce).",
    },
  },
  {
    id: "tawaf",
    title: { ar: "الطواف حول الكعبة", en: "Tawaf around the Kaaba", fr: "Le tawaf autour de la Kaaba", ur: "کعبہ کا طواف", id: "Tawaf mengelilingi Ka'bah", tr: "Kâbe'yi tavaf" },
    body: {
      ar: "على طهارة، ابدأ من الحجر الأسود (استلمه أو أشر إليه وكبّر) وطُف سبعة أشواط والكعبة عن يسارك، وينتهي كل شوط عند الحجر الأسود. ادعُ بما تشاء، ويُستحب بين الركن اليماني والحجر: «ربنا آتنا في الدنيا حسنة وفي الآخرة حسنة وقنا عذاب النار».",
      en: "In a state of purity, start at the Black Stone (touch it or point to it saying “Allāhu akbar”) and walk seven circuits with the Kaaba on your left; each circuit ends at the Black Stone. Supplicate freely; between the Yemeni Corner and the Black Stone it is recommended to say “Rabbanā ātinā fid-dunyā ḥasanah…”.",
      fr: "En état de pureté, commencez à la Pierre noire (touchez-la ou faites-lui signe en disant « Allahou akbar ») et faites sept tours, la Kaaba à votre gauche ; chaque tour se termine à la Pierre noire. Invoquez librement ; entre le coin yéménite et la Pierre noire, il est recommandé de dire « Rabbanâ âtinâ fid-dunyâ hasanah… ».",
      ur: "باوضو ہو کر حجرِ اسود سے شروع کریں (اسے چھوئیں یا اشارہ کر کے «اللہ اکبر» کہیں) اور کعبہ کو بائیں جانب رکھ کر سات چکر لگائیں؛ ہر چکر حجرِ اسود پر ختم ہوتا ہے۔ جو چاہیں دعا کریں؛ رکنِ یمانی اور حجرِ اسود کے درمیان «ربنا آتنا فی الدنیا حسنۃ…» پڑھنا مستحب ہے۔",
      id: "Dalam keadaan suci, mulailah dari Hajar Aswad (sentuh atau beri isyarat sambil bertakbir) dan kelilingi Ka'bah tujuh putaran dengan Ka'bah di sebelah kiri; setiap putaran berakhir di Hajar Aswad. Berdoalah sesuai keinginan; di antara Rukun Yamani dan Hajar Aswad dianjurkan membaca “Rabbanā ātinā fid-dunyā ḥasanah…”.",
      tr: "Abdestli olarak Hacerülesved'den başlayın (ona dokunun ya da el ile işaret edip “Allahu ekber” deyin) ve Kâbe solunuzda olacak şekilde yedi şavt tavaf edin; her şavt Hacerülesved'de biter. Dilediğiniz gibi dua edin; Rükn-i Yemânî ile Hacerülesved arasında “Rabbenâ âtinâ fid-dünyâ haseneten…” demek müstehaptır.",
    },
  },
  {
    id: "prayer",
    title: { ar: "ركعتا الطواف وماء زمزم", en: "Two rakʿahs and Zamzam", fr: "Deux rak'ah et l'eau de Zamzam", ur: "دو رکعت نماز اور آبِ زمزم", id: "Shalat dua rakaat dan air Zamzam", tr: "İki rekât namaz ve zemzem" },
    body: {
      ar: "صلِّ ركعتين خلف مقام إبراهيم إن تيسّر، وإلا ففي أي مكان من المسجد، ثم اشرب من ماء زمزم.",
      en: "Pray two rakʿahs behind the Station of Ibrahim if you can, otherwise anywhere in the mosque, then drink Zamzam water.",
      fr: "Priez deux rak'ah derrière la station d'Ibrahim si possible, sinon n'importe où dans la mosquée, puis buvez de l'eau de Zamzam.",
      ur: "ممکن ہو تو مقامِ ابراہیم کے پیچھے دو رکعت نماز پڑھیں، ورنہ مسجد میں کہیں بھی، پھر آبِ زمزم پئیں۔",
      id: "Shalatlah dua rakaat di belakang Maqam Ibrahim bila memungkinkan, jika tidak di mana saja di masjid, lalu minumlah air Zamzam.",
      tr: "Mümkünse Makam-ı İbrahim'in arkasında, değilse mescidin herhangi bir yerinde iki rekât namaz kılın, ardından zemzem için.",
    },
  },
  {
    id: "sai",
    title: { ar: "السعي بين الصفا والمروة", en: "Saʿi between Safa and Marwah", fr: "Le sa'y entre Safa et Marwa", ur: "صفا اور مروہ کے درمیان سعی", id: "Sa'i antara Shafa dan Marwah", tr: "Safa ile Merve arasında sa'y" },
    body: {
      ar: "اصعد الصفا واستقبل الكعبة وادعُ، ثم امشِ إلى المروة فهذا شوط، والعودة إلى الصفا شوط ثانٍ، حتى تكمل سبعة أشواط تنتهي عند المروة. يُسرع الرجال قليلًا بين العلمين الأخضرين.",
      en: "Climb Safa, face the Kaaba and supplicate, then walk to Marwah (one lap); back to Safa is the second lap, until seven laps ending at Marwah. Men walk briskly between the two green markers.",
      fr: "Montez sur Safa, tournez-vous vers la Kaaba et invoquez, puis marchez jusqu'à Marwa (un parcours) ; le retour à Safa est le deuxième, jusqu'à sept parcours se terminant à Marwa. Les hommes pressent le pas entre les deux repères verts.",
      ur: "صفا پر چڑھ کر کعبہ کی طرف رخ کریں اور دعا کریں، پھر مروہ تک چلیں (ایک چکر)؛ صفا واپسی دوسرا چکر ہے، یہاں تک کہ سات چکر مروہ پر مکمل ہوں۔ مرد دو سبز نشانوں کے درمیان تیز چلیں۔",
      id: "Naiklah ke Shafa, menghadap Ka'bah dan berdoa, lalu berjalan ke Marwah (satu putaran); kembali ke Shafa putaran kedua, hingga tujuh putaran yang berakhir di Marwah. Laki-laki berjalan cepat di antara dua tanda hijau.",
      tr: "Safa'ya çıkın, Kâbe'ye yönelip dua edin, sonra Merve'ye yürüyün (bir şavt); Safa'ya dönüş ikinci şavttır; yedi şavt Merve'de tamamlanır. Erkekler iki yeşil işaret arasında hızlı yürür.",
    },
  },
  {
    id: "hair",
    title: { ar: "الحلق أو التقصير", en: "Shaving or shortening the hair", fr: "Se raser ou raccourcir les cheveux", ur: "حلق یا قصر", id: "Tahallul: mencukur atau memendekkan rambut", tr: "Tıraş veya saçları kısaltma" },
    body: {
      ar: "يحلق الرجل رأسه (وهو أفضل) أو يقصّر من جميع شعره، وتقصّ المرأة من أطراف شعرها قدر أنملة. وبذلك تمت عمرتك وتحلّلت من الإحرام.",
      en: "Men shave the head (preferred) or shorten the hair all over; women cut a fingertip's length from the ends. Your Umrah is then complete and ihram ends.",
      fr: "Les hommes se rasent la tête (préférable) ou raccourcissent l'ensemble des cheveux ; les femmes coupent l'équivalent d'un bout de doigt. Votre omra est alors terminée et l'ihram prend fin.",
      ur: "مرد سر منڈوائیں (افضل) یا پورے بال چھوٹے کروائیں؛ خواتین بالوں کے سروں سے انگلی کی پور کے برابر کاٹیں۔ یوں آپ کا عمرہ مکمل ہوا اور احرام ختم۔",
      id: "Laki-laki mencukur habis rambut (lebih utama) atau memendekkan seluruh rambut; perempuan memotong ujung rambut seukuran ruas jari. Dengan itu umrah Anda selesai dan ihram berakhir.",
      tr: "Erkekler başlarını tıraş eder (efdal olan) ya da saçlarının tamamını kısaltır; kadınlar saç uçlarından bir parmak ucu kadar keser. Böylece umreniz tamamlanır ve ihramdan çıkarsınız.",
    },
  },
];

/** Things forbidden in ihram (short list). */
export const IHRAM_DONTS = {
  ar: ["قص الشعر أو الأظافر", "استعمال الطيب بعد الإحرام", "لبس المخيط للرجال وتغطية الرأس", "النقاب والقفازان للمرأة", "الصيد وعقد النكاح والجماع ومقدماته"],
  en: ["Cutting hair or nails", "Using perfume after entering ihram", "Sewn clothes and covering the head (men)", "Face veil and gloves (women)", "Hunting, marriage contracts and marital relations"],
};

/** The miqat stations. `map` opens the place in a map search. */
export const MIQATS = [
  { id: "dhulHulayfah", ar: "ذو الحليفة (أبيار علي)", en: "Dhul-Hulayfah (Abyar Ali)", forAr: "القادمون من المدينة المنورة وما وراءها", forEn: "Travellers coming from Madinah and beyond", q: "Miqat Dhul Hulayfah Abyar Ali mosque" },
  { id: "juhfah", ar: "الجحفة (قرب رابغ)", en: "Al-Juhfah (near Rabigh)", forAr: "القادمون من الشمال الغربي وساحل البحر الأحمر الشمالي (تبوك، ينبع…)", forEn: "Travellers from the north-west and the northern Red Sea coast (Tabuk, Yanbu…)", q: "Miqat Al Juhfah mosque Rabigh" },
  { id: "qarn", ar: "قرن المنازل (السيل الكبير)", en: "Qarn al-Manazil (As-Sail al-Kabir)", forAr: "القادمون من نجد والطائف والرياض والمنطقة الشرقية", forEn: "Travellers from Najd, Taif, Riyadh and the Eastern Province", q: "Miqat Qarn al-Manazil As Sail Al Kabir mosque" },
  { id: "yalamlam", ar: "يلملم (السعدية)", en: "Yalamlam (As-Saʿdiyyah)", forAr: "القادمون من الجنوب واليمن (أبها، جازان…)", forEn: "Travellers from the south and Yemen (Abha, Jazan…)", q: "Miqat Yalamlam mosque As Sadiyah" },
  { id: "dhatIrq", ar: "ذات عرق", en: "Dhat ʿIrq", forAr: "القادمون من جهة العراق", forEn: "Travellers from the direction of Iraq", q: "Miqat Dhat Irq" },
] as const;
export type MiqatId = (typeof MIQATS)[number]["id"];
export const miqatMapUrl = (q: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;

/** Where a traveller comes from on the way to Makkah. */
export const ROUTES = ["air", "jeddah", "madinah", "najd", "south", "north"] as const;
export type Route = (typeof ROUTES)[number];
export const ROUTE_MIQAT: Record<Route, MiqatId | null> = { air: null, jeddah: null, madinah: "dhulHulayfah", najd: "qarn", south: "yalamlam", north: "juhfah" };

