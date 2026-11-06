/* Общие данные и правила: блоки проверки, подсчет баллов, проверка согласованности.
   Файл работает и в браузере (window.DC), и на сервере (require): сервер считает
   оценку сам и не доверяет расчетам клиента. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DC = Object.assign(root.DC || {}, factory());
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const STATUSES = {
    ok:   { label: 'Подтверждено',  short: 'Подтверждено',  icon: '✓', factor: 1 },
    warn: { label: 'С замечаниями', short: 'Замечания',     icon: '!', factor: 0.5 },
    risk: { label: 'Риск',          short: 'Риск',          icon: '✕', factor: 0 },
    na:   { label: 'Не применимо',  short: 'Не применимо',  icon: '–', factor: null },
  };

  /* Текущая версия набора блоков. Записи импортированного реестра (13 блоков)
     хранятся со schema: 1 и считаются по правилам, действовавшим при их выпуске. */
  const SCHEMA = 2;
  const LEGACY_BLOCKS = 13;
  /* Сколько дней после даты проверки сведения считаются актуальными */
  const VALID_DAYS = 90;
  const HIGH_SHARE = 0.8;
  const MID_SHARE = 0.5;

  const BLOCKS = [
    { n: 1, title: 'Наименование проекта', weight: 2, fields: [
      { id: 'name', label: 'Коммерческое наименование', ph: 'Название ЖК или объекта', req: true },
      { id: 'address', label: 'Адрес объекта', ph: 'Область, город, улица, дом', req: true },
      { id: 'cadastre', label: 'Кадастровый номер', ph: 'Номер земельного участка', req: true },
      { id: 'source', label: 'Источник и дата', ph: 'Кадастр, разрешение, дата', req: true },
    ] },
    { n: 2, title: 'Застройщик', weight: 3, fields: [
      { id: 'legal_name', label: 'Полное юридическое наименование', ph: 'Организационно-правовая форма и название', req: true },
      { id: 'reg_number', label: 'Регистрационный номер', ph: 'Номер и дата регистрации', req: true },
      { id: 'state', label: 'Текущий статус', ph: 'Действует, реорганизация, ликвидация', req: true },
      { id: 'relation', label: 'Связь с проектом', ph: 'Заказчик строительства, инвестор и т.д.', req: true },
    ] },
    { n: 3, title: 'ИНН', weight: 2, fields: [
      { id: 'inn', label: 'ИНН застройщика', ph: '9 цифр', type: 'inn', req: true },
      { id: 'match', label: 'Совпадение с документами', type: 'select', options: ['Совпадает', 'Частично совпадает', 'Не совпадает'], req: true },
      { id: 'source', label: 'Источник и дата проверки', ph: 'Государственный реестр или официальный документ', req: true, full: true },
    ] },
    { n: 4, title: 'Уставный фонд', weight: 3, fields: [
      { id: 'declared', label: 'Заявленный размер', ph: 'Сумма в сумах', type: 'money', req: true },
      { id: 'paid', label: 'Оплаченный размер', ph: 'Если сведения доступны', type: 'money' },
      { id: 'last_change', label: 'Последнее изменение', ph: 'Дата и сумма изменения' },
      { id: 'sufficiency', label: 'Оценка достаточности', ph: 'Комментарий аналитика', req: true },
    ] },
    { n: 5, title: 'Учредители и бенефициары', weight: 4, wide: true, fields: [
      { id: 'founders', label: 'Учредители', ph: 'ФИО или наименование юридических лиц', type: 'textarea', req: true },
      { id: 'shares', label: 'Доли участия', ph: 'Размер доли каждого учредителя', type: 'textarea', req: true },
      { id: 'beneficiaries', label: 'Конечные бенефициары', ph: 'Кто фактически контролирует компанию', type: 'textarea', req: true },
      { id: 'changes', label: 'Изменения за 3 года', ph: 'Смена состава, долей или контроля' },
      { id: 'related', label: 'Связанные компании', ph: 'Ключевые аффилированные организации' },
      { id: 'source', label: 'Источник и дата', ph: 'Реестр, устав, решение участников', req: true },
    ] },
    { n: 6, title: 'Директор', weight: 3, fields: [
      { id: 'fio', label: 'ФИО директора', ph: 'Полностью', req: true },
      { id: 'appointed', label: 'Дата назначения', type: 'date', req: true },
      { id: 'basis', label: 'Основание полномочий', ph: 'Решение, протокол или приказ', req: true },
      { id: 'links', label: 'Связи и ограничения', ph: 'Аффилированность, судебные ограничения' },
    ] },
    { n: 7, title: 'Вид деятельности', weight: 2, fields: [
      { id: 'activity', label: 'Основной вид деятельности', ph: 'Код и расшифровка', req: true },
      { id: 'construction', label: 'Строительство в перечне видов', type: 'select', options: ['Да', 'Нет'], req: true },
      { id: 'experience', label: 'Опыт работы, лет', ph: 'Лет на рынке', type: 'int', req: true },
      { id: 'projects', label: 'Завершенные проекты', ph: 'Количество и примеры' },
    ] },
    { n: 8, title: 'Адрес', weight: 2, fields: [
      { id: 'legal_address', label: 'Юридический адрес', ph: 'Адрес из государственного реестра', req: true, full: true },
      { id: 'office', label: 'Фактический офис', ph: 'Адрес офиса продаж или головного офиса', full: true },
      { id: 'confirmed', label: 'Адрес подтвержден', type: 'select', options: ['Да', 'Частично', 'Нет'], req: true },
      { id: 'source', label: 'Источник и дата', ph: 'Реестр, выезд, договор аренды', req: true },
    ] },
    { n: 9, title: 'Налоговая задолженность', weight: 5, fields: [
      { id: 'amount', label: 'Сумма задолженности', ph: 'Сумма в сумах (0 — если нет)', type: 'money', req: true },
      { id: 'settlement', label: 'Статус расчетов', ph: 'Нет долга, просрочка, рассрочка, спор', req: true },
      { id: 'date', label: 'Дата проверки', type: 'date', req: true, defaultToday: true },
      { id: 'source', label: 'Официальный источник', ph: 'Сервис налогового органа или справка', req: true },
    ] },
    { n: 10, title: 'Свидетельство плательщика НДС', weight: 3, fields: [
      { id: 'number', label: 'Регистрационный номер', ph: 'Номер свидетельства', req: true },
      { id: 'reg_date', label: 'Дата регистрации', type: 'date', req: true },
      { id: 'state', label: 'Текущий статус', ph: 'Действует, приостановлено, аннулировано', req: true },
      { id: 'source', label: 'Источник и дата проверки', ph: 'Официальный налоговый сервис', req: true },
    ] },
    { n: 11, title: 'Задолженность по исполнительным производствам', weight: 5, fields: [
      { id: 'count', label: 'Количество производств', ph: 'Действующих и закрытых', type: 'int', req: true },
      { id: 'total', label: 'Общая сумма', ph: 'Сумма непогашенных требований, сум', type: 'money', req: true },
      { id: 'significant', label: 'Существенные производства', ph: 'Номер, взыскатель, предмет, сумма, статус', type: 'textarea', full: true },
      { id: 'date', label: 'Дата проверки', type: 'date', req: true, defaultToday: true },
      { id: 'source', label: 'Официальный источник', ph: 'Бюро принудительного исполнения', req: true },
    ] },
    { n: 12, title: 'Документы на строительство объекта', weight: 10, critical: true, wide: true,
      checklist: [
        { id: 'land', label: 'Право на земельный участок и кадастровые сведения', key: true },
        { id: 'land_use', label: 'Разрешенный вид использования земельного участка' },
        { id: 'apz', label: 'Архитектурно-планировочное задание' },
        { id: 'psd', label: 'Утвержденная проектно-сметная документация' },
        { id: 'expertise', label: 'Положительное заключение экспертизы проекта', key: true },
        { id: 'permit', label: 'Разрешение или регистрация начала строительных работ', key: true },
        { id: 'supervision', label: 'Договоры авторского и технического надзора' },
        { id: 'contractor', label: 'Документы генерального подрядчика' },
        { id: 'approvals', label: 'Согласования пожарной, экологической и иных служб, если требуются' },
        { id: 'commissioning', label: 'Документы о вводе в эксплуатацию', note: 'для завершенного объекта', optional: true },
      ],
      fields: [
        { id: 'customer', label: 'Заказчик строительства', ph: 'Юридическое лицо и ИНН', req: true },
        { id: 'general', label: 'Генеральный подрядчик', ph: 'Юридическое лицо и ИНН', req: true },
        { id: 'designer', label: 'Проектная организация', ph: 'Наименование и документ о праве работ', req: true },
        { id: 'permit_doc', label: 'Основной разрешительный документ', ph: 'Номер, дата и выдавший орган', req: true },
        { id: 'expertise_doc', label: 'Экспертиза проекта', ph: 'Номер, дата и результат', req: true },
        { id: 'source', label: 'Источник проверки', ph: 'Реестр, заверенные копии, официальный ответ', req: true },
        { id: 'missing', label: 'Отсутствующие документы и риски', ph: 'Перечислите отсутствующие, просроченные или противоречивые документы', type: 'textarea', full: true },
      ] },
    { n: 13, title: 'Срок до завершения строительства', weight: 6, wide: true, fields: [
      { id: 'planned', label: 'Плановая дата завершения', type: 'date', req: true },
      { id: 'expected', label: 'Ожидаемый ввод в эксплуатацию', type: 'date', req: true },
      { id: 'months_left', label: 'Осталось месяцев', ph: 'Расчет на дату проверки', type: 'auto' },
      { id: 'readiness', label: 'Фактическая готовность, %', ph: 'Процент готовности', type: 'percent', req: true },
      { id: 'deviation', label: 'Отклонение от графика', ph: 'Дней или месяцев' },
      { id: 'source', label: 'Подтверждающий источник', ph: 'График, отчет надзора, осмотр', req: true },
      { id: 'assessment', label: 'Оценка темпа и риска переноса', ph: 'Достаточность рабочих ресурсов, финансирования, материалов и темпа выполнения работ', type: 'textarea', req: true, full: true },
    ] },
    { n: 14, title: 'Право на долевое строительство', weight: 5, wide: true, allowNA: true, fields: [
      { id: 'basis', label: 'Основание привлечения средств покупателей', ph: 'Документ, дающий право продавать объект до ввода', req: true },
      { id: 'doc', label: 'Номер и дата документа', ph: 'Номер, дата и выдавший орган', req: true },
      { id: 'scope', label: 'Документ покрывает объект', type: 'select', options: ['Да', 'Частично', 'Нет'], req: true },
      { id: 'encumbrance', label: 'Обременения и ограничения', ph: 'Залог, арест, споры по участку или объекту', type: 'textarea', req: true },
      { id: 'funds', label: 'Порядок приема средств покупателей', ph: 'Счет, получатель, условия', type: 'textarea' },
      { id: 'source', label: 'Источник и дата проверки', ph: 'Реестр, заверенные копии, официальный ответ', req: true },
    ] },
    { n: 15, title: 'Договор с покупателем', weight: 5, wide: true, allowNA: true, fields: [
      { id: 'contract', label: 'Вид и редакция договора', ph: 'Наименование, номер и дата проекта договора', req: true },
      { id: 'parties', label: 'Стороны совпадают с документами', type: 'select', options: ['Да', 'Частично', 'Нет'], req: true },
      { id: 'object_match', label: 'Характеристики объекта совпадают с проектом', type: 'select', options: ['Да', 'Частично', 'Нет'], req: true },
      { id: 'price', label: 'Цена и порядок оплаты', ph: 'Фиксированная цена, условия пересмотра, график', type: 'textarea', req: true },
      { id: 'deadline', label: 'Срок передачи и неустойка', ph: 'Срок, ответственность застройщика за просрочку', type: 'textarea', req: true },
      { id: 'exit', label: 'Расторжение и возврат средств', ph: 'Условия выхода покупателя и сроки возврата', type: 'textarea', req: true },
      { id: 'clauses', label: 'Опасные пункты и требуемые формулировки', ph: 'Пункт договора, чем опасен, какую формулировку требовать', type: 'textarea', full: true },
      { id: 'source', label: 'Источник проверки', ph: 'Проект договора от застройщика, дата получения', req: true, full: true },
    ] },
  ];

  const blocksFor = (data) => (data && data.schema === 1 ? BLOCKS.filter((b) => b.n <= LEGACY_BLOCKS) : BLOCKS);
  const MAX_SCORE = BLOCKS.reduce((s, b) => s + b.weight, 0);

  const META_FIELDS = [
    { id: 'check_date', label: 'Дата проверки', type: 'date', req: true },
    { id: 'purpose', label: 'Цель проверки', req: true, options: ['Инвестиционная оценка', 'Покупка недвижимости', 'Кредитование / залог', 'Партнерство / подряд', 'Due diligence сделки', 'Иное'] },
    { id: 'partner_disclosure', label: 'Отношения с застройщиком', req: true, options: ['Партнерских отношений нет', 'Есть партнерство: возможна комиссия при сделке'] },
  ];
  const CONCLUSION_FIELDS = [
    { id: 'strengths', label: 'Подтвержденные сильные стороны', req: true },
    { id: 'risks', label: 'Выявленные риски', req: true },
    { id: 'requests', label: 'Что запросить до заключения договора' },
    { id: 'recommendation', label: 'Итоговая рекомендация', req: true },
    { id: 'reviewer', label: 'Проверку выполнил', req: true },
    { id: 'sign_note', label: 'Подпись и печать' },
  ];

  const RECOMMENDATIONS = [
    'Рекомендуется к сотрудничеству',
    'Рекомендуется при условии устранения замечаний',
    'Не рекомендуется до устранения критических рисков',
    'Не рекомендуется',
  ];

  const LEVELS = {
    high: { title: 'Высокий уровень надежности', short: 'Высокая', risk: 'Низкий риск', rec: RECOMMENDATIONS[0], allowed: RECOMMENDATIONS },
    mid:  { title: 'Средний уровень надежности', short: 'Средняя', risk: 'Умеренный риск', rec: RECOMMENDATIONS[1], allowed: RECOMMENDATIONS.slice(1) },
    low:  { title: 'Низкий уровень надежности',  short: 'Низкая',  risk: 'Высокий риск', rec: RECOMMENDATIONS[2], allowed: RECOMMENDATIONS.slice(2) },
  };

  const ISSUER = { name: 'ООО «ALLIANCE PROPERTY»', brand: 'Alliance Group', inn: '313279207', phone: '+998 97 134-32-33' };

  /* ---------- утилиты ---------- */
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fname = (n, id) => `b${n}_${id}`;
  /* Дата всегда по Ташкенту: и браузер, и сервер на UTC считают одинаково */
  const todayISO = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(d);
  const fmtDate = (iso) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    return m ? `${m[3]}.${m[2]}.${m[1]}` : (iso || '');
  };
  const fmtDateTime = (iso) => {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return new Intl.DateTimeFormat('ru-RU', { timeZone: 'Asia/Tashkent', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d).replace(',', '');
  };
  const addDays = (iso, days) => {
    const d = new Date(`${iso}T00:00:00Z`);
    if (isNaN(d)) return '';
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };
  const validUntil = (checkDate) => addDays(checkDate, VALID_DAYS);

  /* Сумма: «1 000 000», «1000,50», «1000.50». Разделитель дроби нельзя выбрасывать,
     иначе 1000.50 превращается в 100 050. */
  const moneyRe = /^\d+([.,]\d{1,2})?$/;
  const compact = (v) => String(v ?? '').replace(/[\s ]/g, '');
  const isMoney = (v) => moneyRe.test(compact(v));
  const moneyValue = (v) => (isMoney(v) ? parseFloat(compact(v).replace(',', '.')) : NaN);
  const fmtMoney = (v) => {
    if (!isMoney(v)) return v;
    const [int, frac] = compact(v).split(/[.,]/);
    const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return frac ? `${grouped},${frac}` : grouped;
  };
  const fmtScore = (x) => (Number.isInteger(x) ? String(x) : x.toFixed(1).replace('.', ','));
  const plural = (n, one, few, many) => {
    const a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return many;
    if (b > 1 && b < 5) return few;
    if (b === 1) return one;
    return many;
  };
  const weightText = (w) => `${w} ${plural(w, 'балл', 'балла', 'баллов')}`;

  function monthsLeft(fromISO, toISO) {
    if (!fromISO || !toISO) return '';
    const a = new Date(fromISO), b = new Date(toISO);
    if (isNaN(a) || isNaN(b)) return '';
    if (b < a) return 'Срок истек';
    let m = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
    if (b.getDate() < a.getDate()) m -= 1;
    return String(Math.max(0, m));
  }

  /* ---------- оценка ---------- */
  function evaluate(data) {
    const blocks = blocksFor(data);
    let score = 0, max = 0;
    const counts = { ok: 0, warn: 0, risk: 0, na: 0, none: 0 };
    const rows = blocks.map((b) => {
      const raw = data[fname(b.n, 'status')];
      let st = STATUSES[raw] ? raw : '';
      if (st === 'na' && !b.allowNA) st = '';
      const applicable = st !== 'na';
      const pts = st && applicable ? b.weight * STATUSES[st].factor : 0;
      if (st) counts[st] += 1; else counts.none += 1;
      score += pts;
      if (applicable) max += b.weight;
      return { b, st, pts };
    });
    const complete = counts.none === 0;
    let level = null;
    if (complete) {
      const st = (n) => data[fname(n, 'status')];
      const share = max ? score / max : 0;
      if (data.schema === 1) {
        if (st(12) === 'risk' || share < MID_SHARE) level = 'low';
        else if (share < HIGH_SHARE || st(9) === 'risk' || st(11) === 'risk') level = 'mid';
        else level = 'high';
      } else if (st(12) === 'risk' || st(14) === 'risk' || share < MID_SHARE) {
        level = 'low';
      } else if (share < HIGH_SHARE
        || [9, 11, 15].some((n) => st(n) === 'risk')
        || [9, 11, 12, 14].some((n) => st(n) === 'warn')) {
        /* Замечание по долгам или документам не совместимо с «низким риском»,
           сколько бы баллов ни набрали остальные блоки */
        level = 'mid';
      } else {
        level = 'high';
      }
    }
    return { score, max, counts, rows, complete, level };
  }

  /* Правила шкалы печатаются на документе дословно: читатель должен понимать,
     почему 54 балла из 60 могут дать средний уровень */
  function scaleNote(data) {
    if (data && data.schema === 1) {
      return 'Шкала: 40–50 баллов — высокая, 25–39 — средняя, менее 25 — низкая надежность. Риск по блоку 12 — низкая надежность; риск по блоку 9 или 11 — не выше средней.';
    }
    return 'Шкала: от 80% применимых баллов — высокая, 50–79% — средняя, менее 50% — низкая надежность. Риск по блоку 12 или 14 — низкая надежность. Риск по блоку 9, 11 или 15, а также замечания по блоку 9, 11, 12 или 14 — не выше средней.';
  }

  function valueText(f, v) {
    if (!v) return '';
    if (f.type === 'date') return fmtDate(v);
    if (f.type === 'money') return `${fmtMoney(v)} сум`;
    if (f.type === 'percent') return `${v}%`;
    return v;
  }

  /* ---------- проверка данных ---------- */
  function fieldProblem(f, raw) {
    const v = String(raw ?? '').trim();
    if (f.req && !v) return 'обязательное поле';
    if (!v) return '';
    switch (f.type) {
      case 'inn': return /^\d{9}$/.test(v) ? '' : 'ИНН должен состоять из 9 цифр';
      case 'money': return isMoney(v) ? '' : 'укажите сумму цифрами';
      case 'int': return /^\d+$/.test(v) ? '' : 'целое неотрицательное число';
      case 'percent': return /^\d+(\.\d+)?$/.test(v) && +v >= 0 && +v <= 100 ? '' : 'значение от 0 до 100';
      case 'date': return /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(new Date(v)) ? '' : 'укажите дату';
      case 'select': return f.options.includes(v) ? '' : 'выберите значение из списка';
      default: return '';
    }
  }

  /** Противоречия между статусом блока и данными в нем */
  function consistencyProblems(data, today = todayISO()) {
    const out = [];
    const st = (n) => data[fname(n, 'status')];
    const g = (n, id) => String(data[fname(n, id)] ?? '').trim();
    const add = (n, id, text) => out.push({ block: n, field: fname(n, id), text });

    if (st(3) === 'ok' && g(3, 'match') && g(3, 'match') !== 'Совпадает') add(3, 'match', 'статус «Подтверждено» невозможен, если ИНН не совпадает с документами');
    if (st(4) !== 'risk' && moneyValue(g(4, 'paid')) > moneyValue(g(4, 'declared'))) add(4, 'paid', 'оплаченный размер больше заявленного');
    if (st(7) === 'ok' && g(7, 'construction') === 'Нет') add(7, 'construction', 'статус «Подтверждено» невозможен, если строительства нет в перечне видов');
    if (st(8) === 'ok' && g(8, 'confirmed') && g(8, 'confirmed') !== 'Да') add(8, 'confirmed', 'статус «Подтверждено» невозможен, если адрес подтвержден не полностью');
    if (st(9) === 'ok' && moneyValue(g(9, 'amount')) > 0) add(9, 'amount', 'статус «Подтверждено» невозможен при налоговой задолженности');
    if (st(11) === 'ok' && moneyValue(g(11, 'total')) > 0) add(11, 'total', 'статус «Подтверждено» невозможен при непогашенных требованиях');

    const blk12 = BLOCKS.find((b) => b.n === 12);
    const docs = Array.isArray(data[fname(12, 'docs')]) ? data[fname(12, 'docs')] : [];
    const missingReq = blk12.checklist.filter((c) => !c.optional && !docs.includes(c.id));
    const missingKey = blk12.checklist.filter((c) => c.key && !docs.includes(c.id));
    if (st(12) === 'ok' && missingReq.length) add(12, 'docs', `для статуса «Подтверждено» отметьте все обязательные документы (не отмечено: ${missingReq.length})`);
    if (st(12) === 'warn' && missingKey.length) add(12, 'docs', `нет ключевых документов (${missingKey.map((c) => c.label).join('; ')}): такой блок можно оценить только как «Риск»`);
    if (st(12) === 'warn' && !g(12, 'missing')) add(12, 'missing', 'при замечаниях перечислите отсутствующие или спорные документы');

    if (data.schema !== 1) {
      if (st(14) === 'ok' && g(14, 'scope') && g(14, 'scope') !== 'Да') add(14, 'scope', 'статус «Подтверждено» невозможен, если документ покрывает объект не полностью');
      if (st(15) === 'ok' && g(15, 'parties') && g(15, 'parties') !== 'Да') add(15, 'parties', 'статус «Подтверждено» невозможен, если стороны совпадают не полностью');
      if (st(15) === 'ok' && g(15, 'object_match') && g(15, 'object_match') !== 'Да') add(15, 'object_match', 'статус «Подтверждено» невозможен, если характеристики объекта расходятся');
    }

    const check = String(data.check_date || '');
    [[6, 'appointed', 'дата назначения'], [9, 'date', 'дата проверки'], [10, 'reg_date', 'дата регистрации'], [11, 'date', 'дата проверки']].forEach(([n, id, name]) => {
      if (check && g(n, id) && g(n, id) > check) add(n, id, `${name} позже даты проверки заключения`);
    });
    if (g(13, 'planned') && g(13, 'expected') && g(13, 'expected') < g(13, 'planned')) {
      add(13, 'expected', 'ожидаемый ввод раньше плановой даты: проверьте даты');
    }
    if (check && check > today) out.push({ block: 0, field: 'check_date', text: 'дата проверки не может быть в будущем' });

    const ev = evaluate(data);
    if (ev.complete && data.recommendation && !LEVELS[ev.level].allowed.includes(data.recommendation)) {
      out.push({ block: 0, field: 'recommendation', text: `рекомендация противоречит результату: уровень «${LEVELS[ev.level].short}» допускает только «${LEVELS[ev.level].allowed.join('», «')}»` });
    }
    return out;
  }

  /** Полная проверка перед выпуском. Сервер и браузер вызывают одну и ту же функцию. */
  function validateData(data, today) {
    const errors = [];
    const push = (where, field, label, text) => errors.push({ where, field, label, text });
    META_FIELDS.forEach((f) => {
      const p = fieldProblem(f, data[f.id]);
      if (p) push('Общие сведения', f.id, f.label, p);
      else if (f.options && !f.options.includes(data[f.id])) push('Общие сведения', f.id, f.label, 'выберите значение из списка');
    });
    blocksFor(data).forEach((b) => {
      const status = data[fname(b.n, 'status')];
      const known = STATUSES[status] && (status !== 'na' || b.allowNA);
      if (!known) push(`Блок ${b.n}`, `seg-${b.n}`, 'Статус проверки', 'не выбран');
      if (status === 'na' && b.allowNA) {
        if (!String(data[fname(b.n, 'source')] ?? '').trim()) push(`Блок ${b.n}`, fname(b.n, 'source'), 'Основание', 'укажите, почему блок не применим');
        return;
      }
      b.fields.forEach((f) => {
        if (f.type === 'auto') return;
        const p = fieldProblem(f, data[fname(b.n, f.id)]);
        if (p) push(`Блок ${b.n}`, fname(b.n, f.id), f.label, p);
      });
    });
    CONCLUSION_FIELDS.forEach((f) => {
      const p = fieldProblem(f, data[f.id]);
      if (p) push('Заключение', f.id, f.label, p);
    });
    if (data.recommendation && !RECOMMENDATIONS.includes(data.recommendation)) push('Заключение', 'recommendation', 'Итоговая рекомендация', 'выберите значение из списка');
    consistencyProblems(data, today).forEach((p) => {
      const where = p.block ? `Блок ${p.block}` : (p.field === 'check_date' ? 'Общие сведения' : 'Заключение');
      push(where, p.field, 'Согласованность', p.text);
    });
    return errors;
  }

  /** Оставляет только известные поля и обрезает длину: данные приходят от клиента */
  function sanitize(input) {
    const src = input && typeof input === 'object' ? input : {};
    const out = { schema: src.schema === 1 ? 1 : SCHEMA };
    const str = (v, max) => String(v ?? '').trim().slice(0, max);
    [...META_FIELDS, ...CONCLUSION_FIELDS].forEach((f) => { out[f.id] = str(src[f.id], 1500); });
    blocksFor(out).forEach((b) => {
      const st = fname(b.n, 'status');
      out[st] = STATUSES[src[st]] && (src[st] !== 'na' || b.allowNA) ? src[st] : '';
      b.fields.forEach((f) => {
        if (f.type !== 'auto') out[fname(b.n, f.id)] = str(src[fname(b.n, f.id)], f.type === 'textarea' ? 1500 : 300);
      });
      if (b.checklist) {
        const name = fname(b.n, 'docs');
        const ids = b.checklist.map((c) => c.id);
        out[name] = Array.isArray(src[name]) ? ids.filter((id) => src[name].includes(id)) : [];
      }
    });
    out[fname(13, 'months_left')] = monthsLeft(out.check_date, out[fname(13, 'planned')]);
    return out;
  }

  return {
    STATUSES, BLOCKS, LEVELS, MAX_SCORE, SCHEMA, VALID_DAYS, ISSUER, RECOMMENDATIONS, META_FIELDS, CONCLUSION_FIELDS,
    esc, fname, todayISO, fmtDate, fmtDateTime, addDays, validUntil, compact, isMoney, moneyValue, fmtMoney, fmtScore, plural, weightText, monthsLeft,
    blocksFor, evaluate, scaleNote, valueText, fieldProblem, consistencyProblems, validateData, sanitize,
  };
});
