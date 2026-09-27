/**
 * Starter audio tours (Arabic and English narration, written by the team; the other languages are
 * translated on request and marked for review). Stops tied to a guide place take its coordinates;
 * the other coordinates are approximate and should be reviewed on site before launch.
 * Makkah and Madinah tours give history and architecture only (no rulings on rites).
 */
import { seedPlaces } from "../guide/seed";
import type { AudioStop, AudioTour, TourMode } from "./types";

type SeedStop = Omit<AudioStop, "id" | "lat" | "lng" | "radiusM" | "scripts" | "placeId"> & {
  id: string;
  /** English name of the guide place (takes its id and coordinates). */
  place?: string;
  lat?: number;
  lng?: number;
  ar: string;
  en: string;
};
type SeedTour = Omit<AudioTour, "stops" | "status" | "updatedAt"> & { stops: SeedStop[] };

const TOURS: SeedTour[] = [
  {
    id: "ruh-diriyah", city: "RUH", mode: "walk", minutes: 75,
    titleAr: "حي الطريف في الدرعية", titleEn: "At-Turaif, Diriyah",
    summaryAr: "جولة مشي بين قصور الطين في عاصمة الدولة السعودية الأولى، الموقع المسجل في التراث العالمي.",
    summaryEn: "A walk among the mud-brick palaces of the first Saudi state's capital, a UNESCO World Heritage site.",
    stops: [
      {
        id: "bujairi", place: "Bujairi Terrace", nameAr: "البجيري والإطلالة على الطريف", nameEn: "Al-Bujairi and the view of At-Turaif",
        ar: "أهلًا بك في الدرعية. من هنا، على الضفة الشرقية لوادي حنيفة، ترى حي الطريف على الضفة المقابلة. تأسست الدرعية في منتصف القرن الخامس عشر الميلادي، وأصبحت في القرن الثامن عشر عاصمة الدولة السعودية الأولى. حي البجيري كان مركزًا للعلم والتعليم، واليوم يضم المطاعم والمقاهي المطلة على الوادي. اعبر الجسر نحو الطريف لتبدأ الجولة.",
        en: "Welcome to Diriyah. From here, on the eastern bank of Wadi Hanifah, you can see At-Turaif across the valley. Diriyah was founded in the mid-fifteenth century and, in the eighteenth century, became the capital of the first Saudi state. Al-Bujairi was a quarter of learning and scholarship; today its terraces of restaurants and cafés look over the valley. Cross the bridge towards At-Turaif to begin the tour.",
      },
      {
        id: "salwa", nameAr: "قصر سلوى", nameEn: "Salwa Palace", lat: 24.7338, lng: 46.5727,
        ar: "أمامك قصر سلوى، أكبر مباني الطريف وأهمها. كان مقر الحكم والإدارة في عهد الدولة السعودية الأولى، وتوسّع عبر أجيال متعاقبة من الأئمة حتى صار مجمّعًا من عدة وحدات متصلة. لاحظ جدران الطين السميكة التي تحفظ البرودة في الصيف، والمثلثات المفرّغة في أعلى الجدران، وهي زخرفة نجدية تسمح بمرور الهواء والضوء. يضم القصر اليوم متحفًا يروي قصة الدولة السعودية الأولى.",
        en: "In front of you is Salwa Palace, the largest and most important building in At-Turaif. It was the seat of government in the first Saudi state, and it grew over successive generations of rulers into a complex of connected units. Notice the thick mud walls that keep the rooms cool in summer, and the triangular openings near the top of the walls: a Najdi motif that lets air and light through. The palace now houses a museum telling the story of the first Saudi state.",
      },
      {
        id: "mosque", nameAr: "جامع الإمام محمد بن سعود", nameEn: "Imam Mohammed bin Saud Mosque", lat: 24.7343, lng: 46.5734,
        ar: "بجوار قصر سلوى يقع جامع الإمام محمد بن سعود، الجامع الكبير للطريف. كان المسجد مكانًا للصلاة وللدروس أيضًا، وكان متصلًا بالقصر بجسر يعبره الإمام. بُني بالطين والحجر وجذوع الأثل، وسقفه محمول على أعمدة متتابعة تعطي المصلّى إيقاعًا هادئًا. يرجى مراعاة آداب المسجد عند الدخول.",
        en: "Next to Salwa Palace stands the Imam Mohammed bin Saud Mosque, the great mosque of At-Turaif. It was a place of prayer and of teaching, and was linked to the palace by a bridge used by the ruler. It was built of mud, stone and tamarisk trunks, and its roof rests on rows of columns that give the prayer hall a calm rhythm. Please observe mosque etiquette if you go inside.",
      },
      {
        id: "bath", nameAr: "الحمّام التاريخي", nameEn: "The Turaif Bath House", lat: 24.7331, lng: 46.5718,
        ar: "هذا المبنى هو حمّام الطريف، ومن المباني النادرة في نجد. كان الماء يُرفع من الآبار ويُسخّن ثم يوزّع عبر قنوات إلى غرف الاستحمام. يعكس الحمّام مستوى العمارة والخدمات في العاصمة آنذاك، ويُظهر كيف طُوّعت مواد بسيطة مثل الطين والحجر لبناء منشأة معقدة.",
        en: "This building is the At-Turaif bath house, one of the rare buildings of its kind in Najd. Water was drawn from wells, heated and carried through channels to the bathing rooms. The bath house shows the level of building and services in the capital at the time, and how simple materials such as mud and stone were used to build a complex facility.",
      },
      {
        id: "saad", nameAr: "قصر سعد بن سعود", nameEn: "Saad bin Saud Palace", lat: 24.7323, lng: 46.5709,
        ar: "قصر سعد بن سعود مثال على القصور السكنية في الطريف. رُمّم ليُظهر تخطيط البيت النجدي: فناء داخلي مفتوح تتوزع حوله الغرف، ومجلس لاستقبال الضيوف، وإسطبلات للخيل، وأبراج للمراقبة. انظر إلى الأبواب الخشبية المزخرفة بالألوان والأشكال الهندسية، فهي من أبرز فنون العمارة النجدية.",
        en: "Saad bin Saud Palace is an example of the residential palaces of At-Turaif. It was restored to show the layout of a Najdi house: an open inner courtyard with rooms around it, a majlis for receiving guests, stables for horses and watchtowers. Look at the wooden doors painted with colours and geometric shapes, one of the finest crafts of Najdi architecture.",
      },
      {
        id: "walls", nameAr: "الأسوار وأبراج المراقبة", nameEn: "The walls and watchtowers", lat: 24.7317, lng: 46.5746,
        ar: "كانت الطريف محاطة بسور تتخلله أبراج للمراقبة والدفاع. في عام 1818 تعرّضت الدرعية لحصار انتهى بتدميرها، وانتقلت العاصمة لاحقًا إلى الرياض. بقيت الأطلال قرنين حتى بدأ ترميمها، وسُجّل حي الطريف في قائمة التراث العالمي لليونسكو عام 2010. بهذا نختم الجولة، ونتمنى لك وقتًا ممتعًا في الدرعية.",
        en: "At-Turaif was surrounded by a wall with towers for watch and defence. In 1818 Diriyah was besieged and destroyed, and the capital later moved to Riyadh. The ruins stood for two centuries until restoration began, and At-Turaif was inscribed on the UNESCO World Heritage List in 2010. This ends the tour; enjoy the rest of your time in Diriyah.",
      },
    ],
  },
  {
    id: "ruh-old-riyadh", city: "RUH", mode: "walk", minutes: 120,
    titleAr: "الرياض القديمة", titleEn: "Old Riyadh",
    summaryAr: "من قصر المصمك وسوق الزل إلى قصر المربع والمتحف الوطني: قصة نشأة الرياض الحديثة.",
    summaryEn: "From Masmak Fortress and Souq Al Zal to Murabba Palace and the National Museum: how modern Riyadh began.",
    stops: [
      {
        id: "masmak", place: "Masmak Fortress", nameAr: "قصر المصمك", nameEn: "Masmak Fortress",
        ar: "هذا قصر المصمك، الحصن الطيني الذي بُني في النصف الثاني من القرن التاسع عشر. في عام 1902 استعاد الملك عبدالعزيز الرياض انطلاقًا من هذا الحصن، فكانت تلك بداية مسيرة توحيد المملكة. لاحظ الأبراج الأربعة والجدران العالية والباب الخشبي الكبير الذي ما زال يحمل أثر رأس رمح. يضم القصر اليوم متحفًا عن تلك المرحلة.",
        en: "This is Masmak Fortress, a mud-brick fort built in the second half of the nineteenth century. In 1902 King Abdulaziz recaptured Riyadh starting from this fort, the beginning of the unification of the Kingdom. Notice the four towers, the high walls and the great wooden gate, which still bears the mark of a spearhead. The fort is now a museum of that period.",
      },
      {
        id: "square", nameAr: "ساحة العدل (الصفاة)", nameEn: "Justice Square (As-Safat)", lat: 24.6307, lng: 46.7126,
        ar: "هذه الساحة الواسعة كانت قلب الرياض القديمة، تُعقد فيها المناسبات العامة ويلتقي فيها الناس. تحيط بها مبانٍ حديثة صُمّمت بروح العمارة النجدية، ضمن مشروع تطوير منطقة قصر الحكم الذي حافظ على طابع وسط المدينة التاريخي.",
        en: "This wide square was the heart of old Riyadh, where public occasions were held and people met. It is surrounded by modern buildings designed in the spirit of Najdi architecture, part of the Qasr Al Hukm development that kept the historic character of the city centre.",
      },
      {
        id: "mosque", place: "Imam Turki bin Abdullah Grand Mosque", nameAr: "جامع الإمام تركي بن عبدالله", nameEn: "Imam Turki bin Abdullah Grand Mosque",
        ar: "الجامع الكبير في الرياض، يحمل اسم الإمام تركي بن عبدالله مؤسس الدولة السعودية الثانية الذي جعل الرياض عاصمة لها. أعيد بناؤه في تسعينيات القرن العشرين بطراز نجدي، ويتصل بقصر الحكم بجسرين، كما كان في الماضي. يتسع لآلاف المصلين، ويرجى مراعاة آداب المسجد.",
        en: "The grand mosque of Riyadh bears the name of Imam Turki bin Abdullah, founder of the second Saudi state, who made Riyadh its capital. It was rebuilt in the 1990s in Najdi style and is linked to Al Hukm Palace by two bridges, as it was in the past. It holds thousands of worshippers; please observe mosque etiquette.",
      },
      {
        id: "zal", place: "Souq Al Zal", nameAr: "سوق الزل", nameEn: "Souq Al Zal",
        ar: "سوق الزل من أقدم أسواق الرياض، عمره أكثر من مئة عام. اسمه من الزل، أي السجاد، وفيه اليوم السجاد والبشوت والعطور والبخور والتحف القديمة. في المساء يزدحم بالمزادات الشعبية. المساومة هنا جزء من التجربة، فلا تتردد في السؤال عن السعر.",
        en: "Souq Al Zal is one of Riyadh's oldest markets, more than a century old. Its name comes from zal, meaning carpets, and today it sells carpets, bishts, perfumes, incense and antiques. In the evening it fills with informal auctions. Bargaining is part of the experience here, so feel free to ask about prices.",
      },
      {
        id: "murabba", place: "King Abdulaziz Historical Center — Murabba Palace", nameAr: "قصر المربع", nameEn: "Murabba Palace",
        ar: "بنى الملك عبدالعزيز قصر المربع في ثلاثينيات القرن العشرين خارج أسوار الرياض القديمة، فكان علامة على توسع المدينة. سُمّي المربع لشكله المربع، وكان مقرًا للسكن والحكم. يضم المركز اليوم القصر وحدائق واسعة ودارة الملك عبدالعزيز، وسيارات الملك التاريخية.",
        en: "King Abdulaziz built Murabba Palace in the 1930s outside the walls of old Riyadh, a sign of the city's growth. It is named Murabba, the square, after its shape, and served as residence and seat of government. Today the centre includes the palace, wide gardens, the King Abdulaziz Foundation and the King's historic cars.",
      },
      {
        id: "museum", place: "National Museum of Saudi Arabia", nameAr: "المتحف الوطني السعودي", nameEn: "National Museum of Saudi Arabia",
        ar: "نختم الجولة بالمتحف الوطني، الذي افتُتح عام 1999. تأخذك قاعاته في رحلة من نشأة الكون وجغرافيا الجزيرة العربية، إلى الممالك العربية القديمة، ثم البعثة النبوية، وصولًا إلى توحيد المملكة. خصص له ساعتين على الأقل. شكرًا لمرافقتنا في هذه الجولة.",
        en: "We end the tour at the National Museum, opened in 1999. Its galleries take you from the origins of the universe and the geography of Arabia, through the ancient Arabian kingdoms and the mission of the Prophet, to the unification of the Kingdom. Allow at least two hours. Thank you for joining this tour.",
      },
    ],
  },
  {
    id: "jed-albalad", city: "JED", mode: "walk", minutes: 90,
    titleAr: "جدة التاريخية (البلد)", titleEn: "Historic Jeddah (Al-Balad)",
    summaryAr: "أزقة البلد وبيوت الحجر المنقبي والرواشين الخشبية، في موقع مسجل في التراث العالمي.",
    summaryEn: "The lanes of Al-Balad, its coral-stone houses and wooden rawashin, a UNESCO World Heritage site.",
    stops: [
      {
        id: "gate", nameAr: "باب مكة", nameEn: "Bab Makkah", lat: 21.4812, lng: 39.1920,
        ar: "نبدأ من باب مكة، أحد أبواب سور جدة القديم، ومنه كانت القوافل تخرج شرقًا نحو مكة المكرمة. منذ أن اتخذها الخليفة عثمان بن عفان ميناءً لمكة، صارت جدة بوابة الحجاج القادمين من البحر. أزيل السور في منتصف القرن العشرين، وبقيت الأبواب شاهدًا على حدود المدينة القديمة.",
        en: "We start at Bab Makkah, one of the gates of Jeddah's old wall; caravans left from here eastwards towards Makkah. Since Caliph Uthman ibn Affan made it the port of Makkah, Jeddah has been the gateway for pilgrims arriving by sea. The wall was removed in the mid-twentieth century, but the gates remain as markers of the old city's limits.",
      },
      {
        id: "alawi", place: "Souq Al Alawi", nameAr: "سوق العلوي", nameEn: "Souq Al Alawi",
        ar: "أنت الآن في سوق العلوي، شريان البلد التجاري الممتد نحو قلب المدينة القديمة. محلاته تبيع التوابل والعطور والأقمشة والحلويات الشعبية. لاحظ كيف تتقارب البيوت العالية فوق الأزقة الضيقة، فتصنع ظلًا وتيارات هواء تخفف حرارة جدة ورطوبتها.",
        en: "You are now in Souq Al Alawi, the commercial artery of Al-Balad running towards the heart of the old city. Its shops sell spices, perfumes, fabrics and traditional sweets. Notice how the tall houses lean close over the narrow lanes, creating shade and breezes that ease Jeddah's heat and humidity.",
      },
      {
        id: "shafei", nameAr: "مسجد الشافعي", nameEn: "Al-Shafi'i Mosque", lat: 21.4836, lng: 39.1889,
        ar: "مسجد الشافعي من أقدم مساجد جدة، في حارة المظلوم. تشير الروايات إلى أن مئذنته تعود إلى قرون مضت، وقد رُمّم المسجد ضمن مشروع إحياء جدة التاريخية. فناؤه المفتوح وأعمدته الحجرية مثال على عمارة المساجد في الحجاز.",
        en: "Al-Shafi'i Mosque, in the Al-Mazloum quarter, is one of Jeddah's oldest mosques. Its minaret is said to date back many centuries, and the mosque was restored as part of the Historic Jeddah revival. Its open courtyard and stone columns are an example of mosque architecture in the Hijaz.",
      },
      {
        id: "matbouli", nameAr: "بيت المتبولي", nameEn: "Matbouli House", lat: 21.4845, lng: 39.1882,
        ar: "بيت المتبولي من البيوت التي تحولت إلى متحف، يعرض أثاث الأسر الجداوية وأدواتها اليومية. بُنيت هذه البيوت من الحجر المنقبي المستخرج من الشعاب المرجانية في البحر الأحمر، ودُعمت بالخشب، وارتفع بعضها إلى خمسة طوابق أو أكثر.",
        en: "Matbouli House is one of the homes turned into a museum, showing the furniture and everyday objects of Jeddah families. These houses were built of manqabi stone, cut from the coral reefs of the Red Sea, reinforced with timber, and some rose to five storeys or more.",
      },
      {
        id: "rawashin", nameAr: "الرواشين", nameEn: "The rawashin", lat: 21.4839, lng: 39.1878,
        ar: "ارفع نظرك إلى الواجهات: هذه النوافذ الخشبية البارزة تسمى الرواشين. كانت تسمح بدخول الهواء والضوء، وتحفظ خصوصية أهل البيت، وتظهر مكانة العائلة من خلال نقوشها. كثير من خشبها جاء عبر البحر من الهند وجنوب شرق آسيا، وهي اليوم رمز جدة التاريخية.",
        en: "Look up at the façades: these projecting wooden windows are called rawashin. They let in air and light, kept the family's privacy, and showed its standing through their carving. Much of the wood came by sea from India and South-East Asia, and today the rawashin are the symbol of Historic Jeddah.",
      },
      {
        id: "nasseef", place: "Nasseef House", nameAr: "بيت نصيف", nameEn: "Nasseef House",
        ar: "نختم عند بيت نصيف، من أشهر بيوت جدة، بُني في أواخر القرن التاسع عشر. أقام فيه الملك عبدالعزيز عند دخوله جدة عام 1925. في داخله درج عريض كانت الجمال تصعده لنقل البضائع إلى الطوابق العليا. سُجّلت جدة التاريخية في قائمة التراث العالمي عام 2014. شكرًا لمرافقتنا.",
        en: "We end at Nasseef House, one of Jeddah's most famous houses, built in the late nineteenth century. King Abdulaziz stayed here when he entered Jeddah in 1925. Inside is a wide staircase that camels could climb to carry goods to the upper floors. Historic Jeddah was inscribed on the World Heritage List in 2014. Thank you for joining us.",
      },
    ],
  },
  {
    id: "ulh-alula", city: "ULH", mode: "drive", minutes: 480,
    titleAr: "العُلا: من دادان إلى الحِجر", titleEn: "AlUla: from Dadan to Hegra",
    summaryAr: "جولة بالسيارة ليوم كامل بين البلدة القديمة والنقوش والمقابر النبطية ومعالم العُلا الحديثة.",
    summaryEn: "A full-day drive through the old town, the inscriptions, the Nabataean tombs and AlUla's modern landmarks.",
    stops: [
      {
        id: "oldtown", place: "AlUla Old Town", nameAr: "البلدة القديمة", nameEn: "AlUla Old Town",
        ar: "نبدأ في البلدة القديمة بالعُلا، التي سكنها الناس منذ القرن الثاني عشر الميلادي تقريبًا وحتى أواخر القرن العشرين. ضمت نحو تسعمئة بيت من الطين والحجر متلاصقة كأنها سور واحد، تتخللها أزقة مسقوفة تحفظ البرودة. يطل عليها حصن موسى بن نصير من أعلى التل.",
        en: "We begin in AlUla Old Town, inhabited from around the twelfth century until the late twentieth. It had about nine hundred mud and stone houses built wall to wall like a single rampart, with covered lanes that kept the air cool. The fort of Musa bin Nusayr looks over it from the hilltop.",
      },
      {
        id: "dadan", place: "Dadan", nameAr: "دادان", nameEn: "Dadan",
        ar: "دادان كانت عاصمة مملكتي دادان ولحيان في الألف الأول قبل الميلاد، وازدهرت بفضل طريق البخور الذي يربط جنوب الجزيرة العربية بالشام ومصر. في الجبل المقابل ترى مقابر منحوتة في الصخر، بعضها تحرسه نقوش الأسود، ولذلك تُعرف بمقابر الأسود.",
        en: "Dadan was the capital of the Dadanite and Lihyanite kingdoms in the first millennium BCE, prospering on the incense road between southern Arabia, the Levant and Egypt. In the cliff opposite you can see tombs carved into the rock, some guarded by carved lions, hence their name, the lion tombs.",
      },
      {
        id: "ikmah", place: "Jabal Ikmah", nameAr: "جبل عكمة", nameEn: "Jabal Ikmah",
        ar: "يُعرف جبل عكمة بالمكتبة المفتوحة، ففي هذا الوادي مئات النقوش باللغات الدادانية واللحيانية وغيرها، تتحدث عن الطقوس والقوانين والحياة اليومية. تعد هذه النقوش مصدرًا مهمًا لفهم تطور الكتابة العربية.",
        en: "Jabal Ikmah is known as the open library: this valley holds hundreds of inscriptions in Dadanitic, Lihyanite and other scripts, about rituals, laws and daily life. They are an important source for understanding how Arabic writing developed.",
      },
      {
        id: "elephant", place: "Elephant Rock", nameAr: "جبل الفيل", nameEn: "Elephant Rock",
        ar: "جبل الفيل تكوين صخري طبيعي من الحجر الرملي يزيد ارتفاعه على خمسين مترًا، نحتته الرياح والمياه عبر ملايين السنين حتى صار على هيئة فيل. أجمل وقت لزيارته عند الغروب، حين تتغير ألوان الصخور وتُضاء الجلسات حوله.",
        en: "Elephant Rock is a natural sandstone formation more than fifty metres high, shaped by wind and water over millions of years into the form of an elephant. The best time to visit is at sunset, when the rock changes colour and the seating around it is lit.",
      },
      {
        id: "hegra", place: "Hegra", nameAr: "الحِجر", nameEn: "Hegra",
        ar: "الحِجر أول موقع سعودي يُسجل في قائمة التراث العالمي، عام 2008. كانت مدينة نبطية جنوبية مهمة، وتضم أكثر من مئة وعشر مقابر ضخمة منحوتة في الصخر بواجهات مزخرفة. أشهرها قصر الفريد، المنحوت في صخرة منفردة ولم يكتمل نحته. الدخول بتذاكر وجولات منظمة.",
        en: "Hegra was the first Saudi site inscribed on the World Heritage List, in 2008. It was an important southern Nabataean city, with more than one hundred and ten monumental tombs carved into the rock with decorated façades. The best known is Qasr al-Farid, carved into a single rock and never finished. Entry is by ticket and guided visit.",
      },
      {
        id: "maraya", place: "Maraya", nameAr: "مرايا", nameEn: "Maraya",
        ar: "نختم عند مرايا، أكبر مبنى مغطى بالمرايا في العالم، وهي قاعة للحفلات والفعاليات. تعكس جدرانها الوادي والجبال فتكاد تختفي في المشهد. هكذا تلتقي في العُلا آلاف السنين من التاريخ بالعمارة المعاصرة. شكرًا لمرافقتنا.",
        en: "We end at Maraya, the world's largest mirror-clad building, a concert and events hall. Its walls reflect the valley and mountains so that it almost disappears into the landscape. In AlUla, thousands of years of history meet contemporary architecture. Thank you for joining us.",
      },
    ],
  },
  {
    id: "mkx-history", city: "MKX", mode: "drive", minutes: 300,
    titleAr: "معالم مكة المكرمة التاريخية", titleEn: "Historic landmarks of Makkah",
    summaryAr: "جولة تاريخية بالسيارة: جبل النور وغار حراء، جبل ثور، مجمّع كسوة الكعبة، ومتحف ساعة مكة.",
    summaryEn: "A historical drive: Jabal al-Nour and the Cave of Hira, Jabal Thawr, the Kaaba Kiswa complex and the Clock Tower museum.",
    stops: [
      {
        id: "haram", nameAr: "المسجد الحرام: لمحة تاريخية", nameEn: "The Grand Mosque: a short history", lat: 21.4225, lng: 39.8262,
        ar: "المسجد الحرام أقدس بقاع الأرض عند المسلمين، وفي وسطه الكعبة المشرفة. توسّع المسجد عبر العصور من ساحة صغيرة حول الكعبة إلى أكبر مسجد في العالم، وشهد توسعات كبرى في العهد السعودي زادت طاقته إلى ملايين المصلين. هذه الجولة تاريخية فقط؛ ولأحكام العمرة ارجع إلى دليل العمرة في المنصة.",
        en: "The Grand Mosque is the holiest place on earth for Muslims, with the Holy Kaaba at its centre. Over the centuries it grew from a small area around the Kaaba into the largest mosque in the world, with major expansions in the Saudi era raising its capacity to millions of worshippers. This tour covers history only; for the rites of Umrah, see the Umrah guide on the platform.",
      },
      {
        id: "clock", nameAr: "متحف ساعة مكة", nameEn: "Makkah Clock Tower Museum", lat: 21.4189, lng: 39.8256,
        ar: "برج الساعة من أعلى مباني العالم، بارتفاع يقارب ستمئة متر، وساعته من أكبر الساعات في العالم. في أعلاه متحف للفلك يشرح كيف رصد المسلمون السماء لتحديد أوقات الصلاة والأهلّة، مع إطلالة على المسجد الحرام.",
        en: "The Clock Tower is one of the world's tallest buildings, about six hundred metres high, and its clock is among the largest in the world. Near the top is an astronomy museum explaining how Muslims observed the sky to set prayer times and the new moons, with a view over the Grand Mosque.",
      },
      {
        id: "hira", nameAr: "جبل النور وغار حراء", nameEn: "Jabal al-Nour and the Cave of Hira", lat: 21.4575, lng: 39.8611,
        ar: "على قمة جبل النور يقع غار حراء، حيث كان النبي محمد صلى الله عليه وسلم يتعبد، وفيه نزل أول الوحي. الصعود شاق ويستغرق نحو ساعة، فالأفضل في الصباح الباكر مع الماء وحذاء مناسب. عند سفح الجبل يقع حي حراء الثقافي، وفيه معرض عن نزول الوحي.",
        en: "At the top of Jabal al-Nour is the Cave of Hira, where the Prophet Muhammad, peace be upon him, used to worship and where the first revelation came. The climb is steep and takes about an hour, so go early in the morning with water and good shoes. At the foot of the mountain is the Hira Cultural District, with an exhibition on the revelation.",
      },
      {
        id: "thawr", nameAr: "جبل ثور", nameEn: "Jabal Thawr", lat: 21.3775, lng: 39.8497,
        ar: "في جبل ثور، جنوب مكة، الغار الذي أوى إليه النبي صلى الله عليه وسلم وصاحبه أبو بكر الصديق ثلاث ليالٍ في بداية الهجرة إلى المدينة، قبل أن يواصلا الرحلة. الجبل أعلى وأصعب من جبل النور، فلا يُنصح بصعوده في الحر.",
        en: "Jabal Thawr, south of Makkah, holds the cave where the Prophet, peace be upon him, and his companion Abu Bakr sheltered for three nights at the start of the migration to Madinah, before continuing their journey. The mountain is higher and harder than Jabal al-Nour; do not climb it in the heat.",
      },
      {
        id: "kiswa", nameAr: "مجمّع الملك عبدالعزيز لكسوة الكعبة", nameEn: "King Abdulaziz Complex for the Kaaba Kiswa", lat: 21.4418, lng: 39.7747,
        ar: "في حي أم الجود يُصنع ثوب الكعبة المشرفة، أي الكسوة، كل عام. تُنسج من الحرير المصبوغ بالأسود، وتُطرّز آياتها بخيوط مطلية بالذهب والفضة بأيدي حرفيين مهرة، وتُستبدل سنويًا. في المجمّع ومعرض عمارة الحرمين المجاور ترى مراحل الصناعة وقطعًا تاريخية.",
        en: "In the Umm al-Joud district, the covering of the Holy Kaaba, the Kiswa, is made every year. It is woven from silk dyed black, and its verses are embroidered with gold- and silver-plated thread by skilled craftsmen; it is replaced every year. At the complex and the nearby Exhibition of the Two Holy Mosques Architecture you can see the stages of the work and historic pieces.",
      },
    ],
  },
  {
    id: "med-history", city: "MED", mode: "drive", minutes: 240,
    titleAr: "معالم المدينة المنورة التاريخية", titleEn: "Historic landmarks of Madinah",
    summaryAr: "جولة تاريخية بالسيارة: المسجد النبوي، قباء، القبلتين، أحد، المساجد السبعة، ومحطة سكة حديد الحجاز.",
    summaryEn: "A historical drive: the Prophet's Mosque, Quba, Al-Qiblatain, Uhud, the Seven Mosques and the Hejaz Railway station.",
    stops: [
      {
        id: "nabawi", place: "The Prophet's Mosque", nameAr: "المسجد النبوي", nameEn: "The Prophet's Mosque",
        ar: "بنى النبي صلى الله عليه وسلم هذا المسجد عند وصوله إلى المدينة في السنة الأولى للهجرة، وكان في بدايته من جذوع النخل واللبن. توسّع عبر العصور حتى صار من أكبر مساجد العالم، وتحت القبة الخضراء الحجرة النبوية. مظلاته الضخمة في الساحات تُفتح وتُغلق لتظلل المصلين.",
        en: "The Prophet, peace be upon him, built this mosque when he arrived in Madinah in the first year of the Hijra; at first it was made of palm trunks and mud bricks. It grew over the centuries into one of the world's largest mosques, and beneath the Green Dome is the Prophet's chamber. The giant umbrellas in the courtyards open and close to shade worshippers.",
      },
      {
        id: "quba", place: "Quba Mosque", nameAr: "مسجد قباء", nameEn: "Quba Mosque",
        ar: "مسجد قباء أول مسجد بُني في الإسلام، أسسه النبي صلى الله عليه وسلم عند وصوله إلى قباء في طريق الهجرة، قبل دخوله المدينة. أعيد بناؤه وتوسيعه عدة مرات، ويصل إليه اليوم ممشى قباء من جهة المسجد النبوي.",
        en: "Quba Mosque was the first mosque built in Islam, founded by the Prophet, peace be upon him, when he reached Quba on the migration, before entering Madinah. It has been rebuilt and enlarged several times, and today the Quba Walkway links it with the Prophet's Mosque.",
      },
      {
        id: "qiblatain", place: "Masjid Al-Qiblatain", nameAr: "مسجد القبلتين", nameEn: "Masjid Al-Qiblatain",
        ar: "في هذا المسجد، في السنة الثانية للهجرة، نزل الأمر بتحويل القبلة من بيت المقدس إلى الكعبة المشرفة أثناء الصلاة، ولذلك سُمي مسجد القبلتين. أعيد بناؤه في العهد السعودي بطراز يجمع بين البساطة والعمارة الإسلامية التقليدية.",
        en: "In this mosque, in the second year of the Hijra, the direction of prayer was changed from Jerusalem to the Kaaba during a prayer, which is why it is called the Mosque of the Two Qiblas. It was rebuilt in the Saudi era in a style combining simplicity with traditional Islamic architecture.",
      },
      {
        id: "khandaq", place: "The Seven Mosques", nameAr: "المساجد السبعة", nameEn: "The Seven Mosques",
        ar: "في هذا الموقع حُفر الخندق في السنة الخامسة للهجرة للدفاع عن المدينة، في الغزوة المعروفة بالخندق أو الأحزاب. بُنيت هنا مساجد صغيرة في مواقع مرتبطة بالغزوة، وأقيم بجوارها مسجد أكبر هو مسجد الخندق.",
        en: "At this site, a trench was dug in the fifth year of the Hijra to defend Madinah, in the battle known as the Trench, or the Confederates. Small mosques were built here at places linked to the battle, and a larger mosque, the Trench Mosque, now stands beside them.",
      },
      {
        id: "uhud", place: "Mount Uhud", nameAr: "جبل أحد", nameEn: "Mount Uhud",
        ar: "عند جبل أحد وقعت غزوة أحد في السنة الثالثة للهجرة. أمامك جبل الرماة، الذي وقف عليه الرماة في المعركة، ومقبرة شهداء أحد وفيهم حمزة بن عبدالمطلب عم النبي صلى الله عليه وسلم. يمتد الجبل نحو سبعة كيلومترات بلونه الأحمر المميز.",
        en: "The Battle of Uhud took place by this mountain in the third year of the Hijra. In front of you is the Archers' Hill, where the archers stood during the battle, and the cemetery of the martyrs of Uhud, among them Hamza ibn Abd al-Muttalib, the Prophet's uncle. The mountain stretches about seven kilometres with its distinctive red colour.",
      },
      {
        id: "railway", place: "Hejaz Railway Museum", nameAr: "محطة سكة حديد الحجاز", nameEn: "Hejaz Railway Station",
        ar: "نختم عند محطة سكة حديد الحجاز، التي افتُتحت عام 1908 لتربط دمشق بالمدينة المنورة وتختصر رحلة الحجاج من أسابيع إلى أيام. توقف الخط بعد سنوات قليلة خلال الحرب العالمية الأولى، وتحولت المحطة إلى متحف يعرض القاطرات وتاريخ الخط. شكرًا لمرافقتنا.",
        en: "We end at the Hejaz Railway station, opened in 1908 to link Damascus with Madinah and cut the pilgrims' journey from weeks to days. The line stopped a few years later during the First World War, and the station is now a museum of its locomotives and history. Thank you for joining us.",
      },
    ],
  },
];

const RADIUS: Record<TourMode, number> = { walk: 60, drive: 400 };

export function seedTours(now = new Date().toISOString()): AudioTour[] {
  const places = seedPlaces(now);
  return TOURS.map((t) => ({
    ...t,
    status: "published" as const,
    updatedAt: now,
    stops: t.stops.map(({ place, ar, en, lat, lng, ...s }) => {
      const p = place ? places.find((x) => x.city === t.city && x.nameEn === place) : undefined;
      if (place && !p) throw new Error(`audio seed: unknown place ${place}`);
      return {
        ...s,
        ...(p ? { placeId: p.id } : {}),
        lat: p?.lat ?? lat!,
        lng: p?.lng ?? lng!,
        radiusM: RADIUS[t.mode],
        scripts: { ar, en },
      };
    }),
  }));
}
