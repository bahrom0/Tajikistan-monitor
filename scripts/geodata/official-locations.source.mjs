export const OFFICIAL_2025_URL = 'https://www.stat.tj/wp-content/uploads/2025/12/machmuai-shumorai-aholi-to-1.01.2025.pdf';
export const ADLIA_URL = 'https://mmih.adlia.tj/Search/DocumentView?DocumentId=118856';

const r = (id, ru, tg) => ({ id: `region-${id}`, type: 'region', name_ru: ru, name_tg: tg, parent_id: null });
const d = (id, ru, tg, parent) => ({ id: `district-${id}`, type: 'district', name_ru: ru, name_tg: tg, parent_id: `region-${parent}` });
const c = (id, ru, tg, parent, osm = tg) => ({ id: `city-${id}`, type: 'city', name_ru: ru, name_tg: tg, parent_id: `region-${parent}`, osm_name: osm });
const t = (id, ru, tg, parent, osm = tg, coordinates) => ({ id: `town-${id}`, type: 'town', name_ru: ru, name_tg: tg, parent_id: parent, osm_name: osm, coordinates });

export const locations = [
  r('gbao', 'Горно-Бадахшанская автономная область', 'Вилояти Мухтори Кӯҳистони Бадахшон'),
  r('sughd', 'Согдийская область', 'Вилояти Суғд'),
  r('khatlon', 'Хатлонская область', 'Вилояти Хатлон'),
  r('dushanbe', 'Душанбе', 'Душанбе'),
  r('rrp', 'Районы республиканского подчинения', 'Ноҳияҳои тобеи ҷумҳурӣ'),

  d('vanj', 'Ванчский район', 'Ноҳияи Ванҷ', 'gbao'), d('darvoz', 'Дарвазский район', 'Ноҳияи Дарвоз', 'gbao'),
  d('ishkoshim', 'Ишкашимский район', 'Ноҳияи Ишкошим', 'gbao'), d('murghob', 'Мургабский район', 'Ноҳияи Мурғоб', 'gbao'),
  d('roshtqala', 'Рошткалинский район', 'Ноҳияи Роштқалъа', 'gbao'), d('rushon', 'Рушанский район', 'Ноҳияи Рӯшон', 'gbao'),
  d('shughnon', 'Шугнанский район', 'Ноҳияи Шуғнон', 'gbao'),

  d('ayni', 'Айнинский район', 'Ноҳияи Айнӣ', 'sughd'), d('asht', 'Аштский район', 'Ноҳияи Ашт', 'sughd'),
  d('devashtich', 'Район Деваштич', 'Ноҳияи Деваштич', 'sughd'), d('zafarobod', 'Зафарабадский район', 'Ноҳияи Зафаробод', 'sughd'),
  d('mastchoh', 'Матчинский район', 'Ноҳияи Мастчоҳ', 'sughd'), d('kohistoni-mastchoh', 'Кухистони-Мастчохский район', 'Ноҳияи Кӯҳистони Мастчоҳ', 'sughd'),
  d('spitamen', 'Спитаменский район', 'Ноҳияи Спитамен', 'sughd'), d('jabbor-rasulov', 'Джаббар-Расуловский район', 'Ноҳияи Ҷаббор Расулов', 'sughd'),
  d('bobojon-ghafurov', 'Бободжон-Гафуровский район', 'Ноҳияи Бобоҷон Ғафуров', 'sughd'), d('shahriston', 'Шахристанский район', 'Ноҳияи Шаҳристон', 'sughd'),

  d('baljuvon', 'Бальджуванский район', 'Ноҳияи Балҷувон', 'khatlon'), d('kushoniyon', 'Кушониёнский район', 'Ноҳияи Кӯшониён', 'khatlon'),
  d('vakhsh', 'Вахшский район', 'Ноҳияи Вахш', 'khatlon'), d('vose', 'Восейский район', 'Ноҳияи Восеъ', 'khatlon'),
  d('danghara', 'Дангаринский район', 'Ноҳияи Данғара', 'khatlon'), d('yovon', 'Яванский район', 'Ноҳияи Ёвон', 'khatlon'),
  d('jaloliddin-balkhi', 'Район Джалолиддина Балхи', 'Ноҳияи Ҷалолиддини Балхӣ', 'khatlon'), d('muminobod', 'Муминабадский район', 'Ноҳияи Мӯъминобод', 'khatlon'),
  d('hamadoni', 'Район Мир Сайида Али Хамадони', 'Ноҳияи Мир Сайид Алии Ҳамадонӣ', 'khatlon'), d('nosiri-khusrav', 'Район Носири Хусрава', 'Ноҳияи Носири Хусрав', 'khatlon'),
  d('panj', 'Пянджский район', 'Ноҳияи Панҷ', 'khatlon'), d('temurmalik', 'Район Темурмалик', 'Ноҳияи Темурмалик', 'khatlon'),
  d('khovaling', 'Ховалингский район', 'Ноҳияи Ховалинг', 'khatlon'), d('farkhor', 'Фархорский район', 'Ноҳияи Фархор', 'khatlon'),
  d('khuroson', 'Хуросонский район', 'Ноҳияи Хуросон', 'khatlon'), d('dusti', 'Район Дӯсти', 'Ноҳияи Дӯстӣ', 'khatlon'),
  d('qubodiyon', 'Кубодиёнский район', 'Ноҳияи Қубодиён', 'khatlon'), d('abdurahmon-jomi', 'Район Абдурахмона Джами', 'Ноҳияи Абдураҳмони Ҷомӣ', 'khatlon'),
  d('jayhun', 'Район Джайхун', 'Ноҳияи Ҷайҳун', 'khatlon'), d('shahritus', 'Шахритусский район', 'Ноҳияи Шаҳритӯс', 'khatlon'),
  d('shamsiddin-shohin', 'Район Шамсиддина Шохина', 'Ноҳияи Шамсиддин Шоҳин', 'khatlon'),

  d('varzob', 'Варзобский район', 'Ноҳияи Варзоб', 'rrp'), d('lakhsh', 'Лахшский район', 'Ноҳияи Лахш', 'rrp'),
  d('nurobod', 'Нурабадский район', 'Ноҳияи Нуробод', 'rrp'), d('rasht', 'Раштский район', 'Ноҳияи Рашт', 'rrp'),
  d('sangvor', 'Сангворский район', 'Ноҳияи Сангвор', 'rrp'), d('tojikobod', 'Таджикабадский район', 'Ноҳияи Тоҷикобод', 'rrp'),
  d('fayzobod', 'Файзабадский район', 'Ноҳияи Файзобод', 'rrp'), d('rudaki', 'Район Рудаки', 'Ноҳияи Рӯдакӣ', 'rrp'),
  d('shahrinav', 'Шахринавский район', 'Ноҳияи Шаҳринав', 'rrp'),

  c('khorugh', 'Хорог', 'Хоруғ', 'gbao'),
  c('khujand', 'Худжанд', 'Хуҷанд', 'sughd'), c('isfara', 'Исфара', 'Исфара', 'sughd'), c('guliston', 'Гулистон', 'Гулистон', 'sughd'),
  c('konibodom', 'Канибадам', 'Конибодом', 'sughd'), c('panjakent', 'Пенджикент', 'Панҷакент', 'sughd'), c('istaravshan', 'Истаравшан', 'Истаравшан', 'sughd'),
  c('istiqlol', 'Истиклол', 'Истиқлол', 'sughd'), c('buston', 'Бустон', 'Бӯстон', 'sughd'),
  c('bokhtar', 'Бохтар', 'Бохтар', 'khatlon'), c('kulob', 'Куляб', 'Кӯлоб', 'khatlon'), c('levakant', 'Левакант', 'Левакант', 'khatlon'), c('nurek', 'Нурек', 'Норак', 'khatlon'),
  c('dushanbe', 'Душанбе', 'Душанбе', 'dushanbe'),
  c('vahdat', 'Вахдат', 'Ваҳдат', 'rrp'), c('hisor', 'Гиссар', 'Ҳисор', 'rrp'), c('roghun', 'Рогун', 'Роғун', 'rrp'), c('tursunzoda', 'Турсунзаде', 'Турсунзода', 'rrp'),

  t('murghob', 'Мургаб', 'Мурғоб', 'district-murghob'),

  t('shurob', 'Шураб', 'Шӯроб', 'city-isfara'), t('nurafshon', 'Нурафшон', 'Нурафшон', 'city-isfara'), t('naftobod', 'Нефтеабад', 'Нафтобод', 'city-isfara'),
  t('adrasmon', 'Адрасман', 'Адрасмон', 'city-guliston'), t('zarnisor-sughd', 'Зарнисор', 'Зарнисор', 'city-guliston'), t('konsoy', 'Кансай', 'Консой', 'city-guliston'),
  t('navgarzan', 'Наугарзан', 'Навгарзан', 'city-guliston'), t('sirdaryo', 'Сырдарьинский', 'Сирдарё', 'city-guliston'), t('chorukh-dayron', 'Чорух-Дайрон', 'Чорух Дайрон', 'city-guliston'),
  t('palos', 'Палас', 'Палос', 'city-buston'), t('zarafshon', 'Зеравшан', 'Зарафшон', 'district-ayni'), t('shaydon', 'Шайдон', 'Шайдон', 'district-asht'),
  t('ghonchi', 'Ганчи', 'Ғончӣ', 'district-devashtich'), t('zafarobod', 'Зафаробод', 'Зафаробод', 'district-zafarobod'), t('mehnatobod', 'Мехнатобод', 'Меҳнатобод', 'district-zafarobod'),
  t('sughdiyon-zafarobod', 'Сугдиён', 'Суғдиён', 'district-zafarobod'), t('buston-mastchoh', 'Бустон', 'Бӯстон', 'district-mastchoh'), t('obshoron', 'Обшорон', 'Обшорон', 'district-mastchoh'),
  t('sughdiyon-mastchoh', 'Сугдиян', 'Суғдиён', 'district-mastchoh'), t('navkat', 'Навкат', 'Навкат', 'district-spitamen'), t('mehrobod', 'Мехрабад', 'Меҳробод', 'district-jabbor-rasulov'),
  t('ghafurov', 'Гафуров', 'Ғафуров', 'district-bobojon-ghafurov'),

  t('somoniyon-kushoniyon', 'Исмоили Сомони', 'Сомониён', 'district-kushoniyon', 'Исмоили Сомонӣ'), t('bustonqala', 'Бустонкала', 'Бӯстонқалъа', 'district-kushoniyon'),
  t('bokhtariyon', 'Бохтариён', 'Бохтариён', 'district-kushoniyon'), t('vakhsh', 'Вахш', 'Вахш', 'district-vakhsh'), t('zarnisor-vakhsh', 'Кировский', 'Зарнисор', 'district-vakhsh', 'Зарнисор', [68.86, 37.82]),
  t('hulbuk', 'Хулбук', 'Ҳулбук', 'district-vose'), t('danghara', 'Дангара', 'Данғара', 'district-danghara'), t('yovon', 'Яван', 'Ёвон', 'district-yovon'),
  t('hayoti-nav', 'Хаётинав', 'Ҳаёти Нав', 'district-yovon'), t('balkh', 'Балх', 'Балх', 'district-jaloliddin-balkhi'), t('orzu', 'Орзу', 'Орзу', 'district-jaloliddin-balkhi'),
  t('chorsu', 'Муминабадский', 'Чорсӯ', 'district-muminobod', 'Мӯъминобод'), t('moskva', 'Московский', 'Москва', 'district-hamadoni', 'Маскав'), t('panj', 'Пяндж', 'Панҷ', 'district-panj'),
  t('bahmanrud', 'Советский', 'Баҳманрӯд', 'district-temurmalik'), t('munk', 'Ховалинг', 'Мунк', 'district-khovaling', 'Ховалинг'), t('farkhor', 'Пархар', 'Фархор', 'district-farkhor'),
  t('khurramshahr', 'Обикиик', 'Хуррамшаҳр', 'district-khuroson', 'Обикиик'), t('khurramdiyor', '20-летия Независимости Таджикистана', 'Хуррамдиёр', 'district-dusti'),
  t('qubodiyon', 'Кубодиён', 'Қубодиён', 'district-qubodiyon'), t('khojamaston', 'Абдурахмана Джами', 'Хоҷамастон', 'district-abdurahmon-jomi', 'Абдураҳмони Ҷомӣ'),
  t('dusti', 'Дусти', 'Дӯстӣ', 'district-jayhun', 'Дусти'), t('tus', 'Шаартуз', 'Тус', 'district-shahritus', 'Шаҳритӯс'),

  t('numon-roziq', 'Нумон Розик', 'Нӯъмон Розиқ', 'city-vahdat'), t('sharora', 'Шарора', 'Шарора', 'city-hisor'), t('obigarm', 'Обигарм', 'Обигарм', 'city-roghun'),
  t('takob', 'Такоб', 'Такоб', 'district-varzob'), t('vahdat-lakhsh', 'Вахдат', 'Ваҳдат', 'district-lakhsh'), t('darband', 'Дарбанд', 'Дарбанд', 'district-nurobod'),
  t('gharm', 'Гарм', 'Ғарм', 'district-rasht'), t('navobod-rasht', 'Навабад', 'Навобод', 'district-rasht'), t('tojikobod', 'Таджикабад', 'Тоҷикобод', 'district-tojikobod'),
  t('fayzobod', 'Файзабад', 'Файзобод', 'district-fayzobod', 'Файзобод', [69.32, 38.55]), t('somoniyon-rudaki', 'Сомониён', 'Сомониён', 'district-rudaki'),
  t('mirzo-tursunzoda-rudaki', 'Мирзо Турсунзаде', 'Мирзо Турсунзода', 'district-rudaki', 'Мирзо Турсунзода', [68.80, 38.50]), t('navobod-rudaki', 'Навабадский', 'Навобод', 'district-rudaki', 'Навобод', [68.67, 38.53]),
  t('mirzo-tursunzoda-shahrinav', 'Мирзо Турсунзаде', 'Мирзо Турсунзода', 'district-shahrinav', 'Мирзо Турсунзода', [68.33, 38.53]),
].map((item) => ({
  ...item,
  source_status: 'official_named_table',
  official_source_url: OFFICIAL_2025_URL,
  coordinate_source: 'OpenStreetMap/Geofabrik',
  coordinate_source_url: 'https://download.geofabrik.de/asia/tajikistan.html',
  dataset_date: '2025-01-01',
}));
