import type { PrivacyPolicyResponse } from "./types";

/** Sandbox copy of the getPrivacyPolicy response (§7.8.2). Live mode fetches it from MT. */
export const SANDBOX_PRIVACY_POLICY: PrivacyPolicyResponse = {
  correlationId: "sandbox",
  privacyPolicyAr: [
    {
      policyId: "1",
      policyDetails:
        "ما هو محتوى هذه السياسة؟\nتوضّح هذه السياسة كيف ستستخدم وزارة السياحة (المشار إليها بـ «الوزارة» أو «نحن») بياناتك الشخصية عند التفاعل معنا. وباستخدام أو الاستفادة من خدمات أو مواقع الوزارة بشكل مباشر أو غير مباشر فإنك توافق على سياسات الخصوصية الخاصة بها وعلى الأسس النظامية ذات العلاقة. وتنطبق هذه السياسة وسياسات الخصوصية لوزارة السياحة على الجميع.",
    },
    {
      policyId: "2",
      policyDetails:
        "ما هي المعلومات التي نجمعها؟\nيتم جمع ومعالجة البيانات الشخصية عند التفاعل مع منصاتنا أو التفاعل معنا بشكل مباشر أو غير مباشر، بما في ذلك على سبيل المثال لا الحصر: المعلومات المتعلقة بملف التعريف الشخصي، الاسم الكامل، الهوية الوطنية، الصورة الشخصية، بيانات الجواز، البيانات الديموغرافية، معلومات التواصل، بيانات العائلة والتابعين. إذا لم نتمكن من جمع البيانات الشخصية المطلوبة، فلن نتمكن من تقديم خدماتنا.",
    },
  ],
  acknowledgementAr: [
    {
      acknowledgmentId: "1",
      acknowledgmentDetails:
        "أقر بأن جميع المعلومات التي قدمتها صحيحة وموثوقة، كما أتعهد بالامتثال للقوانين والقواعد التي تفرضها المملكة العربية السعودية، وأحترم العادات والتقاليد الإسلامية لشعبها أثناء فترة إقامتي. وأقر أيضًا بأنني أتفهم أن السلطات المختصة في المملكة العربية السعودية لها الحق في أن ترفض دخولي للمملكة وأن تعيدني ثانية إلى حيث جئت إن لم أمتثل للقواعد والقوانين، أو إذا ثبت عدم صحة المعلومات التي تلقيت تأشيرتي بناءً عليها.",
    },
    {
      acknowledgmentId: "2",
      acknowledgmentDetails:
        "أدرك تمامًا أن جميع المواد المسكرة أو المخدرة، وأي مواد أو منشورات مخلة بالآداب العامة، وكذلك المنشورات المتعلقة بأي معتقدات دينية أو ميول سياسية من شأنها أن تتعارض مع تعاليم الإسلام محظورة تمامًا داخل المملكة.",
    },
  ],
  disclaimerAr:
    "أقرّ بأنني اطلعت على جميع الإقرارات وسياسة الخصوصية وأوافق على ما ورد فيها، وأؤكد صحة البيانات المقدمة، وأقر بأن لدي الصلاحية النظامية لتقديم هذه الموافقة، بما في ذلك الموافقة للأشخاص ذوي العلاقة.",
  privacyPolicyEn: [
    {
      policyId: "1",
      policyDetails:
        "What does this policy cover?\nThis policy describes how the Ministry of Tourism (referred to as “we,” “us,” or “the Ministry”) will make use of your data when you interact with us. By using the Ministry’s services, you agree to this policy. The consent to collect, process and share personal data of children and individuals who lack legal capacity should be granted by a guardian.",
    },
    {
      policyId: "2",
      policyDetails:
        "What information do we collect?\nPersonal data is collected and processed when interacting with our platforms, including but not limited to: profile-related information, full name, national ID, personal photo, passport details, demographic data, contact information, and family and dependents’ data. If we are unable to collect the required personal data, we may not be able to provide our services.",
    },
  ],
  acknowledgementEn: [
    {
      acknowledgmentId: "1",
      acknowledgmentDetails:
        "I acknowledge that all the information I provided are true and reliable. In addition, I pledge to abide to the laws and rules of the Kingdom of Saudi Arabia and respect the customs and Islamic traditions of its people during my stay. I acknowledge that the specialized authorities in the Kingdom of Saudi Arabia have the right to deny my entry and can send me back to where I came from if I did not comply with the rules and laws, or if the information under which I received my visa are proven to be incorrect.",
    },
    {
      acknowledgmentId: "2",
      acknowledgmentDetails:
        "I am fully aware that all intoxicating substances, narcotic drugs, indecent materials and publications, as well as publications related to any religious beliefs or political tendencies that contradict with Islam are prohibited in the Kingdom of Saudi Arabia.",
    },
  ],
  disclaimerEn:
    "I hereby acknowledge that I have read and agree to all declarations and the Privacy Policy, confirm the accuracy of the information provided, and declare that I have the legal authority to provide this consent, including on behalf of all related individuals.",
};
