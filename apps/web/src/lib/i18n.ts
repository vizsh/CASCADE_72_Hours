export type Lang = "en" | "hi" | "mr";

export const LANGS: { id: Lang; label: string }[] = [
  { id: "en", label: "English" },
  { id: "hi", label: "हिन्दी" },
  { id: "mr", label: "मराठी" },
];

type Dict = Record<string, Record<Lang, string>>;

export const T: Dict = {
  title: { en: "Your area", hi: "आपका इलाका", mr: "तुमचा परिसर" },
  search: { en: "Search your area", hi: "अपना इलाका खोजें", mr: "तुमचा परिसर शोधा" },
  status: { en: "Right now", hi: "अभी", mr: "आत्ता" },
  next: { en: "What may happen", hi: "क्या हो सकता है", mr: "काय होऊ शकते" },
  todo: { en: "What to do", hi: "क्या करें", mr: "काय करावे" },
  hospital: { en: "Nearest hospital expected to stay open", hi: "सबसे नज़दीकी अस्पताल जो खुला रहने की उम्मीद है", mr: "सर्वात जवळचे रुग्णालय जे सुरू राहण्याची शक्यता आहे" },
  shelter: { en: "Nearest shelter", hi: "सबसे नज़दीकी आश्रय", mr: "सर्वात जवळचा निवारा" },
  report: { en: "Report what you see", hi: "जो दिख रहा है उसकी सूचना दें", mr: "जे दिसते ते कळवा" },
  reportHint: { en: "e.g. water entering houses near the bus stop", hi: "जैसे बस स्टॉप के पास घरों में पानी घुस रहा है", mr: "उदा. बस स्टॉपजवळ घरांत पाणी शिरत आहे" },
  send: { en: "Send report", hi: "सूचना भेजें", mr: "माहिती पाठवा" },
  thanks: { en: "Thank you. Reports are checked against sensors and other reports before they count.", hi: "धन्यवाद। सूचनाएँ गिनी जाने से पहले सेंसर और अन्य सूचनाओं से मिलाई जाती हैं।", mr: "धन्यवाद. माहिती ग्राह्य धरण्यापूर्वी सेन्सर आणि इतर माहितीशी तपासली जाते." },
  changes: { en: "Likely to get worse between", hi: "स्थिति बिगड़ने की संभावना", mr: "परिस्थिती बिघडण्याची शक्यता" },
  noChange: { en: "No worsening expected in the next 72 hours.", hi: "अगले 72 घंटों में बिगड़ने की उम्मीद नहीं।", mr: "पुढील ७२ तासांत बिघडण्याची शक्यता नाही." },
  away: { en: "km away", hi: "किमी दूर", mr: "किमी दूर" },
  replay: { en: "Replay: 22 Sep 2023, 22:00", hi: "रीप्ले: 22 सितंबर 2023, रात 10 बजे", mr: "रिप्ले: २२ सप्टेंबर २०२३, रात्री १०" },
  live: { en: "Live today", hi: "आज लाइव", mr: "आज थेट" },
  official: {
    en: "This service adds detail to official alerts; always follow instructions from the municipal corporation and police.",
    hi: "यह सेवा आधिकारिक चेतावनियों में जानकारी जोड़ती है; हमेशा नगर निगम और पुलिस के निर्देशों का पालन करें।",
    mr: "ही सेवा अधिकृत इशाऱ्यांना माहिती जोडते; नेहमी महानगरपालिका आणि पोलिसांच्या सूचनांचे पालन करा.",
  },
};

export const STATUS: Record<number, Record<Lang, string>> = {
  0: { en: "No unusual risk", hi: "कोई असामान्य खतरा नहीं", mr: "कोणताही असामान्य धोका नाही" },
  1: { en: "Stay alert", hi: "सतर्क रहें", mr: "सतर्क राहा" },
  2: { en: "Get ready", hi: "तैयार रहें", mr: "तयार राहा" },
  3: { en: "Act now", hi: "तुरंत कदम उठाएं", mr: "लगेच पावले उचला" },
};

export const ADVICE: Record<string, Record<Lang, string>> = {
  water: {
    en: "Move vehicles and valuables to higher ground. Avoid underpasses and low roads.",
    hi: "वाहन और कीमती सामान ऊंची जगह पर रखें। अंडरपास और निचली सड़कों से बचें।",
    mr: "वाहने आणि मौल्यवान वस्तू उंच जागी हलवा. अंडरपास आणि सखल रस्ते टाळा.",
  },
  mobility: {
    en: "Roads nearby may close. Leave earlier than usual and avoid underpasses.",
    hi: "आसपास की सड़कें बंद हो सकती हैं। सामान्य से पहले निकलें और अंडरपास से बचें।",
    mr: "जवळचे रस्ते बंद होऊ शकतात. नेहमीपेक्षा लवकर निघा आणि अंडरपास टाळा.",
  },
  power: {
    en: "Charge phones and power banks now. Keep medicines that need refrigeration in a cool box.",
    hi: "फ़ोन और पावर बैंक अभी चार्ज करें। फ्रिज में रखी जाने वाली दवाइयाँ ठंडे डिब्बे में रखें।",
    mr: "फोन आणि पॉवर बँक आत्ताच चार्ज करा. फ्रिजमध्ये ठेवायची औषधे थंड डब्यात ठेवा.",
  },
  telecom: {
    en: "Mobile coverage may drop. Agree a meeting point with family and note emergency numbers on paper.",
    hi: "मोबाइल नेटवर्क जा सकता है। परिवार के साथ मिलने की जगह तय करें और आपातकालीन नंबर कागज़ पर लिख लें।",
    mr: "मोबाइल नेटवर्क जाऊ शकते. कुटुंबासोबत भेटण्याची जागा ठरवा आणि आपत्कालीन क्रमांक कागदावर लिहून ठेवा.",
  },
  ems: {
    en: "Ambulances may take longer. If someone at home needs regular treatment, plan the route to hospital now.",
    hi: "एम्बुलेंस को देर हो सकती है। घर में किसी को नियमित इलाज चाहिए तो अस्पताल जाने का रास्ता अभी तय करें।",
    mr: "रुग्णवाहिकेला उशीर होऊ शकतो. घरातील कोणाला नियमित उपचार लागत असतील तर रुग्णालयाचा मार्ग आत्ताच ठरवा.",
  },
  health: {
    en: "Nearby hospitals may fill up. For non-urgent care, use your local clinic.",
    hi: "आसपास के अस्पताल भर सकते हैं। सामान्य इलाज के लिए स्थानीय क्लिनिक जाएँ।",
    mr: "जवळची रुग्णालये भरू शकतात. साध्या उपचारांसाठी स्थानिक दवाखान्यात जा.",
  },
  heat: {
    en: "Drink water often, stay indoors 12–4 pm, and check on elderly neighbours.",
    hi: "बार-बार पानी पिएं, दोपहर 12 से 4 बजे तक घर के अंदर रहें, बुज़ुर्ग पड़ोसियों का हाल पूछें।",
    mr: "वारंवार पाणी प्या, दुपारी १२ ते ४ घरात राहा, वृद्ध शेजाऱ्यांची चौकशी करा.",
  },
  hazmat: {
    en: "Close windows and stay indoors. If told to leave, move across the wind, not with it.",
    hi: "खिड़कियाँ बंद रखें और घर के अंदर रहें। निकलने को कहा जाए तो हवा की दिशा के आर-पार जाएं।",
    mr: "खिडक्या बंद ठेवा आणि घरात राहा. बाहेर पडायला सांगितल्यास वाऱ्याच्या आडव्या दिशेने जा.",
  },
  crowd: {
    en: "Avoid the ghats and processions if you can, and keep children close.",
    hi: "हो सके तो घाट और जुलूस से दूर रहें, और बच्चों को पास रखें।",
    mr: "शक्य असल्यास घाट आणि मिरवणुकीपासून दूर राहा, आणि मुलांना जवळ ठेवा.",
  },
  none: {
    en: "Nothing to do right now. This page will say so if that changes.",
    hi: "अभी कुछ करने की ज़रूरत नहीं। बदलाव होने पर यह पेज बताएगा।",
    mr: "सध्या काही करण्याची गरज नाही. बदल झाल्यास हे पान सांगेल.",
  },
};

export const KIND_TEXT: Record<string, Record<Lang, string>> = {
  zone_flood: { en: "Flooding in your area", hi: "आपके इलाके में बाढ़", mr: "तुमच्या परिसरात पूर" },
  underpass_flooded: { en: "A nearby underpass closes", hi: "पास का अंडरपास बंद होगा", mr: "जवळचा अंडरपास बंद होईल" },
  substation_down: { en: "Power cut", hi: "बिजली कटौती", mr: "वीज खंडित" },
  tower_dead: { en: "Mobile network drops", hi: "मोबाइल नेटवर्क बंद", mr: "मोबाइल नेटवर्क बंद" },
  zone_ems: { en: "Ambulances delayed", hi: "एम्बुलेंस में देरी", mr: "रुग्णवाहिकेला उशीर" },
  zone_isolated: { en: "Area cut off from ambulances", hi: "इलाका एम्बुलेंस से कट सकता है", mr: "परिसर रुग्णवाहिकेपासून तुटू शकतो" },
  hospital_overload: { en: "Nearby hospital over capacity", hi: "पास का अस्पताल भरा हुआ", mr: "जवळचे रुग्णालय भरलेले" },
  metro_closed: { en: "Metro station closed", hi: "मेट्रो स्टेशन बंद", mr: "मेट्रो स्थानक बंद" },
  water_out: { en: "Water supply interrupted", hi: "पानी की आपूर्ति बंद", mr: "पाणीपुरवठा खंडित" },
};
