/** Frequently asked questions shown before a ticket is opened (client-safe). */
import type { SupportCategory } from "./types";

export interface Faq {
  id: string;
  category: SupportCategory;
  qAr: string;
  qEn: string;
  aAr: string;
  aEn: string;
}

export const FAQS: Faq[] = [
  { id: "visa-time", category: "visa", qAr: "متى تصدر التأشيرة بعد الدفع؟", qEn: "When is the visa issued after payment?", aAr: "تُرسل طلبات التأشيرة لوزارة السياحة فور الدفع، وتصدر عادة خلال دقائق إلى 24 ساعة. تجدها في المحفظة الرقمية وتصلك رسالة عند صدورها.", aEn: "Visa applications are sent to the Ministry of Tourism right after payment and are usually issued within minutes to 24 hours. You'll find them in your digital wallet and get a message when they're issued." },
  { id: "visa-validity", category: "visa", qAr: "كم مدة صلاحية التأشيرة السياحية؟", qEn: "How long is the tourist visa valid?", aAr: "التأشيرة متعددة الدخول وصالحة سنة من تاريخ الإصدار، وتظهر تفاصيلها وتاريخ انتهائها في المحفظة الرقمية، ويصلك تذكير قبل انتهائها.", aEn: "It's a multiple-entry visa valid for one year from issue; its details and expiry date are in your digital wallet, and you get a reminder before it expires." },
  { id: "visa-insurance", category: "visa", qAr: "هل يشمل الحجز التأمين الطبي؟", qEn: "Does the booking include medical insurance?", aAr: "نعم، التأمين الطبي إلزامي ويصدر مع التأشيرة لكل مسافر، ويغطي الحالات الطارئة. وثيقته في المحفظة الرقمية.", aEn: "Yes — medical insurance is mandatory and issued with the visa for each traveller, covering emergencies. The policy is in your digital wallet." },
  { id: "pay-refund", category: "payment", qAr: "متى يصل المبلغ المسترد؟", qEn: "When will I receive a refund?", aAr: "يُعاد المبلغ إلى البطاقة نفسها فور الإلغاء، ويظهر في كشف الحساب خلال 5 إلى 14 يوم عمل حسب البنك.", aEn: "Refunds go back to the same card as soon as the cancellation is made and appear on your statement within 5–14 business days depending on your bank." },
  { id: "pay-cards", category: "payment", qAr: "ما طرق الدفع المتاحة؟", qEn: "Which payment methods are accepted?", aAr: "بطاقات Visa وMastercard وmada. يُعرض المبلغ بعملتك مع الدفع بالريال السعودي.", aEn: "Visa, Mastercard and mada cards. Prices can be shown in your currency; payment is in Saudi riyals." },
  { id: "booking-change", category: "booking", qAr: "كيف أمدد رحلتي أو أقصّرها؟", qEn: "How do I extend or shorten my trip?", aAr: "من «حجوزاتي» افتح الباقة ثم «تعديل الباقة». يتاح التعديل حتى 48 ساعة قبل رحلة العودة، ويُحدَّث لدى وزارة السياحة تلقائيًا.", aEn: "In My bookings, open the package and choose “Update package”. Changes are possible until 48 hours before the return flight and are updated with the Ministry of Tourism automatically." },
  { id: "booking-cancel", category: "booking", qAr: "هل يمكن إلغاء الباقة؟", qEn: "Can I cancel my package?", aAr: "يعتمد الإلغاء على سياسات الطيران والفنادق المختارة، وتظهر المبالغ القابلة للاسترداد في صفحة الحجز قبل التأكيد.", aEn: "Cancellation depends on the policies of the chosen flights and hotels; refundable amounts are shown on the booking page before you confirm." },
  { id: "events-ticket", category: "events", qAr: "أين أجد تذكرة الفعالية؟", qEn: "Where is my event ticket?", aAr: "في «حجوزاتي» ← الفعاليات. افتح التذكرة لعرض رمز الدخول (QR)، ويعمل دون إنترنت بعد فتحه مرة.", aEn: "In My bookings → Events. Open the ticket to show the entry QR code; it works offline once opened." },
  { id: "restaurants-change", category: "restaurants", qAr: "كيف أغيّر موعد حجز المطعم؟", qEn: "How do I change a restaurant booking?", aAr: "من «حجوزاتي» ← المطاعم افتح الحجز واختر «تغيير الموعد» ضمن المهلة المسموحة في سياسة المطعم.", aEn: "In My bookings → Restaurants, open the booking and choose “Change time” within the restaurant's allowed window." },
  { id: "trains-ticket", category: "trains", qAr: "هل أحتاج طباعة تذكرة القطار؟", qEn: "Do I need to print my train ticket?", aAr: "لا، اعرض رمز التذكرة من «حجوزاتي» ← القطار عند البوابة مع جواز سفرك.", aEn: "No — show the ticket code from My bookings → Trains at the gate with your passport." },
  { id: "esim-install", category: "esim", qAr: "كيف أثبّت شريحة eSIM؟", qEn: "How do I install my eSIM?", aAr: "افتح الشريحة من «حجوزاتي» واتبع خطوات التثبيت (رمز QR أو التثبيت المباشر). ثبّتها قبل السفر وفعّلها عند الوصول.", aEn: "Open the eSIM in My bookings and follow the installation steps (QR code or direct install). Install before you travel and turn it on when you land." },
  { id: "account-travellers", category: "account", qAr: "كيف أحفظ بيانات المسافرين معي؟", qEn: "How do I save my fellow travellers?", aAr: "من «حسابي» ← «المسافرون المحفوظون» احفظ بيانات جوازاتهم مرة واحدة واخترهم عند الحجز.", aEn: "In My account → Saved travellers, save their passport details once and pick them when booking." },
];
