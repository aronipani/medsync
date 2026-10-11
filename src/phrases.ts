// Spoken announcements in the family's languages. Pure (no React Native) so it can be tested.
// Medicine names are spoken as printed; everything around them is in the chosen language.

export type LangCode = 'en' | 'hi' | 'bn' | 'pa' | 'te' | 'gu' | 'ta' | 'kn' | 'as' | 'zh' | 'es' | 'fil' | 'ja';

export type PhraseKey = 'correct' | 'take' | 'wrong' | 'notNow' | 'taken' | 'otherStrength' | 'checkStrength' | 'substitute' | 'time';

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
      correct: 'Correct medicine: {name}.',
      take: 'Take {amount} now.',
      wrong: 'Wrong medicine. Do not take this one.',
      notNow: 'This medicine is not due now.',
      taken: 'This dose has already been taken.',
      otherStrength: 'Different strength. Do not take it. Please ask the doctor or pharmacist.',
      checkStrength: 'The name matches. Check that the strip says {strength}.',
      substitute: 'Same medicine, different brand. Please check before taking.',
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
      correct: 'सही दवा: {name}।',
      take: 'अभी {amount} लीजिए।',
      wrong: 'यह गलत दवा है। इसे मत लीजिए।',
      notNow: 'यह दवा अभी लेने की नहीं है।',
      taken: 'यह खुराक पहले ही ली जा चुकी है।',
      otherStrength: 'ताकत अलग है। इसे मत लीजिए। डॉक्टर या फार्मासिस्ट से पूछिए।',
      checkStrength: 'नाम सही है। जाँच लीजिए कि पत्ते पर {strength} लिखा है।',
      substitute: 'यही दवा है, पर कंपनी अलग है। लेने से पहले जाँच लीजिए।',
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
      correct: 'সঠিক ওষুধ: {name}।',
      take: 'এখন {amount} নিন।',
      wrong: 'এটা ভুল ওষুধ। এটা খাবেন না।',
      notNow: 'এই ওষুধ এখন খাওয়ার সময় নয়।',
      taken: 'এই ডোজ আগেই নেওয়া হয়ে গেছে।',
      otherStrength: 'মাত্রা আলাদা। এটা খাবেন না। ডাক্তার বা ফার্মাসিস্টকে জিজ্ঞেস করুন।',
      checkStrength: 'নাম মিলেছে। পাতায় {strength} লেখা আছে কিনা দেখে নিন।',
      substitute: 'একই ওষুধ, অন্য কোম্পানির। খাওয়ার আগে দেখে নিন।',
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
      correct: 'ਸਹੀ ਦਵਾਈ: {name}।',
      take: 'ਹੁਣ {amount} ਲਓ।',
      wrong: 'ਇਹ ਗਲਤ ਦਵਾਈ ਹੈ। ਇਸਨੂੰ ਨਾ ਲਓ।',
      notNow: 'ਇਹ ਦਵਾਈ ਹੁਣ ਲੈਣ ਵਾਲੀ ਨਹੀਂ ਹੈ।',
      taken: 'ਇਹ ਖੁਰਾਕ ਪਹਿਲਾਂ ਹੀ ਲੈ ਲਈ ਗਈ ਹੈ।',
      otherStrength: 'ਤਾਕਤ ਵੱਖਰੀ ਹੈ। ਇਸਨੂੰ ਨਾ ਲਓ। ਡਾਕਟਰ ਜਾਂ ਫਾਰਮਾਸਿਸਟ ਤੋਂ ਪੁੱਛੋ।',
      checkStrength: 'ਨਾਮ ਸਹੀ ਹੈ। ਜਾਂਚ ਕਰੋ ਕਿ ਪੱਤੇ ਉੱਤੇ {strength} ਲਿਖਿਆ ਹੈ।',
      substitute: 'ਇਹੀ ਦਵਾਈ ਹੈ, ਪਰ ਕੰਪਨੀ ਵੱਖਰੀ ਹੈ। ਲੈਣ ਤੋਂ ਪਹਿਲਾਂ ਜਾਂਚ ਕਰੋ।',
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
      correct: 'సరైన మందు: {name}.',
      take: 'ఇప్పుడు {amount} తీసుకోండి.',
      wrong: 'ఇది తప్పు మందు. దీన్ని తీసుకోకండి.',
      notNow: 'ఈ మందు ఇప్పుడు తీసుకోవలసినది కాదు.',
      taken: 'ఈ మోతాదు ఇప్పటికే తీసుకున్నారు.',
      otherStrength: 'బలం వేరుగా ఉంది. దీన్ని తీసుకోకండి. డాక్టర్‌ను లేదా ఫార్మసిస్ట్‌ను అడగండి.',
      checkStrength: 'పేరు సరిపోయింది. స్ట్రిప్ మీద {strength} ఉందో లేదో చూడండి.',
      substitute: 'ఇదే మందు, వేరే కంపెనీది. తీసుకునే ముందు చూసుకోండి.',
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
      correct: 'સાચી દવા: {name}.',
      take: 'હમણાં {amount} લો.',
      wrong: 'આ ખોટી દવા છે. આ ન લો.',
      notNow: 'આ દવા અત્યારે લેવાની નથી.',
      taken: 'આ ડોઝ પહેલેથી લેવાઈ ગયો છે.',
      otherStrength: 'તાકાત અલગ છે. આ ન લો. ડૉક્ટર અથવા ફાર્માસિસ્ટને પૂછો.',
      checkStrength: 'નામ મળે છે. પટ્ટી પર {strength} લખેલું છે કે નહીં તે તપાસો.',
      substitute: 'આ જ દવા છે, પણ કંપની અલગ છે. લેતા પહેલાં તપાસો.',
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
      correct: 'சரியான மருந்து: {name}.',
      take: 'இப்போது {amount} எடுத்துக்கொள்ளுங்கள்.',
      wrong: 'இது தவறான மருந்து. இதை எடுக்க வேண்டாம்.',
      notNow: 'இந்த மருந்தை இப்போது எடுக்க வேண்டியதில்லை.',
      taken: 'இந்த அளவு ஏற்கனவே எடுக்கப்பட்டது.',
      otherStrength: 'வலிமை வேறுபடுகிறது. இதை எடுக்க வேண்டாம். மருத்துவரிடம் அல்லது மருந்தாளுநரிடம் கேளுங்கள்.',
      checkStrength: 'பெயர் பொருந்துகிறது. அட்டையில் {strength} என்று உள்ளதா எனப் பாருங்கள்.',
      substitute: 'இதே மருந்து, வேறு நிறுவனம். எடுப்பதற்கு முன் சரிபாருங்கள்.',
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
      correct: 'ಸರಿಯಾದ ಔಷಧಿ: {name}.',
      take: 'ಈಗ {amount} ತೆಗೆದುಕೊಳ್ಳಿ.',
      wrong: 'ಇದು ತಪ್ಪು ಔಷಧಿ. ಇದನ್ನು ತೆಗೆದುಕೊಳ್ಳಬೇಡಿ.',
      notNow: 'ಈ ಔಷಧಿಯನ್ನು ಈಗ ತೆಗೆದುಕೊಳ್ಳುವ ಸಮಯವಲ್ಲ.',
      taken: 'ಈ ಡೋಸ್ ಈಗಾಗಲೇ ತೆಗೆದುಕೊಳ್ಳಲಾಗಿದೆ.',
      otherStrength: 'ಶಕ್ತಿ ಬೇರೆಯಾಗಿದೆ. ಇದನ್ನು ತೆಗೆದುಕೊಳ್ಳಬೇಡಿ. ವೈದ್ಯರನ್ನು ಅಥವಾ ಫಾರ್ಮಸಿಸ್ಟ್ ಅವರನ್ನು ಕೇಳಿ.',
      checkStrength: 'ಹೆಸರು ಹೊಂದುತ್ತದೆ. ಸ್ಟ್ರಿಪ್ ಮೇಲೆ {strength} ಇದೆಯೇ ಎಂದು ಪರಿಶೀಲಿಸಿ.',
      substitute: 'ಇದೇ ಔಷಧಿ, ಬೇರೆ ಕಂಪನಿಯದು. ತೆಗೆದುಕೊಳ್ಳುವ ಮೊದಲು ಪರಿಶೀಲಿಸಿ.',
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
      correct: 'শুদ্ধ ঔষধ: {name}।',
      take: 'এতিয়া {amount} লওক।',
      wrong: 'এইটো ভুল ঔষধ। এইটো নাখাব।',
      notNow: 'এই ঔষধ এতিয়া খোৱাৰ সময় হোৱা নাই।',
      taken: 'এই মাত্ৰা আগতেই লোৱা হৈছে।',
      otherStrength: 'শক্তি বেলেগ। এইটো নাখাব। ডাক্তৰ বা ফাৰ্মাচিষ্টক সোধক।',
      checkStrength: 'নাম মিলিছে। পাতত {strength} লিখা আছে নে নাই চাওক।',
      substitute: 'একেটা ঔষধ, কিন্তু বেলেগ কোম্পানীৰ। খোৱাৰ আগতে চাই লওক।',
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
      correct: '药品正确：{name}。',
      take: '现在服用{amount}。',
      wrong: '药品不对，请不要服用。',
      notNow: '现在不是服用这种药的时间。',
      taken: '这一次的药已经服用过了。',
      otherStrength: '药的规格不同，请不要服用。请咨询医生或药剂师。',
      checkStrength: '名称相符。请确认药板上写的是{strength}。',
      substitute: '同一种药，但品牌不同。服用前请确认。',
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
      correct: 'Medicamento correcto: {name}.',
      take: 'Tome {amount} ahora.',
      wrong: 'Medicamento equivocado. No lo tome.',
      notNow: 'Ahora no le toca este medicamento.',
      taken: 'Esta dosis ya se tomó.',
      otherStrength: 'La dosis del envase es diferente. No lo tome. Consulte al médico o al farmacéutico.',
      checkStrength: 'El nombre coincide. Compruebe que el blíster diga {strength}.',
      substitute: 'Es el mismo medicamento, de otra marca. Compruébelo antes de tomarlo.',
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
      correct: 'Tamang gamot: {name}.',
      take: 'Uminom ng {amount} ngayon.',
      wrong: 'Maling gamot. Huwag itong inumin.',
      notNow: 'Hindi pa oras para sa gamot na ito.',
      taken: 'Nainom na ang dosis na ito.',
      otherStrength: 'Iba ang lakas ng gamot. Huwag itong inumin. Magtanong sa doktor o parmasyutiko.',
      checkStrength: 'Tugma ang pangalan. Tingnan kung {strength} ang nakasulat sa strip.',
      substitute: 'Parehong gamot, ibang brand. Suriin muna bago inumin.',
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
      correct: '正しいお薬です。{name}。',
      take: '今、{amount}飲んでください。',
      wrong: '違うお薬です。飲まないでください。',
      notNow: 'このお薬は今飲む時間ではありません。',
      taken: 'この分はもう飲みました。',
      otherStrength: 'お薬の強さが違います。飲まないでください。医師か薬剤師に相談してください。',
      checkStrength: '名前は合っています。シートに{strength}と書いてあるか確認してください。',
      substitute: '同じお薬ですが、別のメーカーです。飲む前に確認してください。',
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
