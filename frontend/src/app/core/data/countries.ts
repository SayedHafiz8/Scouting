// Countries with their administrative regions (governorates / provinces).
// Each region is a [english, arabic] tuple. Stored value = english (canonical);
// the dropdown shows the label localized to the current UI language.

export interface Country {
  en: string;
  ar: string;
  regions: [string, string][];
}

export const COUNTRIES: Country[] = [
  {
    en: 'Egypt', ar: 'مصر',
    regions: [
      ['Cairo', 'القاهرة'], ['Giza', 'الجيزة'], ['Alexandria', 'الإسكندرية'],
      ['Dakahlia', 'الدقهلية'], ['Sharqia', 'الشرقية'], ['Qalyubia', 'القليوبية'],
      ['Gharbia', 'الغربية'], ['Menoufia', 'المنوفية'], ['Beheira', 'البحيرة'],
      ['Kafr El Sheikh', 'كفر الشيخ'], ['Damietta', 'دمياط'], ['Port Said', 'بورسعيد'],
      ['Ismailia', 'الإسماعيلية'], ['Suez', 'السويس'], ['North Sinai', 'شمال سيناء'],
      ['South Sinai', 'جنوب سيناء'], ['Fayoum', 'الفيوم'], ['Beni Suef', 'بني سويف'],
      ['Minya', 'المنيا'], ['Assiut', 'أسيوط'], ['Sohag', 'سوهاج'], ['Qena', 'قنا'],
      ['Luxor', 'الأقصر'], ['Aswan', 'أسوان'], ['Red Sea', 'البحر الأحمر'],
      ['New Valley', 'الوادي الجديد'], ['Matrouh', 'مطروح'],
    ],
  },
  {
    en: 'Saudi Arabia', ar: 'السعودية',
    regions: [
      ['Riyadh', 'الرياض'], ['Makkah', 'مكة المكرمة'], ['Madinah', 'المدينة المنورة'],
      ['Eastern Province', 'المنطقة الشرقية'], ['Asir', 'عسير'], ['Tabuk', 'تبوك'],
      ['Hail', 'حائل'], ['Northern Borders', 'الحدود الشمالية'], ['Jazan', 'جازان'],
      ['Najran', 'نجران'], ['Al Bahah', 'الباحة'], ['Al Jawf', 'الجوف'], ['Qassim', 'القصيم'],
    ],
  },
  {
    en: 'United Arab Emirates', ar: 'الإمارات',
    regions: [
      ['Abu Dhabi', 'أبوظبي'], ['Dubai', 'دبي'], ['Sharjah', 'الشارقة'],
      ['Ajman', 'عجمان'], ['Umm Al Quwain', 'أم القيوين'], ['Ras Al Khaimah', 'رأس الخيمة'],
      ['Fujairah', 'الفجيرة'],
    ],
  },
  {
    en: 'Qatar', ar: 'قطر',
    regions: [
      ['Doha', 'الدوحة'], ['Al Rayyan', 'الريان'], ['Al Wakrah', 'الوكرة'],
      ['Al Khor', 'الخور'], ['Al Shamal', 'الشمال'], ['Al Daayen', 'الظعاين'],
      ['Umm Salal', 'أم صلال'], ['Al Shahaniya', 'الشحانية'],
    ],
  },
  {
    en: 'Kuwait', ar: 'الكويت',
    regions: [
      ['Al Asimah', 'العاصمة'], ['Hawalli', 'حولي'], ['Al Farwaniyah', 'الفروانية'],
      ['Mubarak Al-Kabeer', 'مبارك الكبير'], ['Al Ahmadi', 'الأحمدي'], ['Al Jahra', 'الجهراء'],
    ],
  },
  {
    en: 'Bahrain', ar: 'البحرين',
    regions: [
      ['Capital', 'العاصمة'], ['Muharraq', 'المحرق'], ['Northern', 'الشمالية'],
      ['Southern', 'الجنوبية'],
    ],
  },
  {
    en: 'Oman', ar: 'عُمان',
    regions: [
      ['Muscat', 'مسقط'], ['Dhofar', 'ظفار'], ['Musandam', 'مسندم'], ['Al Buraimi', 'البريمي'],
      ['Al Dakhiliyah', 'الداخلية'], ['North Al Batinah', 'شمال الباطنة'],
      ['South Al Batinah', 'جنوب الباطنة'], ['North Al Sharqiyah', 'شمال الشرقية'],
      ['South Al Sharqiyah', 'جنوب الشرقية'], ['Al Dhahirah', 'الظاهرة'], ['Al Wusta', 'الوسطى'],
    ],
  },
  {
    en: 'Jordan', ar: 'الأردن',
    regions: [
      ['Amman', 'عمّان'], ['Irbid', 'إربد'], ['Zarqa', 'الزرقاء'], ['Balqa', 'البلقاء'],
      ['Madaba', 'مادبا'], ['Karak', 'الكرك'], ['Tafilah', 'الطفيلة'], ['Maan', 'معان'],
      ['Aqaba', 'العقبة'], ['Mafraq', 'المفرق'], ['Jerash', 'جرش'], ['Ajloun', 'عجلون'],
    ],
  },
  {
    en: 'Palestine', ar: 'فلسطين',
    regions: [
      ['Jerusalem', 'القدس'], ['Gaza', 'غزة'], ['Ramallah', 'رام الله'], ['Hebron', 'الخليل'],
      ['Nablus', 'نابلس'], ['Jenin', 'جنين'], ['Bethlehem', 'بيت لحم'], ['Tulkarm', 'طولكرم'],
      ['Qalqilya', 'قلقيلية'], ['Khan Yunis', 'خان يونس'], ['Rafah', 'رفح'], ['Salfit', 'سلفيت'],
      ['Tubas', 'طوباس'], ['Deir al-Balah', 'دير البلح'], ['North Gaza', 'شمال غزة'], ['Jericho', 'أريحا'],
    ],
  },
  {
    en: 'Lebanon', ar: 'لبنان',
    regions: [
      ['Beirut', 'بيروت'], ['Mount Lebanon', 'جبل لبنان'], ['North Lebanon', 'الشمال'],
      ['South Lebanon', 'الجنوب'], ['Beqaa', 'البقاع'], ['Nabatieh', 'النبطية'],
      ['Akkar', 'عكار'], ['Baalbek-Hermel', 'بعلبك الهرمل'],
    ],
  },
  {
    en: 'Syria', ar: 'سوريا',
    regions: [
      ['Damascus', 'دمشق'], ['Rif Dimashq', 'ريف دمشق'], ['Aleppo', 'حلب'], ['Homs', 'حمص'],
      ['Hama', 'حماة'], ['Latakia', 'اللاذقية'], ['Tartus', 'طرطوس'], ['Idlib', 'إدلب'],
      ['Daraa', 'درعا'], ['As-Suwayda', 'السويداء'], ['Quneitra', 'القنيطرة'],
      ['Deir ez-Zor', 'دير الزور'], ['Al-Hasakah', 'الحسكة'], ['Raqqa', 'الرقة'],
    ],
  },
  {
    en: 'Iraq', ar: 'العراق',
    regions: [
      ['Baghdad', 'بغداد'], ['Basra', 'البصرة'], ['Nineveh', 'نينوى'], ['Erbil', 'أربيل'],
      ['Sulaymaniyah', 'السليمانية'], ['Kirkuk', 'كركوك'], ['Najaf', 'النجف'], ['Karbala', 'كربلاء'],
      ['Wasit', 'واسط'], ['Maysan', 'ميسان'], ['Dhi Qar', 'ذي قار'], ['Al-Muthanna', 'المثنى'],
      ['Al-Qadisiyah', 'القادسية'], ['Babil', 'بابل'], ['Diyala', 'ديالى'], ['Anbar', 'الأنبار'],
      ['Saladin', 'صلاح الدين'], ['Dohuk', 'دهوك'],
    ],
  },
  {
    en: 'Libya', ar: 'ليبيا',
    regions: [
      ['Tripoli', 'طرابلس'], ['Benghazi', 'بنغازي'], ['Misrata', 'مصراتة'], ['Zawiya', 'الزاوية'],
      ['Sabha', 'سبها'], ['Bayda', 'البيضاء'], ['Ajdabiya', 'أجدابيا'], ['Tobruk', 'طبرق'],
      ['Sirte', 'سرت'], ['Zliten', 'زليتن'], ['Khoms', 'الخمس'], ['Derna', 'درنة'],
    ],
  },
  {
    en: 'Tunisia', ar: 'تونس',
    regions: [
      ['Tunis', 'تونس'], ['Ariana', 'أريانة'], ['Ben Arous', 'بن عروس'], ['Manouba', 'منوبة'],
      ['Nabeul', 'نابل'], ['Zaghouan', 'زغوان'], ['Bizerte', 'بنزرت'], ['Béja', 'باجة'],
      ['Jendouba', 'جندوبة'], ['Kef', 'الكاف'], ['Siliana', 'سليانة'], ['Sousse', 'سوسة'],
      ['Monastir', 'المنستير'], ['Mahdia', 'المهدية'], ['Sfax', 'صفاقس'], ['Kairouan', 'القيروان'],
      ['Kasserine', 'القصرين'], ['Sidi Bouzid', 'سيدي بوزيد'], ['Gabès', 'قابس'], ['Medenine', 'مدنين'],
      ['Tataouine', 'تطاوين'], ['Gafsa', 'قفصة'], ['Tozeur', 'توزر'], ['Kebili', 'قبلي'],
    ],
  },
  {
    en: 'Algeria', ar: 'الجزائر',
    regions: [
      ['Algiers', 'الجزائر'], ['Oran', 'وهران'], ['Constantine', 'قسنطينة'], ['Annaba', 'عنابة'],
      ['Blida', 'البليدة'], ['Batna', 'باتنة'], ['Sétif', 'سطيف'], ['Djelfa', 'الجلفة'],
      ['Sidi Bel Abbès', 'سيدي بلعباس'], ['Biskra', 'بسكرة'], ['Tébessa', 'تبسة'], ['Tlemcen', 'تلمسان'],
      ['Béjaïa', 'بجاية'], ['Tizi Ouzou', 'تيزي وزو'], ['Skikda', 'سكيكدة'], ['Ouargla', 'ورقلة'],
    ],
  },
  {
    en: 'Morocco', ar: 'المغرب',
    regions: [
      ['Tanger-Tetouan-Al Hoceima', 'طنجة تطوان الحسيمة'], ['Oriental', 'الشرق'],
      ['Fès-Meknès', 'فاس مكناس'], ['Rabat-Salé-Kénitra', 'الرباط سلا القنيطرة'],
      ['Béni Mellal-Khénifra', 'بني ملال خنيفرة'], ['Casablanca-Settat', 'الدار البيضاء سطات'],
      ['Marrakesh-Safi', 'مراكش آسفي'], ['Drâa-Tafilalet', 'درعة تافيلالت'], ['Souss-Massa', 'سوس ماسة'],
      ['Guelmim-Oued Noun', 'كلميم واد نون'], ['Laâyoune-Sakia El Hamra', 'العيون الساقية الحمراء'],
      ['Dakhla-Oued Ed-Dahab', 'الداخلة وادي الذهب'],
    ],
  },
  {
    en: 'Sudan', ar: 'السودان',
    regions: [
      ['Khartoum', 'الخرطوم'], ['Gezira', 'الجزيرة'], ['Red Sea', 'البحر الأحمر'], ['Kassala', 'كسلا'],
      ['Gedaref', 'القضارف'], ['White Nile', 'النيل الأبيض'], ['Blue Nile', 'النيل الأزرق'],
      ['Northern', 'الشمالية'], ['River Nile', 'نهر النيل'], ['North Kordofan', 'شمال كردفان'],
      ['South Kordofan', 'جنوب كردفان'], ['West Kordofan', 'غرب كردفان'], ['North Darfur', 'شمال دارفور'],
      ['South Darfur', 'جنوب دارفور'], ['East Darfur', 'شرق دارفور'], ['West Darfur', 'غرب دارفور'],
      ['Central Darfur', 'وسط دارفور'], ['Sennar', 'سنار'],
    ],
  },
];
