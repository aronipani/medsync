// Spoken announcements in the family's languages. Pure (no React Native) so it can be tested.
// Medicine names are spoken as printed; everything around them is in the chosen language.

export type LangCode = 'en' | 'hi' | 'bn' | 'pa' | 'te' | 'gu' | 'ta' | 'kn' | 'as' | 'zh' | 'es' | 'fil' | 'ja';

export type PhraseKey = 'correct' | 'take' | 'wrong' | 'notNow' | 'taken' | 'otherStrength' | 'checkStrength' | 'checkName' | 'substitute' | 'expired' | 'time' | 'unread';


type UnitKey = 'tablet' | 'capsule' | 'ml' | 'drops' | 'puff' | 'sachet' | 'injection';

interface Lang {
  label: string; // shown in settings, in its own script
  english: string;
  tts: string[]; // voice languages to try, best first
  phrases: Record<PhraseKey, string>;
  amount: (qty: number, unit: UnitKey) => string;
}

const num = (q: number) => (Number.isInteger(q) ? String(q) : String(q));

/** Shared helper for languages that say "<half-word> <unit>" / "<n> <unit>". */
function simpleAmount(words: { half: string; quarter: string; oneHalf: string }, units: Record<UnitKey, string>, plural?: Partial<Record<UnitKey, string>>) {
  return (qty: number, unit: UnitKey) => {
    const u = units[unit] ?? unit;
    if (unit === 'ml' || unit === 'drops') return `${num(qty)} ${qty > 1 && plural?.[unit] ? plural[unit] : u}`;
    if (qty === 0.5) return `${words.half} ${u}`;
    if (qty === 0.25) return `${words.quarter} ${u}`;
    if (qty === 1.5) return `${words.oneHalf} ${u}`;
    return `${num(qty)} ${qty > 1 && plural?.[unit] ? plural[unit] : u}`;
  };
}

export const LANGS: Record<LangCode, Lang> = {
  en: {
    label: 'English',
    english: 'English',
    tts: ['en-IN', 'en-GB', 'en-US'],
    phrases: {
      correct: 'Matches your list: {name}.', // never "correct": the app can't be sure (store guideline 1.4.1)
      take: 'Take {amount} now.',
      wrong: 'Wrong medicine. Do not take this one.',
      notNow: 'This medicine is not due now.',
      taken: 'This dose has already been taken.',
      otherStrength: 'Wrong strength on this strip. Do not take it. Please ask the pharmacist.',
      checkStrength: 'The name matches. Check that the strip says {strength}.',
      checkName: 'Only part of the name could be read. Check that the strip says {name}.',
      unread: "The name couldn't be read clearly. Please scan the strip again.",
      substitute: 'Same medicine, different brand. Please check before taking.',
      expired: 'This strip has expired. Do not take it — use another strip.',
      time: 'It is time for your medicine.',
    },
    amount: (q, u) => {
      const units: Record<UnitKey, [string, string]> = {
        tablet: ['tablet', 'tablets'], capsule: ['capsule', 'capsules'], ml: ['millilitre', 'millilitres'], drops: ['drop', 'drops'],
        puff: ['puff', 'puffs'], sachet: ['sachet', 'sachets'], injection: ['injection', 'injections'],
      };
      const [one, many] = units[u];
      if (u !== 'ml' && u !== 'drops') {
        if (q === 0.5) return `half a ${one}`;
        if (q === 0.25) return `a quarter ${one}`;
        if (q === 1.5) return `one and a half ${many}`;
      }
      return `${num(q)} ${q === 1 ? one : many}`;
    },
  },
  hi: {
    label: 'हिन्दी',
    english: 'Hindi',
    tts: ['hi-IN'],
    phrases: {
      correct: 'आपकी सूची की दवा: {name}।',
      take: 'अभी {amount} लीजिए।',
      wrong: 'यह गलत दवा है। इसे मत लीजिए।',
      notNow: 'यह दवा अभी लेने की नहीं है।',
      taken: 'यह खुराक पहले ही ली जा चुकी है।',
      otherStrength: 'ताकत अलग है। इसे मत लीजिए। डॉक्टर या फार्मासिस्ट से पूछिए।',
      checkStrength: 'नाम सही है। जाँच लीजिए कि पत्ते पर {strength} लिखा है।',
      checkName: 'नाम पूरा नहीं पढ़ा गया। जाँच लीजिए कि पत्ते पर {name} लिखा है।',
      unread: 'नाम साफ़ नहीं पढ़ा गया। पत्ते को फिर से स्कैन कीजिए।',
      substitute: 'यही दवा है, पर कंपनी अलग है। लेने से पहले जाँच लीजिए।',
      expired: 'इस पत्ते की तारीख निकल चुकी है। इसे न लें — दूसरा पत्ता लीजिए।',
      time: 'दवा लेने का समय हो गया है।',
    },
    amount: simpleAmount({ half: 'आधी', quarter: 'चौथाई', oneHalf: 'डेढ़' }, {
      tablet: 'गोली', capsule: 'कैप्सूल', ml: 'मिलीलीटर', drops: 'बूँद', puff: 'पफ', sachet: 'पाउच', injection: 'इंजेक्शन',
    }, { drops: 'बूँदें' }),
  },
  bn: {
    label: 'বাংলা',
    english: 'Bengali',
    tts: ['bn-IN', 'bn-BD'],
    phrases: {
      correct: 'আপনার তালিকার ওষুধ: {name}।',
      take: 'এখন {amount} নিন।',
      wrong: 'এটা ভুল ওষুধ। এটা খাবেন না।',
      notNow: 'এই ওষুধ এখন খাওয়ার সময় নয়।',
      taken: 'এই ডোজ আগেই নেওয়া হয়ে গেছে।',
      otherStrength: 'মাত্রা আলাদা। এটা খাবেন না। ডাক্তার বা ফার্মাসিস্টকে জিজ্ঞেস করুন।',
      checkStrength: 'নাম মিলেছে। পাতায় {strength} লেখা আছে কিনা দেখে নিন।',
      checkName: 'নাম পুরো পড়া যায়নি। পাতায় {name} লেখা আছে কিনা দেখে নিন।',
      unread: 'নামটা পরিষ্কার পড়া যায়নি। পাতাটা আবার স্ক্যান করুন।',
      substitute: 'একই ওষুধ, অন্য কোম্পানির। খাওয়ার আগে দেখে নিন।',
      expired: 'এই স্ট্রিপের মেয়াদ শেষ হয়ে গেছে। এটা খাবেন না — অন্য স্ট্রিপ নিন।',
      time: 'ওষুধ খাওয়ার সময় হয়েছে।',
    },
    amount: simpleAmount({ half: 'আধখানা', quarter: 'সিকি', oneHalf: 'দেড়টা' }, {
      tablet: 'ট্যাবলেট', capsule: 'ক্যাপসুল', ml: 'মিলিলিটার', drops: 'ফোঁটা', puff: 'পাফ', sachet: 'স্যাশে', injection: 'ইনজেকশন',
    }),
  },
  pa: {
    label: 'ਪੰਜਾਬੀ',
    english: 'Punjabi',
    tts: ['pa-IN', 'pa-Guru-IN'],
    phrases: {
      correct: 'ਤੁਹਾਡੀ ਸੂਚੀ ਦੀ ਦਵਾਈ: {name}।',
      take: 'ਹੁਣ {amount} ਲਓ।',
      wrong: 'ਇਹ ਗਲਤ ਦਵਾਈ ਹੈ। ਇਸਨੂੰ ਨਾ ਲਓ।',
      notNow: 'ਇਹ ਦਵਾਈ ਹੁਣ ਲੈਣ ਵਾਲੀ ਨਹੀਂ ਹੈ।',
      taken: 'ਇਹ ਖੁਰਾਕ ਪਹਿਲਾਂ ਹੀ ਲੈ ਲਈ ਗਈ ਹੈ।',
      otherStrength: 'ਤਾਕਤ ਵੱਖਰੀ ਹੈ। ਇਸਨੂੰ ਨਾ ਲਓ। ਡਾਕਟਰ ਜਾਂ ਫਾਰਮਾਸਿਸਟ ਤੋਂ ਪੁੱਛੋ।',
      checkStrength: 'ਨਾਮ ਸਹੀ ਹੈ। ਜਾਂਚ ਕਰੋ ਕਿ ਪੱਤੇ ਉੱਤੇ {strength} ਲਿਖਿਆ ਹੈ।',
      checkName: 'ਨਾਮ ਪੂਰਾ ਨਹੀਂ ਪੜ੍ਹਿਆ ਗਿਆ। ਜਾਂਚ ਕਰੋ ਕਿ ਪੱਤੇ ਉੱਤੇ {name} ਲਿਖਿਆ ਹੈ।',
      unread: 'ਨਾਮ ਸਾਫ਼ ਨਹੀਂ ਪੜ੍ਹਿਆ ਗਿਆ। ਪੱਤੇ ਨੂੰ ਫਿਰ ਤੋਂ ਸਕੈਨ ਕਰੋ।',
      substitute: 'ਇਹੀ ਦਵਾਈ ਹੈ, ਪਰ ਕੰਪਨੀ ਵੱਖਰੀ ਹੈ। ਲੈਣ ਤੋਂ ਪਹਿਲਾਂ ਜਾਂਚ ਕਰੋ।',
      expired: 'ਇਸ ਪੱਤੇ ਦੀ ਮਿਆਦ ਖਤਮ ਹੋ ਗਈ ਹੈ। ਇਹ ਨਾ ਲਓ — ਦੂਜਾ ਪੱਤਾ ਲਓ।',
      time: 'ਦਵਾਈ ਲੈਣ ਦਾ ਸਮਾਂ ਹੋ ਗਿਆ ਹੈ।',
    },
    amount: simpleAmount({ half: 'ਅੱਧੀ', quarter: 'ਚੌਥਾਈ', oneHalf: 'ਡੇਢ' }, {
      tablet: 'ਗੋਲੀ', capsule: 'ਕੈਪਸੂਲ', ml: 'ਮਿਲੀਲੀਟਰ', drops: 'ਬੂੰਦਾਂ', puff: 'ਪਫ਼', sachet: 'ਪਾਊਚ', injection: 'ਟੀਕਾ',
    }),
  },
  te: {
    label: 'తెలుగు',
    english: 'Telugu',
    tts: ['te-IN'],
    phrases: {
      correct: 'మీ జాబితాలోని మందు: {name}.',
      take: 'ఇప్పుడు {amount} తీసుకోండి.',
      wrong: 'ఇది తప్పు మందు. దీన్ని తీసుకోకండి.',
      notNow: 'ఈ మందు ఇప్పుడు తీసుకోవలసినది కాదు.',
      taken: 'ఈ మోతాదు ఇప్పటికే తీసుకున్నారు.',
      otherStrength: 'బలం వేరుగా ఉంది. దీన్ని తీసుకోకండి. డాక్టర్‌ను లేదా ఫార్మసిస్ట్‌ను అడగండి.',
      checkStrength: 'పేరు సరిపోయింది. స్ట్రిప్ మీద {strength} ఉందో లేదో చూడండి.',
      checkName: 'పేరు పూర్తిగా చదవలేకపోయాం. స్ట్రిప్ మీద {name} ఉందో లేదో చూడండి.',
      unread: 'పేరు స్పష్టంగా చదవలేకపోయాం. స్ట్రిప్‌ను మళ్ళీ స్కాన్ చేయండి.',
      substitute: 'ఇదే మందు, వేరే కంపెనీది. తీసుకునే ముందు చూసుకోండి.',
      expired: 'ఈ స్ట్రిప్ గడువు ముగిసింది. దీన్ని తీసుకోకండి — వేరే స్ట్రిప్ వాడండి.',
      time: 'మందు వేసుకునే సమయం అయింది.',
    },
    amount: simpleAmount({ half: 'సగం', quarter: 'పావు', oneHalf: 'ఒకటిన్నర' }, {
      tablet: 'మాత్ర', capsule: 'క్యాప్సూల్', ml: 'మిల్లీలీటర్లు', drops: 'చుక్కలు', puff: 'పఫ్', sachet: 'సాచెట్', injection: 'ఇంజెక్షన్',
    }, { tablet: 'మాత్రలు', capsule: 'క్యాప్సూల్స్' }),
  },
  gu: {
    label: 'ગુજરાતી',
    english: 'Gujarati',
    tts: ['gu-IN'],
    phrases: {
      correct: 'તમારી યાદીની દવા: {name}.',
      take: 'હમણાં {amount} લો.',
      wrong: 'આ ખોટી દવા છે. આ ન લો.',
      notNow: 'આ દવા અત્યારે લેવાની નથી.',
      taken: 'આ ડોઝ પહેલેથી લેવાઈ ગયો છે.',
      otherStrength: 'તાકાત અલગ છે. આ ન લો. ડૉક્ટર અથવા ફાર્માસિસ્ટને પૂછો.',
      checkStrength: 'નામ મળે છે. પટ્ટી પર {strength} લખેલું છે કે નહીં તે તપાસો.',
      checkName: 'નામ પૂરું વંચાયું નથી. પટ્ટી પર {name} લખેલું છે કે નહીં તે તપાસો.',
      unread: 'નામ સ્પષ્ટ વંચાયું નથી. પટ્ટીને ફરીથી સ્કેન કરો.',
      substitute: 'આ જ દવા છે, પણ કંપની અલગ છે. લેતા પહેલાં તપાસો.',
      expired: 'આ પત્તાની મુદત પૂરી થઈ ગઈ છે. તે ન લો — બીજું પત્તું લો.',
      time: 'દવા લેવાનો સમય થઈ ગયો છે.',
    },
    amount: simpleAmount({ half: 'અડધી', quarter: 'પા', oneHalf: 'દોઢ' }, {
      tablet: 'ગોળી', capsule: 'કેપ્સ્યુલ', ml: 'મિલીલીટર', drops: 'ટીપાં', puff: 'પફ', sachet: 'પાઉચ', injection: 'ઇન્જેક્શન',
    }),
  },
  ta: {
    label: 'தமிழ்',
    english: 'Tamil',
    tts: ['ta-IN'],
    phrases: {
      correct: 'உங்கள் பட்டியலில் உள்ள மருந்து: {name}.',
      take: 'இப்போது {amount} எடுத்துக்கொள்ளுங்கள்.',
      wrong: 'இது தவறான மருந்து. இதை எடுக்க வேண்டாம்.',
      notNow: 'இந்த மருந்தை இப்போது எடுக்க வேண்டியதில்லை.',
      taken: 'இந்த அளவு ஏற்கனவே எடுக்கப்பட்டது.',
      otherStrength: 'வலிமை வேறுபடுகிறது. இதை எடுக்க வேண்டாம். மருத்துவரிடம் அல்லது மருந்தாளுநரிடம் கேளுங்கள்.',
      checkStrength: 'பெயர் பொருந்துகிறது. அட்டையில் {strength} என்று உள்ளதா எனப் பாருங்கள்.',
      checkName: 'பெயர் முழுமையாகப் படிக்கப்படவில்லை. அட்டையில் {name} என்று உள்ளதா எனப் பாருங்கள்.',
      unread: 'பெயர் தெளிவாகப் படிக்கப்படவில்லை. அட்டையை மீண்டும் ஸ்கேன் செய்யுங்கள்.',
      substitute: 'இதே மருந்து, வேறு நிறுவனம். எடுப்பதற்கு முன் சரிபாருங்கள்.',
      expired: 'இந்த அட்டையின் காலாவதி தேதி முடிந்துவிட்டது. இதை எடுக்காதீர்கள் — வேறு அட்டையைப் பயன்படுத்துங்கள்.',
      time: 'மருந்து எடுக்கும் நேரம் ஆகிவிட்டது.',
    },
    amount: simpleAmount({ half: 'அரை', quarter: 'கால்', oneHalf: 'ஒன்றரை' }, {
      tablet: 'மாத்திரை', capsule: 'கேப்ஸ்யூல்', ml: 'மில்லிலிட்டர்', drops: 'சொட்டு', puff: 'பஃப்', sachet: 'சாஷே', injection: 'ஊசி',
    }),
  },
  kn: {
    label: 'ಕನ್ನಡ',
    english: 'Kannada',
    tts: ['kn-IN'],
    phrases: {
      correct: 'ನಿಮ್ಮ ಪಟ್ಟಿಯಲ್ಲಿರುವ ಔಷಧಿ: {name}.',
      take: 'ಈಗ {amount} ತೆಗೆದುಕೊಳ್ಳಿ.',
      wrong: 'ಇದು ತಪ್ಪು ಔಷಧಿ. ಇದನ್ನು ತೆಗೆದುಕೊಳ್ಳಬೇಡಿ.',
      notNow: 'ಈ ಔಷಧಿಯನ್ನು ಈಗ ತೆಗೆದುಕೊಳ್ಳುವ ಸಮಯವಲ್ಲ.',
      taken: 'ಈ ಡೋಸ್ ಈಗಾಗಲೇ ತೆಗೆದುಕೊಳ್ಳಲಾಗಿದೆ.',
      otherStrength: 'ಶಕ್ತಿ ಬೇರೆಯಾಗಿದೆ. ಇದನ್ನು ತೆಗೆದುಕೊಳ್ಳಬೇಡಿ. ವೈದ್ಯರನ್ನು ಅಥವಾ ಫಾರ್ಮಸಿಸ್ಟ್ ಅವರನ್ನು ಕೇಳಿ.',
      checkStrength: 'ಹೆಸರು ಹೊಂದುತ್ತದೆ. ಸ್ಟ್ರಿಪ್ ಮೇಲೆ {strength} ಇದೆಯೇ ಎಂದು ಪರಿಶೀಲಿಸಿ.',
      checkName: 'ಹೆಸರು ಪೂರ್ತಿ ಓದಲಾಗಲಿಲ್ಲ. ಸ್ಟ್ರಿಪ್ ಮೇಲೆ {name} ಇದೆಯೇ ಎಂದು ಪರಿಶೀಲಿಸಿ.',
      unread: 'ಹೆಸರು ಸ್ಪಷ್ಟವಾಗಿ ಓದಲಾಗಲಿಲ್ಲ. ಸ್ಟ್ರಿಪ್ ಅನ್ನು ಮತ್ತೆ ಸ್ಕ್ಯಾನ್ ಮಾಡಿ.',
      substitute: 'ಇದೇ ಔಷಧಿ, ಬೇರೆ ಕಂಪನಿಯದು. ತೆಗೆದುಕೊಳ್ಳುವ ಮೊದಲು ಪರಿಶೀಲಿಸಿ.',
      expired: 'ಈ ಸ್ಟ್ರಿಪ್\u200cನ ಅವಧಿ ಮುಗಿದಿದೆ. ಇದನ್ನು ತೆಗೆದುಕೊಳ್ಳಬೇಡಿ — ಬೇರೆ ಸ್ಟ್ರಿಪ್ ಬಳಸಿ.',
      time: 'ಔಷಧಿ ತೆಗೆದುಕೊಳ್ಳುವ ಸಮಯವಾಗಿದೆ.',
    },
    amount: simpleAmount({ half: 'ಅರ್ಧ', quarter: 'ಕಾಲು', oneHalf: 'ಒಂದೂವರೆ' }, {
      tablet: 'ಮಾತ್ರೆ', capsule: 'ಕ್ಯಾಪ್ಸೂಲ್', ml: 'ಮಿಲಿಲೀಟರ್', drops: 'ಹನಿ', puff: 'ಪಫ್', sachet: 'ಸ್ಯಾಶೆ', injection: 'ಇಂಜೆಕ್ಷನ್',
    }),
  },
  as: {
    label: 'অসমীয়া',
    english: 'Assamese',
    tts: ['as-IN', 'bn-IN'], // few phones have an Assamese voice; the Bengali voice reads the same script
    phrases: {
      correct: 'আপোনাৰ তালিকাৰ ঔষধ: {name}।',
      take: 'এতিয়া {amount} লওক।',
      wrong: 'এইটো ভুল ঔষধ। এইটো নাখাব।',
      notNow: 'এই ঔষধ এতিয়া খোৱাৰ সময় হোৱা নাই।',
      taken: 'এই মাত্ৰা আগতেই লোৱা হৈছে।',
      otherStrength: 'শক্তি বেলেগ। এইটো নাখাব। ডাক্তৰ বা ফাৰ্মাচিষ্টক সোধক।',
      checkStrength: 'নাম মিলিছে। পাতত {strength} লিখা আছে নে নাই চাওক।',
      checkName: "নামটো সম্পূৰ্ণ পঢ়িব পৰা নগ'ল। পাতত {name} লিখা আছে নে নাই চাওক।",
      unread: "নামটো স্পষ্টকৈ পঢ়িব পৰা নগ'ল। পাতখন আকৌ স্কেন কৰক।",
      substitute: 'একেটা ঔষধ, কিন্তু বেলেগ কোম্পানীৰ। খোৱাৰ আগতে চাই লওক।',
      expired: 'এই ষ্ট্ৰিপৰ ম্যাদ উকলি গৈছে। এইটো নাখাব — আন এটা ষ্ট্ৰিপ লওক।',
      time: 'ঔষধ খোৱাৰ সময় হৈছে।',
    },
    amount: simpleAmount({ half: 'আধা', quarter: 'এক চতুৰ্থাংশ', oneHalf: 'দেৰ' }, {
      tablet: 'টেবলেট', capsule: 'কেপচুল', ml: 'মিলিলিটাৰ', drops: 'টোপাল', puff: 'পাফ', sachet: 'পাউচ', injection: 'বেজী',
    }),
  },
  zh: {
    label: '中文 (普通话)',
    english: 'Mandarin',
    tts: ['zh-CN', 'zh-TW'],
    phrases: {
      correct: '这是您清单上的药：{name}。',
      take: '现在服用{amount}。',
      wrong: '药品不对，请不要服用。',
      notNow: '现在不是服用这种药的时间。',
      taken: '这一次的药已经服用过了。',
      otherStrength: '药的规格不同，请不要服用。请咨询医生或药剂师。',
      checkStrength: '名称相符。请确认药板上写的是{strength}。',
      checkName: '名称没有完全读出。请确认药板上写的是{name}。',
      unread: '没能看清药名。请重新扫描药板。',
      substitute: '同一种药，但品牌不同。服用前请确认。',
      expired: '这板药已过期。请不要服用，换一板。',
      time: '该吃药了。',
    },
    amount: (q, u) => {
      const units: Record<UnitKey, string> = { tablet: '片', capsule: '粒', ml: '毫升', drops: '滴', puff: '喷', sachet: '袋', injection: '针' };
      const w = units[u];
      if (u !== 'ml' && u !== 'drops') {
        if (q === 0.5) return `半${w}`;
        if (q === 0.25) return `四分之一${w}`;
        if (q === 1.5) return `一${w}半`;
      }
      return `${num(q)}${w}`;
    },
  },
  es: {
    label: 'Español',
    english: 'Spanish',
    tts: ['es-ES', 'es-US', 'es-MX'],
    phrases: {
      correct: 'Coincide con su lista: {name}.',
      take: 'Tome {amount} ahora.',
      wrong: 'Medicamento equivocado. No lo tome.',
      notNow: 'Ahora no le toca este medicamento.',
      taken: 'Esta dosis ya se tomó.',
      otherStrength: 'La dosis del envase es diferente. No lo tome. Consulte al médico o al farmacéutico.',
      checkStrength: 'El nombre coincide. Compruebe que el blíster diga {strength}.',
      checkName: 'No se pudo leer todo el nombre. Compruebe que el blíster diga {name}.',
      unread: 'No se pudo leer bien el nombre. Escanee el blíster otra vez.',
      substitute: 'Es el mismo medicamento, de otra marca. Compruébelo antes de tomarlo.',
      expired: 'Este blíster está caducado. No lo tome; use otro.',
      time: 'Es hora de su medicamento.',
    },
    amount: (q, u) => {
      // [singular, plural, feminine?]
      const units: Record<UnitKey, [string, string, boolean]> = {
        tablet: ['pastilla', 'pastillas', true], capsule: ['cápsula', 'cápsulas', true], ml: ['mililitro', 'mililitros', false],
        drops: ['gota', 'gotas', true], puff: ['inhalación', 'inhalaciones', true], sachet: ['sobre', 'sobres', false], injection: ['inyección', 'inyecciones', true],
      };
      const [one, many, fem] = units[u];
      if (u !== 'ml' && u !== 'drops') {
        if (q === 0.5) return `${fem ? 'media' : 'medio'} ${one}`;
        if (q === 0.25) return `un cuarto de ${one}`;
        if (q === 1.5) return `${fem ? 'una' : 'un'} ${one} y ${fem ? 'media' : 'medio'}`;
        if (q === 1) return `${fem ? 'una' : 'un'} ${one}`;
      }
      return `${num(q)} ${q === 1 ? one : many}`;
    },
  },
  fil: {
    label: 'Filipino',
    english: 'Filipino',
    tts: ['fil-PH', 'tl-PH'],
    phrases: {
      correct: 'Tugma sa iyong listahan: {name}.',
      take: 'Uminom ng {amount} ngayon.',
      wrong: 'Maling gamot. Huwag itong inumin.',
      notNow: 'Hindi pa oras para sa gamot na ito.',
      taken: 'Nainom na ang dosis na ito.',
      otherStrength: 'Iba ang lakas ng gamot. Huwag itong inumin. Magtanong sa doktor o parmasyutiko.',
      checkStrength: 'Tugma ang pangalan. Tingnan kung {strength} ang nakasulat sa strip.',
      checkName: 'Hindi nabasa nang buo ang pangalan. Tingnan kung {name} ang nakasulat sa strip.',
      unread: 'Hindi malinaw na nabasa ang pangalan. I-scan muli ang strip.',
      substitute: 'Parehong gamot, ibang brand. Suriin muna bago inumin.',
      expired: 'Expired na ang strip na ito. Huwag itong inumin — gumamit ng ibang strip.',
      time: 'Oras na ng iyong gamot.',
    },
    amount: (q, u) => {
      const units: Record<UnitKey, string> = { tablet: 'tableta', capsule: 'kapsula', ml: 'mililitro', drops: 'patak', puff: 'puff', sachet: 'sachet', injection: 'iniksyon' };
      const w = units[u];
      if (u !== 'ml' && u !== 'drops') {
        if (q === 0.5) return `kalahating ${w}`;
        if (q === 0.25) return `kapat na ${w}`;
        if (q === 1.5) return `isa't kalahating ${w}`;
      }
      return `${num(q)} ${w}`;
    },
  },
  ja: {
    label: '日本語',
    english: 'Japanese',
    tts: ['ja-JP'],
    phrases: {
      correct: 'リストのお薬と一致しました。{name}。',
      take: '今、{amount}飲んでください。',
      wrong: '違うお薬です。飲まないでください。',
      notNow: 'このお薬は今飲む時間ではありません。',
      taken: 'この分はもう飲みました。',
      otherStrength: 'お薬の強さが違います。飲まないでください。医師か薬剤師に相談してください。',
      checkStrength: '名前は合っています。シートに{strength}と書いてあるか確認してください。',
      checkName: '名前の一部しか読めませんでした。シートに{name}と書いてあるか確認してください。',
      unread: '名前がはっきり読めませんでした。シートをもう一度スキャンしてください。',
      substitute: '同じお薬ですが、別のメーカーです。飲む前に確認してください。',
      expired: 'このシートは使用期限切れです。飲まずに、別のシートを使ってください。',
      time: 'お薬の時間です。',
    },
    amount: (q, u) => {
      const units: Record<UnitKey, string> = { tablet: '錠', capsule: 'カプセル', ml: 'ミリリットル', drops: '滴', puff: '吸入', sachet: '包', injection: '本' };
      const w = units[u];
      if (u === 'tablet') {
        if (q === 0.5) return '半錠';
        if (q === 1.5) return '1錠半';
      }
      if (q === 0.5) return `半分の${w}`;
      return `${num(q)}${w}`;
    },
  },
};

export const LANG_ORDER: LangCode[] = ['en', 'hi', 'bn', 'pa', 'te', 'gu', 'ta', 'kn', 'as', 'zh', 'es', 'fil', 'ja'];

/** Shown by default. */
export const MAIN_LANGS: LangCode[] = ['en', 'bn', 'hi'];
/** Written but not yet checked by a native speaker — offered under "More languages". */
export const MORE_LANGS: LangCode[] = LANG_ORDER.filter((c) => !MAIN_LANGS.includes(c));

const UNIT_KEYS: UnitKey[] = ['tablet', 'capsule', 'ml', 'drops', 'puff', 'sachet', 'injection'];
const asUnit = (u: string): UnitKey => (UNIT_KEYS.includes(u as UnitKey) ? (u as UnitKey) : 'tablet');

/** Strength as it should be spoken: "75" -> "75 mg", "10/40" -> "10 / 40 mg", "50 mcg" unchanged. */
export function spokenStrength(strength: string): string {
  if (!strength) return '';
  return /[a-z]/i.test(strength) ? strength : `${strength.replace('/', ' / ')} mg`;
}

export function amountText(lang: LangCode, qty: number, unit: string): string {
  return LANGS[lang].amount(qty, asUnit(unit));
}

export function phrase(lang: LangCode, key: PhraseKey, vars: Record<string, string> = {}): string {
  let s = (LANGS[lang] ?? LANGS.en).phrases[key];
  for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, v);
  return s;
}

/** The full announcement for a green match, e.g. "सही दवा: Clopilet 75। अभी 1 गोली लीजिए।" */
export function matchAnnouncement(lang: LangCode, items: { name: string; qty: number; unit: string }[]): string {
  return items
    .map((i) => `${phrase(lang, 'correct', { name: i.name })} ${phrase(lang, 'take', { amount: amountText(lang, i.qty, i.unit) })}`)
    .join(' ');
}
