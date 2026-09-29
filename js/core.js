/* Общие данные и утилиты: блоки проверки, подсчет баллов, форматирование */
window.DC = window.DC || {};
(function (DC) {
  'use strict';

  const STATUSES = {
    ok:   { label: 'Подтверждено',  short: 'Подтверждено',  icon: '✓', factor: 1 },
    warn: { label: 'С замечаниями', short: 'Замечания',     icon: '!', factor: 0.5 },
    risk: { label: 'Риск',          short: 'Риск',          icon: '✕', factor: 0 },
  };

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
      { id: 'total', label: 'Общая сумма', ph: 'Сумма требований, сум', type: 'money', req: true },
      { id: 'significant', label: 'Существенные производства', ph: 'Номер, взыскатель, предмет, сумма, статус', type: 'textarea', full: true },
      { id: 'date', label: 'Дата проверки', type: 'date', req: true, defaultToday: true },
      { id: 'source', label: 'Официальный источник', ph: 'Бюро принудительного исполнения', req: true },
    ] },
    { n: 12, title: 'Документы на строительство объекта', weight: 10, critical: true, wide: true,
      checklist: [
        { id: 'land', label: 'Право на земельный участок и кадастровые сведения' },
        { id: 'land_use', label: 'Разрешенный вид использования земельного участка' },
        { id: 'apz', label: 'Архитектурно-планировочное задание' },
        { id: 'psd', label: 'Утвержденная проектно-сметная документация' },
        { id: 'expertise', label: 'Положительное заключение экспертизы проекта' },
        { id: 'permit', label: 'Разрешение или регистрация начала строительных работ' },
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
  ];

  const MAX_SCORE = BLOCKS.reduce((s, b) => s + b.weight, 0); // 50

  const LEVELS = {
    high: { title: 'Высокий уровень надежности', short: 'Высокая', risk: 'Низкий риск', rec: 'Рекомендуется к сотрудничеству' },
    mid:  { title: 'Средний уровень надежности', short: 'Средняя', risk: 'Умеренный риск', rec: 'Рекомендуется при условии устранения замечаний' },
    low:  { title: 'Низкий уровень надежности',  short: 'Низкая',  risk: 'Высокий риск', rec: 'Не рекомендуется до устранения критических рисков' },
  };

  /* ---------- утилиты ---------- */
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fname = (n, id) => `b${n}_${id}`;
  const todayISO = () => {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  };
  const fmtDate = (iso) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    return m ? `${m[3]}.${m[2]}.${m[1]}` : (iso || '');
  };
  const fmtDateTime = (iso) => {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const p = (x) => String(x).padStart(2, '0');
    return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  const digits = (v) => String(v || '').replace(/[\s ,.]/g, '');
  const fmtMoney = (v) => {
    const d = digits(v);
    return /^\d+$/.test(d) ? d.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : v;
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

  /* ---------- оценка ---------- */
  function evaluate(data) {
    let score = 0;
    const counts = { ok: 0, warn: 0, risk: 0, none: 0 };
    const rows = BLOCKS.map((b) => {
      const st = STATUSES[data[fname(b.n, 'status')]] ? data[fname(b.n, 'status')] : '';
      const pts = st ? b.weight * STATUSES[st].factor : 0;
      if (st) counts[st] += 1; else counts.none += 1;
      score += pts;
      return { b, st, pts };
    });
    const complete = counts.none === 0;
    let level = null;
    if (complete) {
      const st = (n) => data[fname(n, 'status')];
      if (st(12) === 'risk' || score < 25) level = 'low';
      else if (score < 40 || st(9) === 'risk' || st(11) === 'risk') level = 'mid';
      else level = 'high';
    }
    return { score, counts, rows, complete, level };
  }

  // FNV-1a по содержимому — позволяет сверить распечатку с данными реестра
  function controlCode(data) {
    const s = JSON.stringify(data, Object.keys(data).sort());
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    const hex = h.toString(16).toUpperCase().padStart(8, '0');
    return `${hex.slice(0, 4)}-${hex.slice(4)}`;
  }

  function valueText(f, v) {
    if (!v) return '';
    if (f.type === 'date') return fmtDate(v);
    if (f.type === 'money') return `${fmtMoney(v)} сум`;
    if (f.type === 'percent') return `${v}%`;
    return v;
  }

  Object.assign(DC, {
    STATUSES, BLOCKS, LEVELS, MAX_SCORE,
    esc, fname, todayISO, fmtDate, fmtDateTime, digits, fmtMoney, fmtScore, plural, weightText,
    evaluate, controlCode, valueText,
  });
})(window.DC);
