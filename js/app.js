/* Приложение: форма проверки, валидация, маршрутизация, анимации */
(function (DC) {
  'use strict';

  const { STATUSES, BLOCKS, LEVELS, MAX_SCORE, esc, fname, todayISO, fmtDate, fmtMoney, fmtScore, digits, plural, weightText } = DC;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const nextFrame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  const form = $('#checkForm');
  const state = { editId: null, view: 'form', certId: null };

  /* =========================================================
     Рендер формы
     ========================================================= */
  function controlHtml(b, f) {
    const name = fname(b.n, f.id);
    const attrs = `id="${name}" name="${name}" data-block="${b.n}" data-label="${esc(f.label)}"${f.req ? ' data-required="1"' : ''}${f.type ? ` data-type="${f.type}"` : ''}`;
    const ph = f.ph ? ` placeholder="${esc(f.ph)}"` : '';
    switch (f.type) {
      case 'textarea': return `<textarea ${attrs}${ph} rows="3" maxlength="1500"></textarea>`;
      case 'select': return `<select ${attrs}><option value="">Выберите</option>${f.options.map((o) => `<option>${esc(o)}</option>`).join('')}</select>`;
      case 'date': return `<input type="date" ${attrs}>`;
      case 'money': return `<input type="text" inputmode="numeric" maxlength="24" ${attrs}${ph}>`;
      case 'inn': return `<input type="text" inputmode="numeric" maxlength="9" ${attrs}${ph}>`;
      case 'int': return `<input type="number" inputmode="numeric" min="0" step="1" ${attrs}${ph}>`;
      case 'percent': return `<input type="number" inputmode="decimal" min="0" max="100" step="1" ${attrs}${ph}>`;
      case 'auto': return `<input type="text" readonly tabindex="-1" ${attrs}${ph}>`;
      default: return `<input type="text" maxlength="300" ${attrs}${ph}>`;
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
        <div class="checklist-foot">
          <span id="docsCount"></span>
          <button type="button" class="link-btn" id="docsAll">Отметить все обязательные</button>
        </div>
      </div>` : '';
    return `
      <article class="block reveal${b.wide ? ' wide' : ''}" id="block-${b.n}" data-n="${b.n}">
        <div class="block-head">
          <div class="num">${b.n}</div>
          <div class="block-title">
            <h3>${esc(b.title)}</h3>
            <div class="weight${b.critical ? ' crit' : ''}">Вес: ${weightText(b.weight)}${b.critical ? ' — критический блок' : ''}</div>
          </div>
          <span class="fill-count" id="fill-${b.n}" title="Заполнено обязательных полей"></span>
        </div>
        <div class="seg" role="radiogroup" aria-label="Статус проверки блока ${b.n}" data-seg="${b.n}">
          ${Object.entries(STATUSES).map(([k, s]) => `
            <label class="seg-opt ${k}">
              <input type="radio" name="${statusName}" value="${k}" data-block="${b.n}">
              <span><i>${s.icon}</i><b class="l-full">${s.label}</b><b class="l-short">${s.short}</b></span>
            </label>`).join('')}
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
  $('#blockNav').innerHTML = BLOCKS.map((b) => `<a href="#block-${b.n}" class="bn" data-n="${b.n}" title="${esc(b.title)}">${b.n}</a>`).join('')
    + '<a href="#conclusion" class="bn bn-end" data-n="end" title="Заключение">Итог</a>';

  /* =========================================================
     Данные формы
     ========================================================= */
  function collect() {
    const data = {};
    BLOCKS.forEach((b) => { data[fname(b.n, 'status')] = ''; });
    for (const el of form.elements) {
      if (!el.name) continue;
      if (el.type === 'checkbox') {
        data[el.name] = data[el.name] || [];
        if (el.checked) data[el.name].push(el.value);
      } else if (el.type === 'radio') {
        if (el.checked) data[el.name] = el.value;
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
      else if (el.type === 'radio') el.checked = data[el.name] === el.value;
      else if (data[el.name] !== undefined) el.value = data[el.name];
    }
    $$('[data-type="money"]', form).forEach((el) => { if (el.value) el.value = fmtMoney(el.value); });
  }

  function setDefaults() {
    const t = todayISO();
    $('#check_date').value = t;
    BLOCKS.forEach((b) => b.fields.forEach((f) => { if (f.defaultToday) $('#' + fname(b.n, f.id)).value = t; }));
  }

  function resetForm(data) {
    form.reset();
    if (data) apply(data); else setDefaults();
    clearErrors();
    refresh(true);
  }

  let saveTimer;
  function scheduleSave() {
    if (state.editId) return; // правки выпущенного сертификата не пишем в черновик
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => DC.store.saveDraft(collect()), 250);
  }

  /* =========================================================
     Расчеты и живые индикаторы
     ========================================================= */
  function monthsLeft(fromISO, toISO) {
    if (!fromISO || !toISO) return '';
    const a = new Date(fromISO), b = new Date(toISO);
    if (isNaN(a) || isNaN(b)) return '';
    if (b < a) return 'Срок истек';
    let m = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
    if (b.getDate() < a.getDate()) m -= 1;
    return String(Math.max(0, m));
  }

  const RING_LEN = 2 * Math.PI * 52;
  const DOCK_LEN = 2 * Math.PI * 15;
  let shownScore = 0;
  let scoreAnim;

  function animateScore(target) {
    cancelAnimationFrame(scoreAnim);
    const el = $('#scoreValue');
    if (reduceMotion) { shownScore = target; el.textContent = fmtScore(target); return; }
    const from = shownScore, start = performance.now(), dur = 420;
    const step = (now) => {
      const k = Math.min(1, (now - start) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      shownScore = from + (target - from) * e;
      el.textContent = fmtScore(Math.round(shownScore * 2) / 2);
      if (k < 1) scoreAnim = requestAnimationFrame(step);
      else { shownScore = target; el.textContent = fmtScore(target); }
    };
    scoreAnim = requestAnimationFrame(step);
  }

  const isFilled = (el) => el.value.trim() !== '';

  function blockFill(b, data) {
    let total = 1, done = data[fname(b.n, 'status')] ? 1 : 0;
    b.fields.forEach((f) => {
      if (!f.req) return;
      total++;
      if (data[fname(b.n, f.id)]) done++;
    });
    return { done, total };
  }

  let lastLevel = null;
  function refresh(instant) {
    const data = collect();

    $('#' + fname(13, 'months_left')).value = monthsLeft(data.check_date, data[fname(13, 'planned')]);

    let reqDone = 0, reqTotal = 0;
    // общие обязательные поля (шапка, заключение)
    $$('[data-required]', form).forEach((el) => {
      if (el.dataset.block) return;
      reqTotal++;
      if (isFilled(el)) reqDone++;
    });

    BLOCKS.forEach((b) => {
      const st = data[fname(b.n, 'status')];
      const card = $('#block-' + b.n);
      ['ok', 'warn', 'risk'].forEach((k) => card.classList.toggle('st-' + k, st === k));
      const { done, total } = blockFill(b, data);
      reqDone += done; reqTotal += total;
      const fc = $('#fill-' + b.n);
      fc.textContent = done === total ? '✓ Заполнено' : `${done} / ${total}`;
      fc.classList.toggle('done', done === total);
      const chip = $(`.bn[data-n="${b.n}"]`);
      chip.className = `bn${st ? ' st-' + st : ''}${done === total ? ' done' : ''}${card.classList.contains('has-error') ? ' err' : ''}`;
    });

    const docs = data[fname(12, 'docs')] || [];
    $('#docsCount').textContent = `Отмечено документов: ${docs.length} из ${BLOCKS[11].checklist.length}`;

    const ev = DC.evaluate(data);
    const panel = $('#scorePanel');
    panel.classList.remove('level-high', 'level-mid', 'level-low');
    if (ev.level) panel.classList.add('level-' + ev.level);
    if (ev.level && ev.level !== lastLevel && !instant && !reduceMotion) {
      panel.classList.remove('flash'); void panel.offsetWidth; panel.classList.add('flash');
    }
    lastLevel = ev.level;
    if (instant) { shownScore = ev.score; $('#scoreValue').textContent = fmtScore(ev.score); } else animateScore(ev.score);
    $('#ringFg').style.strokeDasharray = RING_LEN;
    $('#ringFg').style.strokeDashoffset = RING_LEN * (1 - ev.score / MAX_SCORE);
    const checked = BLOCKS.length - ev.counts.none;
    $('#barFill').style.width = `${(checked / BLOCKS.length) * 100}%`;
    $('#cntOk').textContent = ev.counts.ok;
    $('#cntWarn').textContent = ev.counts.warn;
    $('#cntRisk').textContent = ev.counts.risk;
    $('#cntNone').textContent = ev.counts.none;
    const recHint = $('#recHint');
    if (ev.complete) {
      $('#scoreTitle').textContent = LEVELS[ev.level].title;
      $('#scoreNote').textContent = `Все ${BLOCKS.length} блоков оценены. Уровень риска: ${LEVELS[ev.level].risk.toLowerCase()}.`;
      const rec = LEVELS[ev.level].rec;
      recHint.innerHTML = data.recommendation === rec
        ? `✓ Совпадает с рекомендацией по баллам`
        : `По баллам: «${esc(rec)}» <button type="button" class="link-btn" id="recApply">Применить</button>`;
    } else {
      $('#scoreTitle').textContent = `Проверено блоков: ${checked} из ${BLOCKS.length}`;
      $('#scoreNote').textContent = 'Итоговый уровень риска появится после оценки всех блоков.';
      recHint.textContent = '';
    }

    // нижняя панель
    const pct = reqTotal ? Math.round((reqDone / reqTotal) * 100) : 0;
    $('#dockPct').textContent = `${pct}%`;
    $('#dockSub').textContent = `${checked} из ${BLOCKS.length} ${plural(BLOCKS.length, 'блока', 'блоков', 'блоков')} оценено`;
    $('#dockArc').style.strokeDasharray = DOCK_LEN;
    $('#dockArc').style.strokeDashoffset = DOCK_LEN * (1 - pct / 100);
    $('#dock').classList.toggle('ready', pct === 100);
  }

  /* =========================================================
     Валидация
     ========================================================= */
  function fieldProblem(el) {
    const v = el.value.trim();
    if (el.dataset.required && !v) return 'обязательное поле';
    if (!v) return '';
    switch (el.dataset.type) {
      case 'inn': return /^\d{9}$/.test(v) ? '' : 'ИНН должен состоять из 9 цифр';
      case 'money': return /^\d+$/.test(digits(v)) ? '' : 'укажите сумму цифрами';
      case 'int': return /^\d+$/.test(v) ? '' : 'целое неотрицательное число';
      case 'percent': return /^\d+(\.\d+)?$/.test(v) && +v >= 0 && +v <= 100 ? '' : 'значение от 0 до 100';
      default: return '';
    }
  }

  function clearErrors() {
    $$('.invalid', form).forEach((el) => el.classList.remove('invalid'));
    $$('.field-error', form).forEach((el) => el.remove());
    $$('.has-error', form).forEach((el) => el.classList.remove('has-error'));
    $('#errors').hidden = true;
  }

  function markInvalid(el, msg) {
    el.classList.add('invalid');
    if (msg) {
      const note = document.createElement('span');
      note.className = 'field-error';
      note.textContent = msg;
      el.insertAdjacentElement('afterend', note);
    }
    const card = el.closest('.block');
    if (card) card.classList.add('has-error');
    if (!reduceMotion) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); }
  }

  function validate() {
    clearErrors();
    const errors = [];
    const data = collect();
    const push = (el, where, what, problem, msg = problem) => {
      errors.push({ el, text: `${where} · ${what}: ${problem}` });
      markInvalid(el, msg);
    };

    ['cert_number', 'check_date', 'purpose'].forEach((id) => {
      const el = $('#' + id), p = fieldProblem(el);
      if (p) push(el, 'Общие сведения', el.dataset.label, p);
    });
    const dupe = data.cert_number && DC.store.findByNumber(data.cert_number);
    if (dupe && dupe.id !== state.editId) {
      push($('#cert_number'), 'Общие сведения', 'Номер сертификата', `номер уже занят (выдан ${fmtDate(dupe.checkDate)})`);
    }

    BLOCKS.forEach((b) => {
      const seg = $(`[data-seg="${b.n}"]`);
      if (!data[fname(b.n, 'status')]) push(seg, `Блок ${b.n}`, 'Статус проверки', 'не выбран', '');
      b.fields.forEach((f) => {
        const el = $('#' + fname(b.n, f.id));
        if (el.readOnly) return;
        const p = fieldProblem(el);
        if (p) push(el, `Блок ${b.n}`, f.label, p);
      });
    });

    if (data[fname(12, 'status')] === 'ok') {
      const docs = data[fname(12, 'docs')] || [];
      const missing = BLOCKS[11].checklist.filter((c) => !c.optional && !docs.includes(c.id));
      if (missing.length) push($('.checklist'), 'Блок 12', 'Документы', `для статуса «Подтверждено» отметьте все обязательные документы (не отмечено: ${missing.length})`, '');
    }

    ['strengths', 'risks', 'recommendation', 'reviewer'].forEach((id) => {
      const el = $('#' + id), p = fieldProblem(el);
      if (p) push(el, 'Заключение', el.dataset.label, p);
    });

    return errors;
  }

  function showErrors(errors) {
    const box = $('#errors');
    box.innerHTML = `
      <div class="errors-head">
        <h4>Сертификат не сформирован — ${errors.length} ${plural(errors.length, 'замечание', 'замечания', 'замечаний')}</h4>
        <button type="button" class="btn sm ghost" id="errNext">К первому →</button>
      </div>
      <ul>${errors.map((e, i) => `<li><button type="button" data-i="${i}">${esc(e.text)}</button></li>`).join('')}</ul>`;
    box.hidden = false;
    $$('li button', box).forEach((btn) => btn.addEventListener('click', () => focusEl(errors[+btn.dataset.i].el)));
    $('#errNext').addEventListener('click', () => focusEl(errors[0].el));
    refresh(true);
  }

  function focusEl(el) {
    const block = el.closest('.block');
    if (block) block.classList.add('in');
    el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
    const target = el.matches('input,select,textarea') ? el : el.querySelector('input');
    if (target) setTimeout(() => target.focus({ preventScroll: true }), reduceMotion ? 0 : 380);
  }

  /* =========================================================
     Выпуск сертификата
     ========================================================= */
  async function issue() {
    const btn = $('#btnMake');
    const errors = validate();
    if (errors.length) {
      toast(`Исправьте ${errors.length} ${plural(errors.length, 'замечание', 'замечания', 'замечаний')} — первое подсвечено`, 'error');
      showErrors(errors);
      focusEl(errors[0].el);
      return;
    }
    btn.classList.add('busy');
    btn.disabled = true;
    await nextFrame();
    const data = collect();
    const wasEdit = !!state.editId;
    const rec = DC.store.upsert(data, state.editId);
    btn.classList.remove('busy');
    btn.disabled = false;
    if (!rec) { toast('Не удалось сохранить: хранилище браузера недоступно', 'error'); return; }
    state.editId = null;
    DC.store.clearDraft();
    resetForm(null);
    updateNavCount();
    toast(wasEdit ? `Сертификат ${rec.number} обновлен (редакция ${rec.version})` : `Сертификат ${rec.number} выпущен и добавлен в реестр`, 'ok');
    location.hash = `#/cert/${rec.id}`;
  }

  /* =========================================================
     Просмотр сертификата
     ========================================================= */
  async function showCertificate(id) {
    const rec = DC.store.get(id);
    const root = $('#certificate');
    if (!rec) {
      root.innerHTML = `<div class="empty"><h3>Сертификат не найден</h3><p class="muted">Возможно, он был удален из реестра.</p><a class="btn primary" href="#/admin">Открыть реестр</a></div>`;
      $('#certInfo').innerHTML = '';
      return;
    }
    state.certId = id;
    const L = LEVELS[rec.level] || LEVELS.low;
    $('#certInfo').innerHTML = `<b>${esc(rec.number)}</b><span class="pill ${rec.level}">${fmtScore(rec.score)} / ${MAX_SCORE} · ${L.short}</span>${rec.status === 'revoked' ? '<span class="pill risk">аннулирован</span>' : ''}<span class="tb-pages" id="tbPages"></span>`;
    $('#btnEdit').href = `#/edit/${id}`;
    document.title = `Сертификат ${rec.number} — проверка застройщика`;
    if (document.fonts && document.fonts.ready) {
      await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 800))]);
    }
    const total = DC.certificate.render(root, rec);
    $('#tbPages').textContent = `${total} ${plural(total, 'лист', 'листа', 'листов')} A4`;
  }

  /* =========================================================
     Маршрутизация и смена экранов
     ========================================================= */
  const VIEWS = { form: '#formView', cert: '#certView', admin: '#adminView', verify: '#verifyView' };

  function showView(name) {
    Object.entries(VIEWS).forEach(([k, sel]) => {
      const el = $(sel);
      const on = k === name;
      el.hidden = !on;
      if (on && !reduceMotion) { el.classList.remove('view-enter'); void el.offsetWidth; el.classList.add('view-enter'); }
    });
    document.body.className = `view-${name}`;
    $$('.nav a').forEach((a) => a.classList.toggle('active', a.dataset.nav === name || (name === 'cert' && a.dataset.nav === 'admin')));
    state.view = name;
  }

  function enterNewMode() {
    if (state.editId) {
      state.editId = null;
      resetForm(DC.store.loadDraft());
    }
    $('#editBanner').hidden = true;
  }

  function route() {
    const parts = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
    const [view, a, b] = parts;
    const prevView = state.view;
    switch (view) {
      case 'admin':
        showView('admin');
        DC.admin.render($('#adminView'));
        document.title = 'Реестр сертификатов';
        break;
      case 'verify':
        showView('verify');
        DC.admin.renderVerify($('#verifyView'), { num: a, code: b });
        document.title = 'Проверка сертификата';
        break;
      case 'cert':
        showView('cert');
        showCertificate(a);
        break;
      case 'edit': {
        const rec = DC.store.get(a);
        if (!rec) { toast('Сертификат не найден', 'error'); location.hash = '#/admin'; return; }
        state.editId = a;
        resetForm(rec.data);
        $('#editNum').textContent = rec.number;
        $('#editBanner').hidden = false;
        showView('form');
        document.title = `Изменение ${rec.number}`;
        break;
      }
      default:
        enterNewMode();
        showView('form');
        document.title = 'Сертификат проверки застройщика';
    }
    if (prevView !== state.view || view === 'edit') window.scrollTo(0, 0);
  }

  function updateNavCount() {
    const n = DC.store.all().length;
    const el = $('#navCount');
    el.textContent = n ? n : '';
    el.hidden = !n;
  }

  /** Начать новую проверку с готовыми данными (например, копия из реестра) */
  function startFrom(data) {
    state.editId = null;
    resetForm(data);
    DC.store.saveDraft(collect());
    $('#editBanner').hidden = true;
    if (location.hash === '#/' || location.hash === '') route(); else location.hash = '#/';
  }

  /* =========================================================
     Всплывающие уведомления и диалог
     ========================================================= */
  function toast(text, type = '') {
    const box = $('#toasts');
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerHTML = `<i>${type === 'ok' ? '✓' : type === 'error' ? '!' : 'i'}</i><span>${esc(text)}</span>`;
    box.appendChild(t);
    while (box.children.length > 3) box.firstElementChild.remove();
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 250); }, type === 'error' ? 4200 : 2800);
  }

  function confirmDialog({ title, text, ok = 'OK', danger = false }) {
    const dlg = $('#dialog');
    if (!dlg.showModal) return Promise.resolve(window.confirm(`${title}\n\n${text}`));
    $('#dlgTitle').textContent = title;
    $('#dlgText').textContent = text;
    const okBtn = $('#dlgOk');
    okBtn.textContent = ok;
    okBtn.classList.toggle('danger', danger);
    dlg.returnValue = '';
    dlg.showModal();
    return new Promise((resolve) => {
      dlg.addEventListener('close', () => resolve(dlg.returnValue === 'ok'), { once: true });
    });
  }
  $('#dialog').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.close('cancel'); });

  /* =========================================================
     Появление блоков при прокрутке
     ========================================================= */
  if ('IntersectionObserver' in window && !reduceMotion) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -40px 0px', threshold: 0.05 });
    $$('.reveal').forEach((el) => io.observe(el));
  } else {
    $$('.reveal').forEach((el) => el.classList.add('in'));
  }
  window.addEventListener('beforeprint', () => $$('.reveal').forEach((el) => el.classList.add('in')));

  // подсветка текущего блока в навигации
  if ('IntersectionObserver' in window) {
    const navIo = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        const n = e.target.id === 'conclusion' ? 'end' : e.target.dataset.n;
        $$('.bn').forEach((c) => c.classList.toggle('current', c.dataset.n === n));
        const chip = $(`.bn[data-n="${n}"]`);
        const nav = $('#blockNav');
        if (chip && nav.scrollWidth > nav.clientWidth) {
          nav.scrollTo({ left: chip.offsetLeft - nav.clientWidth / 2 + chip.offsetWidth / 2, behavior: reduceMotion ? 'auto' : 'smooth' });
        }
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    $$('.block').forEach((el) => navIo.observe(el));
    navIo.observe($('#conclusion'));
  }

  /* =========================================================
     Демо-данные
     ========================================================= */
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

  /* =========================================================
     События
     ========================================================= */
  form.addEventListener('input', (e) => {
    const el = e.target;
    if (el.classList.contains('invalid') && !fieldProblem(el)) {
      el.classList.remove('invalid');
      const next = el.nextElementSibling;
      if (next && next.classList.contains('field-error')) next.remove();
    }
    if (el.dataset.type === 'inn') el.value = el.value.replace(/\D/g, '').slice(0, 9);
    refresh();
    scheduleSave();
  });

  form.addEventListener('change', (e) => {
    const el = e.target;
    if (el.type === 'radio') {
      const seg = el.closest('.seg');
      seg.classList.remove('invalid');
      const card = el.closest('.block');
      if (card && !$$('.invalid', card).length) card.classList.remove('has-error');
    }
    if (el.type === 'checkbox') $('.checklist').classList.remove('invalid');
    refresh();
    scheduleSave();
  });

  form.addEventListener('focusout', (e) => {
    const el = e.target;
    if (el.dataset.type === 'money' && el.value.trim()) el.value = fmtMoney(el.value.trim());
  });

  form.addEventListener('submit', (e) => { e.preventDefault(); issue(); });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && state.view === 'form') { e.preventDefault(); issue(); }
  });

  form.addEventListener('click', (e) => {
    if (e.target.id === 'recApply') {
      const ev = DC.evaluate(collect());
      if (ev.level) { $('#recommendation').value = LEVELS[ev.level].rec; refresh(); scheduleSave(); }
    }
    if (e.target.id === 'docsAll') {
      const optional = new Set(BLOCKS[11].checklist.filter((c) => c.optional).map((c) => c.id));
      $$(`input[name="${fname(12, 'docs')}"]`).forEach((c) => { if (!optional.has(c.value)) c.checked = true; });
      $('.checklist').classList.remove('invalid');
      refresh(); scheduleSave();
    }
  });

  $('#blockNav').addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (!a) return;
    e.preventDefault();
    const target = $(a.getAttribute('href'));
    target.classList.add('in');
    target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  });

  $('#btnAutoNum').addEventListener('click', () => {
    const el = $('#cert_number');
    el.value = DC.store.nextNumber();
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });

  $('#btnDemo').addEventListener('click', () => {
    const data = demoData();
    data.cert_number = DC.store.nextNumber();
    resetForm(data);
    scheduleSave();
    toast('Форма заполнена тестовыми данными', 'ok');
  });

  $('#btnReset').addEventListener('click', async () => {
    if (!(await confirmDialog({ title: 'Очистить форму?', text: 'Все введенные данные будут удалены. Выпущенные сертификаты в реестре не затрагиваются.', ok: 'Очистить', danger: true }))) return;
    resetForm(null);
    if (!state.editId) DC.store.clearDraft();
    toast('Форма очищена');
  });

  $('#btnPrint').addEventListener('click', () => window.print());

  let resizeT;
  window.addEventListener('resize', () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => { if (state.view === 'cert') DC.certificate.fit($('#certificate')); }, 60);
  });

  window.addEventListener('hashchange', route);

  /* =========================================================
     Старт
     ========================================================= */
  Object.assign(DC, { toast, confirm: confirmDialog, startFrom, updateNavCount });

  const draft = DC.store.loadDraft();
  if (draft) apply(draft); else setDefaults();
  refresh(true);
  updateNavCount();
  route();
})(window.DC);
