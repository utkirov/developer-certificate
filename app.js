(() => {
  'use strict';

  /* =========================================================
     Описание блоков проверки (13 блоков, сумма весов = 50)
     ========================================================= */
  const STATUSES = {
    ok:   { label: 'Подтверждено',  factor: 1 },
    warn: { label: 'С замечаниями', factor: 0.5 },
    risk: { label: 'Риск',          factor: 0 },
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
  const STORAGE_KEY = 'developer-certificate:v1';

  /* ========================= утилиты ========================= */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fname = (n, id) => `b${n}_${id}`;
  const todayISO = () => {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  };
  const fmtDate = (iso) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    return m ? `${m[3]}.${m[2]}.${m[1]}` : (iso || '');
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

  /* ========================= рендер формы ========================= */
  const form = $('#checkForm');

  function controlHtml(b, f) {
    const name = fname(b.n, f.id);
    const attrs = `id="${name}" name="${name}" data-block="${b.n}" data-label="${esc(f.label)}"${f.req ? ' data-required="1"' : ''}${f.type ? ` data-type="${f.type}"` : ''}`;
    const ph = f.ph ? ` placeholder="${esc(f.ph)}"` : '';
    switch (f.type) {
      case 'textarea': return `<textarea ${attrs}${ph} rows="3"></textarea>`;
      case 'select': return `<select ${attrs}><option value="">Выберите</option>${f.options.map((o) => `<option>${esc(o)}</option>`).join('')}</select>`;
      case 'date': return `<input type="date" ${attrs}>`;
      case 'money': return `<input type="text" inputmode="numeric" ${attrs}${ph}>`;
      case 'inn': return `<input type="text" inputmode="numeric" maxlength="9" ${attrs}${ph}>`;
      case 'int': return `<input type="number" min="0" step="1" ${attrs}${ph}>`;
      case 'percent': return `<input type="number" min="0" max="100" step="1" ${attrs}${ph}>`;
      case 'auto': return `<input type="text" readonly tabindex="-1" ${attrs}${ph}>`;
      default: return `<input type="text" ${attrs}${ph}>`;
    }
  }

  function blockHtml(b) {
    const statusName = fname(b.n, 'status');
    const checklist = b.checklist ? `
      <div class="label">Отметьте проверенные документы</div>
      <div class="checklist">
        ${b.checklist.map((c) => `
          <label class="check">
            <input type="checkbox" name="${fname(b.n, 'docs')}" value="${c.id}">
            <span>${esc(c.label)}${c.note ? `<small>— ${esc(c.note)}</small>` : ''}</span>
          </label>`).join('')}
        <div class="checklist-count" id="docsCount"></div>
      </div>` : '';
    return `
      <article class="block${b.wide ? ' wide' : ''}" id="block-${b.n}" data-n="${b.n}">
        <div class="block-head">
          <div class="num">${b.n}</div>
          <div class="block-title">
            <h3>${esc(b.title)}</h3>
            <div class="weight${b.critical ? ' crit' : ''}">Вес: ${weightText(b.weight)}${b.critical ? ' — критический блок' : ''}</div>
          </div>
          <select class="status-select" name="${statusName}" id="${statusName}" data-block="${b.n}" data-status="1" data-required="1" aria-label="Статус проверки блока ${b.n}">
            <option value="">Статус проверки</option>
            ${Object.entries(STATUSES).map(([k, s]) => `<option value="${k}">${s.label}</option>`).join('')}
          </select>
        </div>
        ${checklist}
        <div class="fields${b.wide ? ' cols-3' : ''}">
          ${b.fields.map((f) => `
            <label class="field${f.full ? ' full' : ''}">
              <span class="label">${esc(f.label)}${f.req ? ' <i class="req">*</i>' : ''}</span>
              ${controlHtml(b, f)}
            </label>`).join('')}
        </div>
      </article>`;
  }

  $('#blocks').innerHTML = BLOCKS.map(blockHtml).join('');

  /* ========================= сбор данных ========================= */
  function collect() {
    const data = {};
    for (const el of form.elements) {
      if (!el.name) continue;
      if (el.type === 'checkbox') {
        data[el.name] = data[el.name] || [];
        if (el.checked) data[el.name].push(el.value);
      } else {
        data[el.name] = el.value.trim();
      }
    }
    return data;
  }

  function apply(data) {
    for (const el of form.elements) {
      if (!el.name) continue;
      if (el.type === 'checkbox') el.checked = Array.isArray(data[el.name]) && data[el.name].includes(el.value);
      else if (data[el.name] !== undefined) el.value = data[el.name];
    }
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(collect())); } catch (e) { /* хранилище недоступно */ }
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  /* ========================= расчеты ========================= */
  function monthsLeft(fromISO, toISO) {
    if (!fromISO || !toISO) return '';
    const a = new Date(fromISO), b = new Date(toISO);
    if (isNaN(a) || isNaN(b)) return '';
    let m = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
    if (b.getDate() < a.getDate()) m -= 1;
    if (b < a) return 'Срок истек';
    return String(Math.max(0, m));
  }

  function evaluate(data) {
    let score = 0;
    const counts = { ok: 0, warn: 0, risk: 0, none: 0 };
    const rows = BLOCKS.map((b) => {
      const st = data[fname(b.n, 'status')] || '';
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

  const LEVELS = {
    high: { title: 'Высокий уровень надежности', risk: 'Низкий риск', rec: 'Рекомендуется к сотрудничеству' },
    mid:  { title: 'Средний уровень надежности', risk: 'Умеренный риск', rec: 'Рекомендуется при условии устранения замечаний' },
    low:  { title: 'Низкий уровень надежности', risk: 'Высокий риск', rec: 'Не рекомендуется до устранения критических рисков' },
  };

  const RING_LEN = 2 * Math.PI * 52;

  function ringSvg(score, cls) {
    const off = RING_LEN * (1 - score / MAX_SCORE);
    return `
      <div class="ring ${cls}">
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <circle class="ring-bg" cx="60" cy="60" r="52"/>
          <circle class="ring-fg" cx="60" cy="60" r="52" stroke-dasharray="${RING_LEN}" stroke-dashoffset="${off}"/>
        </svg>
        <div class="ring-text"><span>${fmtScore(score)}</span><small>из ${MAX_SCORE} баллов</small></div>
      </div>`;
  }

  function refresh() {
    const data = collect();

    // автоматический расчет «Осталось месяцев»
    const ml = monthsLeft(data.check_date, data[fname(13, 'planned')]);
    $('#' + fname(13, 'months_left')).value = ml;

    // окраска статусов блоков
    BLOCKS.forEach((b) => {
      const st = data[fname(b.n, 'status')];
      const card = $('#block-' + b.n);
      const sel = $('#' + fname(b.n, 'status'));
      ['ok', 'warn', 'risk'].forEach((k) => { card.classList.toggle('st-' + k, st === k); sel.classList.toggle('st-' + k, st === k); });
    });

    // чек-лист документов
    const docs = data[fname(12, 'docs')] || [];
    const total = BLOCKS[11].checklist.length;
    $('#docsCount').textContent = `Отмечено документов: ${docs.length} из ${total}`;

    // панель баллов
    const ev = evaluate(data);
    const panel = $('#scorePanel');
    panel.classList.remove('level-high', 'level-mid', 'level-low');
    if (ev.level) panel.classList.add('level-' + ev.level);
    $('#scoreValue').textContent = fmtScore(ev.score);
    const fg = $('#ringFg');
    fg.setAttribute('stroke-dasharray', RING_LEN);
    fg.setAttribute('stroke-dashoffset', RING_LEN * (1 - ev.score / MAX_SCORE));
    const checked = BLOCKS.length - ev.counts.none;
    $('#barFill').style.width = `${(checked / BLOCKS.length) * 100}%`;
    $('#cntOk').textContent = ev.counts.ok;
    $('#cntWarn').textContent = ev.counts.warn;
    $('#cntRisk').textContent = ev.counts.risk;
    $('#cntNone').textContent = ev.counts.none;
    if (ev.complete) {
      $('#scoreTitle').textContent = LEVELS[ev.level].title;
      $('#scoreNote').textContent = `Все ${BLOCKS.length} блоков оценены. Уровень риска: ${LEVELS[ev.level].risk.toLowerCase()}.`;
      $('#recHint').textContent = `По баллам рекомендуется: «${LEVELS[ev.level].rec}»`;
    } else {
      $('#scoreTitle').textContent = `Проверено блоков: ${checked} из ${BLOCKS.length}`;
      $('#scoreNote').textContent = 'Итоговый уровень риска появится после оценки всех блоков.';
      $('#recHint').textContent = '';
    }
  }

  /* ========================= валидация ========================= */
  function fieldProblem(el) {
    const v = el.value.trim();
    if (el.dataset.required && !v) return el.dataset.status ? 'не выбран статус проверки' : 'обязательное поле';
    if (!v) return '';
    switch (el.dataset.type) {
      case 'inn': return /^\d{9}$/.test(v) ? '' : 'ИНН должен состоять из 9 цифр';
      case 'money': return /^\d+$/.test(digits(v)) ? '' : 'укажите сумму цифрами';
      case 'int': return /^\d+$/.test(v) ? '' : 'укажите целое неотрицательное число';
      case 'percent': return /^\d+(\.\d+)?$/.test(v) && +v >= 0 && +v <= 100 ? '' : 'значение от 0 до 100';
      default: return '';
    }
  }

  function clearErrors() {
    $$('.invalid', form).forEach((el) => el.classList.remove('invalid'));
    $$('.field-error', form).forEach((el) => el.remove());
    $$('.block.has-error', form).forEach((el) => el.classList.remove('has-error'));
    $('#errors').hidden = true;
  }

  function markInvalid(el, msg) {
    el.classList.add('invalid');
    if (!el.dataset.status) {
      const note = document.createElement('span');
      note.className = 'field-error';
      note.textContent = msg;
      el.insertAdjacentElement('afterend', note);
    }
    const card = el.closest('.block');
    if (card) card.classList.add('has-error');
  }

  function validate() {
    clearErrors();
    const errors = [];
    const data = collect();

    // статусы и поля — по порядку
    for (const el of form.elements) {
      if (!el.name || el.type === 'checkbox' || el.readOnly) continue;
      const problem = fieldProblem(el);
      if (problem) {
        const n = el.dataset.block;
        const where = n ? `Блок ${n}` : 'Общие сведения';
        const what = el.dataset.status ? 'Статус проверки' : el.dataset.label;
        errors.push({ el, text: `${where} · ${what}: ${problem}` });
        markInvalid(el, problem);
      }
    }

    // согласованность: «Подтверждено» в блоке 12 требует всех обязательных документов
    if (data[fname(12, 'status')] === 'ok') {
      const docs = data[fname(12, 'docs')] || [];
      const missing = BLOCKS[11].checklist.filter((c) => !c.optional && !docs.includes(c.id));
      if (missing.length) {
        const el = $('#' + fname(12, 'status'));
        errors.push({ el, text: `Блок 12 · для статуса «Подтверждено» отметьте все обязательные документы (не отмечено: ${missing.length})` });
        markInvalid(el, '');
      }
    }

    return errors;
  }

  function showErrors(errors) {
    const box = $('#errors');
    box.innerHTML = `<h4>Сертификат не сформирован — исправьте ${errors.length} ${plural(errors.length, 'замечание', 'замечания', 'замечаний')}:</h4>
      <ul>${errors.map((e, i) => `<li><button type="button" data-i="${i}">${esc(e.text)}</button></li>`).join('')}</ul>`;
    box.hidden = false;
    $$('button', box).forEach((btn) => btn.addEventListener('click', () => focusEl(errors[+btn.dataset.i].el)));
    box.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function focusEl(el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => el.focus({ preventScroll: true }), 350);
  }

  /* ========================= сертификат ========================= */
  function controlCode(data) {
    // FNV-1a по содержимому — позволяет сверить распечатку с исходными данными
    const s = JSON.stringify(data);
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

  function emblemSvg(certNo) {
    return `
      <svg class="emblem" viewBox="0 0 120 120" aria-hidden="true">
        <defs><path id="emb-arc" d="M60,60 m-44,0 a44,44 0 1,1 88,0 a44,44 0 1,1 -88,0"/></defs>
        <circle cx="60" cy="60" r="57" fill="none" stroke="#b88a3b" stroke-width="1.5"/>
        <circle cx="60" cy="60" r="52" fill="none" stroke="#e7d8b3" stroke-width="1"/>
        <circle cx="60" cy="60" r="34" fill="none" stroke="#b88a3b" stroke-width="1"/>
        <text font-size="7.2" font-weight="700" letter-spacing="2.2" fill="#12302a">
          <textPath href="#emb-arc">НЕЗАВИСИМАЯ ПРОВЕРКА • 13 БЛОКОВ •</textPath>
        </text>
        <text x="60" y="58" text-anchor="middle" font-size="16" font-weight="600" fill="#12302a" font-family="Lora, Georgia, serif">50</text>
        <text x="60" y="70" text-anchor="middle" font-size="6.5" font-weight="700" letter-spacing="1" fill="#6b746f">БАЛЛОВ</text>
        <text x="60" y="81" text-anchor="middle" font-size="6" fill="#b88a3b">${esc(certNo).slice(0, 18)}</text>
      </svg>`;
  }

  function buildCertificate(data) {
    const ev = evaluate(data);
    const L = LEVELS[ev.level];
    const g = (n, id) => data[fname(n, id)] || '';
    const issued = fmtDate(todayISO());

    const summaryRows = ev.rows.map(({ b, st, pts }) => `
      <tr>
        <td class="n">${b.n}</td>
        <td>${esc(b.title)}${b.critical ? ' <span class="pill risk" style="font-size:9px;padding:1px 6px">критический</span>' : ''}</td>
        <td class="c">${b.weight}</td>
        <td><span class="pill ${st}">${STATUSES[st].label}</span></td>
        <td class="r">${fmtScore(pts)} / ${b.weight}</td>
      </tr>`).join('');

    const details = ev.rows.map(({ b, st, pts }) => {
      let docs = '';
      if (b.checklist) {
        const checked = data[fname(b.n, 'docs')] || [];
        docs = `<ul class="doc-list">${b.checklist.map((c) => {
          const yes = checked.includes(c.id);
          return `<li class="${yes ? 'yes' : 'no'}"><span class="mark">${yes ? '✓' : '—'}</span><span>${esc(c.label)}${c.note ? ` (${esc(c.note)})` : ''}</span></li>`;
        }).join('')}</ul>`;
      }
      const kv = b.fields
        .map((f) => ({ f, v: valueText(f, g(b.n, f.id)) }))
        .filter((x) => x.v)
        .map(({ f, v }) => `<div class="${f.type === 'textarea' || f.full ? 'full' : ''}"><dt>${esc(f.label)}</dt><dd>${esc(v)}</dd></div>`)
        .join('');
      return `
        <div class="detail">
          <div class="detail-head">
            <div class="num">${b.n}</div>
            <h3>${esc(b.title)}</h3>
            <span class="pill ${st}">${STATUSES[st].label}</span>
            <span class="pts">${fmtScore(pts)} из ${b.weight}</span>
          </div>
          ${docs}
          <dl class="kv">${kv}</dl>
        </div>`;
    }).join('');

    return `
      <article class="cert">
        <div class="cert-frame">
          <span class="corner tl"></span><span class="corner tr"></span><span class="corner bl"></span><span class="corner br"></span>

          <header class="cert-head">
            <div>
              <div class="eyebrow">Независимая проверка сведений</div>
              <h1>Сертификат<br>проверки застройщика</h1>
              <div class="cert-meta">
                <span>№ <b>${esc(data.cert_number)}</b></span>
                <span>Дата проверки: <b>${fmtDate(data.check_date)}</b></span>
                <span>Цель: <b>${esc(data.purpose)}</b></span>
              </div>
            </div>
            ${emblemSvg(data.cert_number)}
          </header>

          <p class="cert-lead">
            Настоящий сертификат подтверждает, что проведена независимая проверка сведений о застройщике
            <b>${esc(g(2, 'legal_name'))}</b> (ИНН ${esc(g(3, 'inn'))}) по проекту
            <b>${esc(g(1, 'name'))}</b>, расположенному по адресу: ${esc(g(1, 'address'))},
            по ${BLOCKS.length} ключевым блокам юридической прозрачности, задолженностей и готовности объекта.
          </p>

          <section class="cert-score">
            ${ringSvg(ev.score, 'level-' + ev.level)}
            <div>
              <div class="label" style="margin-bottom:4px">Итоговый уровень надежности</div>
              <div class="level-title">${L.title} <span class="pill ${ev.level}">${L.risk}</span></div>
              <div class="counts">
                <span>Подтверждено: <b>${ev.counts.ok}</b></span>
                <span>С замечаниями: <b>${ev.counts.warn}</b></span>
                <span>Риск: <b>${ev.counts.risk}</b></span>
                <span>Проверено блоков: <b>${BLOCKS.length} из ${BLOCKS.length}</b></span>
              </div>
              <div class="cert-rec">Итоговая рекомендация: <b>${esc(data.recommendation)}</b></div>
            </div>
          </section>

          <h2>Сводка по блокам</h2>
          <table class="cert-table">
            <thead><tr><th></th><th>Блок проверки</th><th class="c">Вес</th><th>Статус</th><th class="r">Баллы</th></tr></thead>
            <tbody>${summaryRows}</tbody>
            <tfoot><tr><td></td><td>Итого</td><td class="c">${MAX_SCORE}</td><td></td><td class="r">${fmtScore(ev.score)} / ${MAX_SCORE}</td></tr></tfoot>
          </table>

          <h2>Результаты проверки по блокам</h2>
          ${details}

          <h2>Заключение проверяющего</h2>
          <div class="concl">
            <div><h4>Подтвержденные сильные стороны</h4><p>${esc(data.strengths)}</p></div>
            <div><h4>Выявленные риски</h4><p>${esc(data.risks)}</p></div>
            <div><h4>Что запросить до заключения договора</h4><p>${esc(data.requests || '—')}</p></div>
          </div>
          <div class="rec-banner ${ev.level}"><small>Итоговая рекомендация</small>${esc(data.recommendation)}</div>

          <section class="cert-sign">
            <div class="line">
              <div class="cap">Проверку выполнил</div>
              <div class="val">${esc(data.reviewer)}</div>
            </div>
            <div class="sign-box">
              <div class="line">
                <div class="cap">Подпись и печать</div>
                <div class="val">${esc(data.sign_note) || '&nbsp;'}</div>
              </div>
              <div class="mp">М.П.</div>
            </div>
          </section>

          <footer class="cert-foot">
            <div>
              <p>Оценка отражает сведения, доступные на дату проверки, и зависит от полноты представленных документов.</p>
              <p>Дата выдачи: ${issued} · Контрольный код: <span class="cert-code">${controlCode(data)}</span></p>
            </div>
            <div>
              <p>Сертификат не является государственной гарантией, разрешением на строительство или заключением о юридической чистоте сделки.</p>
              <p>Шкала: 40–50 — высокая, 25–39 — средняя, менее 25 — низкая надежность; риск по критическому блоку 12 — низкая надежность.</p>
            </div>
          </footer>
        </div>
      </article>`;
  }

  function showCertificate() {
    $('#certificate').innerHTML = buildCertificate(collect());
    $('#formView').hidden = true;
    $('#certView').hidden = false;
    document.body.classList.add('show-cert');
    const no = $('#cert_number').value.trim();
    document.title = `Сертификат ${no} — проверка застройщика`;
    window.scrollTo(0, 0);
  }

  function showForm() {
    $('#certView').hidden = true;
    $('#formView').hidden = false;
    document.body.classList.remove('show-cert');
    document.title = 'Сертификат проверки застройщика';
  }

  /* ========================= пример данных ========================= */
  function demoData() {
    const t = todayISO();
    const d = (y, m) => { const x = new Date(); x.setFullYear(x.getFullYear() + y, x.getMonth() + m, 15); return x.toISOString().slice(0, 10); };
    const v = {
      cert_number: 'ПЗ-2026-001', check_date: t, purpose: 'Инвестиционная оценка',
      b1_status: 'ok', b1_name: 'ЖК «Навруз Резиденс»', b1_address: 'г. Ташкент, Мирзо-Улугбекский район, ул. Примерная, 12', b1_cadastre: '10:07:03:01:01:0457', b1_source: 'Кадастровое агентство, выписка от ' + fmtDate(t),
      b2_status: 'ok', b2_legal_name: 'ООО «Пример Курилиш Инвест»', b2_reg_number: '№ 012345 от 14.03.2018', b2_state: 'Действует', b2_relation: 'Заказчик строительства и инвестор',
      b3_status: 'ok', b3_inn: '305123456', b3_match: 'Совпадает', b3_source: 'Единый государственный реестр, ' + fmtDate(t),
      b4_status: 'warn', b4_declared: '5000000000', b4_paid: '3200000000', b4_last_change: '12.01.2025 — увеличение до 5 млрд сум', b4_sufficiency: 'Оплачено 64% заявленного фонда; для объекта данного масштаба капитал умеренный',
      b5_status: 'ok', b5_founders: 'Иванов А. Б.\nООО «Пример Холдинг»', b5_shares: '60%\n40%', b5_beneficiaries: 'Иванов А. Б. (прямо и через ООО «Пример Холдинг»)', b5_changes: 'Без изменений', b5_related: 'ООО «Пример Бетон»', b5_source: 'Реестр, устав от 12.01.2025',
      b6_status: 'ok', b6_fio: 'Петров Сергей Николаевич', b6_appointed: '2023-02-01', b6_basis: 'Решение общего собрания участников № 3', b6_links: 'Ограничений не выявлено',
      b7_status: 'ok', b7_activity: '41.20 — Строительство жилых и нежилых зданий', b7_construction: 'Да', b7_experience: '8', b7_projects: '4 объекта: ЖК «Первый», ЖК «Второй» и др.',
      b8_status: 'ok', b8_legal_address: 'г. Ташкент, ул. Примерная, 1', b8_office: 'г. Ташкент, ул. Примерная, 12, офис продаж', b8_confirmed: 'Да', b8_source: 'Реестр и выезд на место, ' + fmtDate(t),
      b9_status: 'ok', b9_amount: '0', b9_settlement: 'Нет долга', b9_date: t, b9_source: 'my.soliq.uz — справка об отсутствии задолженности',
      b10_status: 'ok', b10_number: '326010012345', b10_reg_date: '2018-04-01', b10_state: 'Действует', b10_source: 'Официальный налоговый сервис, ' + fmtDate(t),
      b11_status: 'warn', b11_count: '2', b11_total: '48500000', b11_significant: '№ 12-345/2025, взыскатель ООО «Поставщик», поставка материалов, 48,5 млн сум — в процессе погашения', b11_date: t, b11_source: 'Бюро принудительного исполнения',
      b12_status: 'ok', b12_docs: ['land', 'land_use', 'apz', 'psd', 'expertise', 'permit', 'supervision', 'contractor', 'approvals'],
      b12_customer: 'ООО «Пример Курилиш Инвест», ИНН 305123456', b12_general: 'ООО «Генподряд Строй», ИНН 302654321', b12_designer: 'ООО «Проект Лойиха», лицензия № 0042',
      b12_permit_doc: 'Уведомление о начале СМР № 77 от 10.05.2024, инспекция', b12_expertise_doc: '№ 18/24 от 02.04.2024 — положительное', b12_source: 'Заверенные копии, реестр разрешений', b12_missing: 'Документы о вводе в эксплуатацию не требуются (объект строится)',
      b13_status: 'warn', b13_planned: d(1, 3), b13_expected: d(1, 6), b13_readiness: '55', b13_deviation: '≈ 3 месяца', b13_source: 'Отчет технического надзора, осмотр', b13_assessment: 'Темп работ удовлетворительный, возможен перенос ввода на квартал из-за поставок фасадных материалов',
      strengths: 'Полный пакет разрешительной документации, отсутствие налоговой задолженности, прозрачная структура собственности.',
      risks: 'Неполная оплата уставного фонда; открытое исполнительное производство; отставание от графика ≈ 3 месяца.',
      requests: 'Справку о погашении исполнительного производства; обновленный график строительства; подтверждение финансирования.',
      recommendation: 'Рекомендуется при условии устранения замечаний',
      reviewer: 'Аналитик: Каримов Д. У., ООО «Эксперт Аудит»',
    };
    return v;
  }

  /* ========================= события ========================= */
  form.addEventListener('input', (e) => {
    if (e.target.classList.contains('invalid')) {
      e.target.classList.remove('invalid');
      const next = e.target.nextElementSibling;
      if (next && next.classList.contains('field-error')) next.remove();
    }
    refresh();
    save();
  });
  form.addEventListener('change', () => { refresh(); save(); });

  // форматирование сумм и ИНН
  form.addEventListener('focusout', (e) => {
    const el = e.target;
    if (el.dataset.type === 'money' && el.value.trim()) el.value = fmtMoney(el.value.trim());
    if (el.dataset.type === 'inn') el.value = el.value.replace(/\D/g, '').slice(0, 9);
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const errors = validate();
    if (errors.length) { showErrors(errors); return; }
    showCertificate();
  });

  $('#btnDemo').addEventListener('click', () => {
    form.reset();
    apply(demoData());
    $$('[data-type="money"]', form).forEach((el) => { if (el.value) el.value = fmtMoney(el.value); });
    clearErrors();
    refresh();
    save();
  });

  $('#btnReset').addEventListener('click', () => {
    if (!confirm('Очистить все поля формы?')) return;
    form.reset();
    setDefaults();
    clearErrors();
    refresh();
    save();
  });

  $('#btnBack').addEventListener('click', () => { showForm(); window.scrollTo(0, 0); });
  $('#btnPrint').addEventListener('click', () => window.print());

  function setDefaults() {
    const t = todayISO();
    $('#check_date').value = t;
    BLOCKS.forEach((b) => b.fields.forEach((f) => { if (f.defaultToday) $('#' + fname(b.n, f.id)).value = t; }));
  }

  /* ========================= старт ========================= */
  const saved = load();
  if (saved) apply(saved); else setDefaults();
  refresh();
})();
