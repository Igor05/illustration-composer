import extracted from './extracted.json';

export type SizeId = 'S' | 'L';
export type ObjState = 'main' | 'bg';

export interface LibraryObject {
  id: string;
  name: string;
  /** words a person may type when asking for this object directly (scenario 2) */
  names: string[];
  /** meanings the object can stand for in a metaphor (scenario 1, keyword fallback) */
  meanings: string[];
}

export const OBJECTS: LibraryObject[] = [
  { id: 'book', name: 'Книга', names: ['книга', 'книги', 'книжка', 'book'],
    meanings: ['учеба', 'учиться', 'обучение', 'знания', 'знание', 'курс', 'чтение', 'читать', 'образование', 'школа', 'университет', 'история', 'гайд', 'инструкция', 'правила', 'документация', 'опыт', 'урок', 'education', 'learn', 'knowledge', 'story'] },
  { id: 'phone', name: 'Телефон', names: ['телефон', 'смартфон', 'мобильник', 'phone', 'iphone'],
    meanings: ['приложение', 'мобильный', 'связь', 'звонок', 'онлайн', 'цифровой', 'digital', 'уведомление', 'соцсети', 'сервис', 'app', 'интернет', 'чат', 'сообщение', 'доставка'] },
  { id: 'puzzle', name: 'Пазл', names: ['пазл', 'пазлы', 'puzzle'],
    meanings: ['решение', 'задача', 'проблема', 'интеграция', 'сотрудничество', 'партнер', 'партнерство', 'команда', 'вместе', 'совместимость', 'стратегия', 'подбор', 'головоломка', 'соединение', 'match', 'teamwork'] },
  { id: 'coin', name: 'Монета', names: ['монета', 'монетка', 'монеты', 'coin'],
    meanings: ['деньги', 'финансы', 'инвестиции', 'инвестировать', 'экономия', 'сбережения', 'накопления', 'скидка', 'кэшбэк', 'доход', 'прибыль', 'бюджет', 'цена', 'стоимость', 'вклад', 'безопасность', 'money', 'save'] },
  { id: 'headphones', name: 'Наушники', names: ['наушники', 'гарнитура', 'headphones'],
    meanings: ['музыка', 'подкаст', 'звук', 'аудио', 'слушать', 'поддержка', 'помощь', 'консультация', 'отдых', 'фокус', 'концентрация', 'плейлист', 'music', 'podcast', 'support'] },
  { id: 'lamp', name: 'Лампа', names: ['лампа', 'лампу', 'светильник', 'lamp'],
    meanings: ['идея', 'идеи', 'вдохновение', 'креатив', 'озарение', 'рабочее место', 'работа', 'вечер', 'ночь', 'мысль', 'инсайт', 'изобретение', 'idea', 'insight', 'work'] },
  { id: 'flowers', name: 'Цветы', names: ['цветы', 'букет', 'тюльпаны', 'цветок', 'flowers'],
    meanings: ['праздник', 'подарок', 'весна', 'поздравление', 'благодарность', 'спасибо', 'забота', 'уют', 'любовь', 'день рождения', 'март', 'настроение', 'gift', 'thanks', 'care'] },
  { id: 'wallet', name: 'Кошелек', names: ['кошелек', 'кошелёк', 'бумажник', 'wallet'],
    meanings: ['деньги', 'покупки', 'покупка', 'оплата', 'платеж', 'расходы', 'бюджет', 'финансы', 'шопинг', 'зарплата', 'карта', 'кредит', 'payment', 'shopping'] },
  { id: 'folder', name: 'Папка', names: ['папка', 'папку', 'документы', 'folder'],
    meanings: ['документ', 'документы', 'файлы', 'архив', 'отчет', 'отчетность', 'проект', 'организация', 'офис', 'хранение', 'бумаги', 'договор', 'учет', 'бухгалтерия', 'files', 'report', 'office'] },
  { id: 'pen', name: 'Ручка', names: ['ручка', 'ручку', 'карандаш', 'pen'],
    meanings: ['подпись', 'подписать', 'договор', 'письмо', 'заметки', 'запись', 'писать', 'творчество', 'редактура', 'текст', 'контент', 'копирайтинг', 'заявка', 'анкета', 'write', 'sign'] },
];

export const OBJECT_BY_ID = Object.fromEntries(OBJECTS.map((o) => [o.id, o]));

export interface ExtractedItem { file: string; w: number; h: number }
const EX = extracted as { sizes: Partial<Record<SizeId, Record<string, ExtractedItem>>> };

export const AVAILABLE_SIZES: SizeId[] = (['L', 'S'] as SizeId[]).filter((s) => EX.sizes[s]);
export const sizeItem = (size: SizeId, key: string) => EX.sizes[size]?.[key];

/** Palette slots: three background tones (light → dark) and three object accents. Outline #181817 and white never change. */
export interface Palette { id: string; name: string; bg: [string, string, string]; obj: [string, string, string] }

/** The library is drawn in the lilac scheme; every other scheme is a slot-by-slot remap of these six colours. */
export const SOURCE_PALETTE: Palette = { id: 'lilac', name: 'Лиловая', bg: ['#D7CDF5', '#AA9BF0', '#7864D7'], obj: ['#F9ECB0', '#F9A3AA', '#FFE3E1'] };

export const PALETTES: Palette[] = [
  SOURCE_PALETTE,
  { id: 'peach', name: 'Персиковая', bg: ['#FDD7B9', '#FAC896', '#D27532'], obj: ['#F9ECB0', '#80DADA', '#BEEBEB'] },
  { id: 'mint', name: 'Мятная', bg: ['#BEEBEB', '#80DADA', '#5ABEBE'], obj: ['#FFD4F2', '#6D7BFC', '#B6C6FE'] },
];

export interface Format { id: string; name: string; w: number; h: number }
export const FORMATS: Format[] = [
  { id: 'og', name: 'Обложка 1200×630', w: 1200, h: 630 },
  { id: 'square', name: 'Квадрат 1080×1080', w: 1080, h: 1080 },
  { id: 'portrait', name: 'Пост 1080×1350', w: 1080, h: 1350 },
  { id: 'wide', name: 'Широкий 1920×1080', w: 1920, h: 1080 },
];

export type LayoutId = 'title' | 'offset' | 'compact';
export const LAYOUTS: { id: LayoutId; name: string; hint: string }[] = [
  { id: 'title', name: 'Под заголовок', hint: 'объекты справа, слева место для текста' },
  { id: 'offset', name: 'Со смещением', hint: 'композиция уходит за край' },
  { id: 'compact', name: 'Собранно', hint: 'плотная группа по центру' },
];
