// Курированный фид витрин для B24U (клиент Сибвитрина, sibvitr.ru).
// Источник — WooCommerce Store API (JSON). Берём 30 отобранных разнотипных витрин
// по ID, обогащаем description типом витрины + ценовой зоной (ретрив B24U — по name+description),
// эмитим YML. Политика: витрины — с ценой на карточке (решение владельца 2026-07-08).
//
// Запуск: node build-feed.mjs  → public/feed.xml
// Инварианты авто-ребилда (04-feeds §21.5): таймаут на fetch, guard «не писать пустой фид».

import { writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';

const STORE_API = 'https://sibvitr.ru/wp-json/wc/store/v1/products';
const OUT_PATH = 'public/feed.xml';

// 30 отобранных витрин: id → канонический тип + синонимы для ретрива.
// Тип и синонимы дописываются в description, чтобы разговорные запросы попадали в карточку.
const ITEMS = [
  // Алюминиевый профиль (система ВА)
  { id: 10838, type: 'витрина из алюминиевого профиля с подиумом', syn: 'алюминиевая профильная витрина ВА подиум' },
  { id: 10581, type: 'витрина из алюминиевого профиля с подиумом', syn: 'алюминиевая профильная витрина ВА задняя стенка ЛДВП' },
  { id: 10583, type: 'витрина угловая из алюминиевого профиля', syn: 'угловая алюминиевая витрина ВА угол' },
  { id: 10585, type: 'витрина с накопителем из алюминиевого профиля', syn: 'витрина с накопителем ящик алюминиевая ВА' },
  { id: 10587, type: 'витрина высокая с накопителем из алюминиевого профиля', syn: 'высокая витрина с накопителем алюминиевая ВА' },
  // Стеклянные с подсветкой (система В)
  { id: 10990, type: 'витрина стеклянная с подсветкой', syn: 'стеклянная витрина подсветка LED В-серия' },
  { id: 10992, type: 'витрина зеркальная с подсветкой', syn: 'зеркальная витрина с подсветкой стекло' },
  { id: 10963, type: 'витрина стеклянная малая', syn: 'маленькая настольная стеклянная витрина небольшая' },
  { id: 10961, type: 'витрина стеклянная с подсветкой и накопителем', syn: 'стеклянная витрина подсветка накопитель' },
  { id: 10964, type: 'витрина стеклянная с подсветкой глубиной 30 см', syn: 'узкая стеклянная витрина подсветка глубина 30' },
  { id: 33676, type: 'витрина угловая стеклянная с подсветкой', syn: 'угловая стеклянная витрина подсветка угол' },
  { id: 10941, type: 'витрина с подсветкой и экономпанелью', syn: 'витрина подсветка экономпанель дверцы' },
  // С экономпанелью (системы FIN/OVG)
  { id: 35774, type: 'витрина открытая с экономпанелью', syn: 'открытая витрина экономпанель без стекла FIN' },
  { id: 35772, type: 'витрина закрытая с экономпанелью', syn: 'закрытая витрина экономпанель стекло FIN' },
  { id: 35746, type: 'витрина закрытая с экономпанелью', syn: 'закрытая витрина экономпанель OVG' },
  { id: 35764, type: 'витрина закрытая высокая с экономпанелью', syn: 'высокая закрытая витрина экономпанель OVG большая' },
  // ЛДСП со стеклом (система ВК)
  { id: 10870, type: 'витрина настольная стеклянная «стаканчик» ЛДСП', syn: 'настольная витрина стаканчик прилавочная малая ЛДСП' },
  { id: 10872, type: 'витрина стеклянная Люкс ЛДСП', syn: 'стеклянная витрина люкс ЛДСП ВК' },
  { id: 10904, type: 'шкаф-витрина с накопителем ЛДСП', syn: 'шкаф витрина накопитель ЛДСП ВК' },
  { id: 10873, type: 'шкаф-витрина с подиумом ЛДСП', syn: 'шкаф витрина подиум ЛДСП ВК' },
  { id: 10906, type: 'витрина с накопителем ЛДСП', syn: 'витрина накопитель ЛДСП ВК-700' },
  { id: 10869, type: 'витрина стеклянная с замком ЛДСП', syn: 'витрина с замком запирающаяся стеклянная ЛДСП' },
  // Крупноформатные / готовые решения
  { id: 9924, type: 'витрина прямая (готовое решение)', syn: 'большая прямая витрина торговая под ключ' },
  { id: 9932, type: 'витрина угловая (готовое решение)', syn: 'большая угловая витрина торговая под ключ' },
  { id: 9934, type: 'обувная витрина', syn: 'витрина для обуви обувной магазин' },
  { id: 9926, type: 'островок для торгового центра', syn: 'островная витрина остров ТЦ торговый остров' },
  { id: 10128, type: 'прилавок горка', syn: 'прилавок горка торговый прилавок витрина-прилавок' },
  { id: 9936, type: 'прилавок для магазина', syn: 'торговый прилавок для магазина витрина-прилавок' },
  { id: 9928, type: 'прилавок П-образный', syn: 'П-образный прилавок кассовый ресепшн большой' },
  { id: 9930, type: 'прилавок лофт', syn: 'прилавок в стиле лофт торговый металл дерево' },
];

// Ценовые зоны под шкалу витрин (11k–200k). RAG числа не сравнивает — кладём словами.
function priceZone(p) {
  if (!p) return '';
  if (p < 15000)  return 'до 15000 руб недорогая бюджетная';
  if (p < 20000)  return 'до 20000 руб средняя цена';
  if (p < 30000)  return 'до 30000 руб средний сегмент';
  if (p < 50000)  return 'до 50000 руб выше среднего';
  if (p < 100000) return 'до 100000 руб премиум большая';
  return 'от 100000 руб премиум крупноформатная под ключ';
}

const clean = s => String(s ?? '').replace(/<[^>]+>/g, ' ')
  .replace(/&#8212;/g, '—').replace(/&#8211;/g, '–').replace(/&nbsp;/g, ' ')
  .replace(/&laquo;/g, '«').replace(/&raquo;/g, '»').replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ').trim();

const xmlEsc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function fetchProducts(ids) {
  const url = `${STORE_API}?include=${ids.join(',')}&per_page=${ids.length}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (b24u-feed-builder)' },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Store API status ${res.status}`);
  return res.json();
}

function vendorCode(p) {
  const sku = String(p.sku || '').replace(/-parent$/i, '').trim();
  if (sku) return sku;
  const m = String(p.name || '').match(/^([A-ZА-Я]{1,4}[-.\s]?[\wА-Я.\-]*)/);
  return m ? m[1].trim() : String(p.id);
}

(async () => {
  const byId = {};
  let raw;
  try {
    raw = await fetchProducts(ITEMS.map(i => i.id));
  } catch (e) {
    // §21.5 инвариант 3: RU-источник может геоблокнуть IP GH-раннера.
    // Источник недоступен → оставляем last-known-good seed (public/feed.xml из checkout),
    // джоб не падает, письмо владельцу не летит.
    console.error(`Source unreachable: ${e.message}`);
    process.exit(existsSync(OUT_PATH) ? 0 : 1);
  }
  raw.forEach(p => { byId[p.id] = p; });

  const cats = {};
  const offers = [];
  for (const it of ITEMS) {
    const p = byId[it.id];
    if (!p) { console.warn(`WARN: id ${it.id} not returned`); continue; }
    const price = parseInt(p.prices && p.prices.price || '0', 10);
    const cat = (p.categories || []).find(c => [603,604,663,661,634,332].includes(c.id)) || (p.categories || [])[0];
    const catId = cat ? cat.id : 603;
    if (cat) cats[catId] = cat.name;
    const priceLine = price ? `Цена от ${price} ₽. Изготавливается на заказ по индивидуальным размерам, в наличии не держится, точную стоимость рассчитывает менеджер.` : 'Изготавливается на заказ, стоимость рассчитывает менеджер.';
    // priceLine + тип В НАЧАЛЕ: B24U обрезает описание оффера, хвост срезается — важное держим спереди
    const desc = [priceLine, `Тип: ${it.type}.`, it.syn, priceZone(price), clean(p.short_description || p.description)]
      .filter(Boolean).join(' ');
    offers.push({
      id: p.id, available: p.is_in_stock !== false,
      name: clean(p.name), url: p.permalink, price, catId,
      picture: (p.images && p.images[0] && p.images[0].src) || '',
      vendorCode: vendorCode(p), description: desc,
    });
  }

  // Guard: не писать пустой фид (04-feeds §21.5 инвариант 4)
  if (offers.length === 0) {
    console.error('EMPTY feed — abort, keep last-known-good.');
    process.exit(existsSync(OUT_PATH) ? 0 : 1);
  }

  const date = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const catXml = Object.entries(cats)
    .map(([id, name]) => `      <category id="${id}">${xmlEsc(name)}</category>`).join('\n');
  const offXml = offers.map(o => `    <offer id="${o.id}" available="${o.available}">
      <name>${xmlEsc(o.name)}</name>
      <url>${xmlEsc(o.url)}</url>
      <currencyId>RUR</currencyId>
      <categoryId>${o.catId}</categoryId>
      <picture>${xmlEsc(o.picture)}</picture>
      <vendor>Сибвитрина</vendor>
      <vendorCode>${xmlEsc(o.vendorCode)}</vendorCode>
      <description>${xmlEsc(o.description)}</description>
    </offer>`).join('\n');

  const yml = `<?xml version="1.0" encoding="UTF-8"?>
<yml_catalog date="${date}">
  <shop>
    <name>Сибвитрина</name>
    <company>Сибвитрина</company>
    <url>https://sibvitr.ru</url>
    <currencies>
      <currency id="RUR" rate="1"/>
    </currencies>
    <categories>
${catXml}
    </categories>
    <offers>
${offXml}
    </offers>
  </shop>
</yml_catalog>
`;

  if (!existsSync('public')) mkdirSync('public', { recursive: true });
  writeFileSync(OUT_PATH, yml, 'utf8');
  console.log(`OK: ${offers.length} offers → ${OUT_PATH} (${yml.length} bytes)`);
})();
