/**
 * Функции для инъекции на страницы 2gis.ru через chrome.scripting.executeScript.
 *
 * Используются сервис-воркером для:
 * 1. extractBuildingLink — на странице поиска находит ссылку на карточку здания
 * 2. parseBuildingCard — на карточке здания читает данные (этажи, год, подъезды, материал)
 *
 * ВАЖНО: эти функции сериализуются и выполняются в контексте вкладки,
 * поэтому они не должны ссылаться на внешний контекст (замыкания).
 */

/**
 * На странице поиска 2ГИС (`/search/...`) находит ссылку на карточку здания (`/geo/{id}`).
 * SPA рендерит результаты асинхронно, поэтому функция может вернуть null при первом вызове.
 *
 * Возвращает абсолютный URL вида `https://2gis.ru/{city}/geo/{id}` или null.
 */
export function extractBuildingLink(): string | null {
  const links = Array.from(
    document.querySelectorAll<HTMLAnchorElement>('a[href*="/geo/"]'),
  );

  // Сначала ищем ссылку, у которой в stat-параметре указан type: "building"
  for (const link of links) {
    const href = link.href;
    const m = href.match(/stat=([^&]+)/);
    if (!m) continue;
    try {
      // stat параметр URL-encoded base64 — сначала decodeURIComponent, потом atob
      const b64 = decodeURIComponent(m[1]);
      const decoded = JSON.parse(atob(b64));
      const item = decoded.placeItem || decoded;
      const entityType = item.entity?.type || item.type;
      if (entityType === 'building') {
        const idMatch = href.match(/\/geo\/(\d+)/);
        if (idMatch) {
          const citySegment = location.pathname.split('/')[1] || 'novosibirsk';
          return `${location.origin}/${citySegment}/geo/${idMatch[1]}`;
        }
      }
    } catch {
      // битый stat, пропускаем
    }
  }

  // Fallback: ищем ссылку, чей текст похож на адрес здания
  // (например, "Улица Дуси Ковальчук, 252", "Красный проспект, 17")
  for (const link of links) {
    if (link.href.includes('/firm/')) continue;
    const text = (link.innerText || '').trim();
    // должно быть похоже на адрес: есть цифра (номер дома)
    if (/\d/.test(text) && text.length > 5 && text.length < 200) {
      const idMatch = link.href.match(/\/geo\/(\d+)/);
      if (idMatch) {
        const citySegment = location.pathname.split('/')[1] || 'novosibirsk';
        return `${location.origin}/${citySegment}/geo/${idMatch[1]}`;
      }
    }
  }

  return null;
}

export interface ParsedBuildingData {
  floors_count: number | null;
  build_year: number | null;
  entrances_count: number | null;
  wall_material_text: string | null;
  ceiling_material_text: string | null;
}

/**
 * На карточке здания (`/geo/{id}`) читает данные из DOM.
 * 2ГИС рендерит карточку на сервере (SSR), поэтому данные доступны сразу после загрузки.
 *
 * Структура DOM:
 *   <li>
 *     <div><span>Год постройки</span></div>
 *     <div><span>2004</span></div>
 *   </li>
 *
 * Также данные в шапке: "16 этажей", "В доме 2 подъезда".
 */
export function parseBuildingCard(): ParsedBuildingData {
  const result: ParsedBuildingData = {
    floors_count: null,
    build_year: null,
    entrances_count: null,
    wall_material_text: null,
    ceiling_material_text: null,
  };

  // Метод 1: пары label→value внутри <li>
  // Структура: <li><div><span>LABEL</span></div><div><span>VALUE</span></div></li>
  // Берём последний span внутри li как значение (не span:last-child — это CSS псевдо-класс,
  // который возвращает первый найденный elem, являющийся last-child своего родителя).
  const labelSpans = Array.from(document.querySelectorAll('span'));
  for (const span of labelSpans) {
    const text = (span.textContent || '').trim();
    if (!text) continue;
    const li = span.closest('li') || span.parentElement?.parentElement;
    if (!li) continue;

    // Значение — последний span внутри этого li
    const allSpans = li.querySelectorAll('span');
    if (allSpans.length < 2) continue;
    const valueSpan = allSpans[allSpans.length - 1];
    const valueText = (valueSpan.textContent || '').trim();

    if (text === 'Год постройки' && !result.build_year) {
      const year = parseInt(valueText, 10);
      if (year > 1800 && year < 2100) result.build_year = year;
    } else if (text === 'Материал стен' && !result.wall_material_text) {
      if (valueText && valueText !== '—' && valueText !== 'Нет данных' && valueText !== 'Материал стен') {
        result.wall_material_text = valueText;
      }
    } else if (text === 'Перекрытия' && !result.ceiling_material_text) {
      if (valueText && valueText !== '—' && valueText !== 'Нет данных' && valueText !== 'Перекрытия') {
        result.ceiling_material_text = valueText;
      }
    }
  }

  // Метод 2: данные в шапке карточки
  const allText = document.body.innerText || '';

  // "В доме N подъезда" или "В доме N подъездов"
  if (result.entrances_count === null) {
    const m = allText.match(/В доме\s+(\d+)\s+подъезд[а-я]*/i);
    if (m) result.entrances_count = parseInt(m[1], 10);
  }

  // "N этажей" / "N этажа" / "N этаж" в шапке
  if (result.floors_count === null) {
    const m = allText.match(/(\d+)\s+этаж(?:а|ей|е|у)?/i);
    if (m) {
      const n = parseInt(m[1], 10);
      // защита от ложных срабатываний (этажей в РФ обычно 1-200)
      if (n > 0 && n < 300) result.floors_count = n;
    }
  }

  return result;
}
