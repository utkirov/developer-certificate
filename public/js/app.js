/* Приложение: форма проверки, автосохранение на сервер, маршрутизация, анимации */
(function (DC) {
  'use strict';

  const { STATUSES, BLOCKS, LEVELS, RECOMMENDATIONS, META_FIELDS, esc, fname, todayISO, fmtDate, fmtMoney, fmtScore, plural, weightText, api } = DC;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const form = $('#checkForm');
  const state = {
    user: null,
    view: 'boot',
    id: null,        // редактируемое заключение
    lock: null,      // версия для защиты от одновременной правки
    record: null,
    files: [],
    dirty: false,
    saving: false,
    readOnly: false,
    loading: false,  // форма заполняется программно: это не правка пользователя
  };

  const isManager = () => state.user && state.user.role === 'manager';
  const fieldDefs = new Map();
  BLOCKS.forEach((b) => b.fields.forEach((f) => fieldDefs.set(fname(b.n, f.id), f)));

  /* =========================================================
     Рендер формы
     ========================================================= */
  const optionsHtml = (list) => `<option value="">Выберите</option>${list.map((o) => `<option>${esc(o)}</option>`).join('')}`;

  function controlHtml(b, f) {
    const name = fname(b.n, f.id);
    const attrs = `id="${name}" name="${name}" data-block="${b.n}" data-label="${esc(f.label)}"${f.req ? ' data-required="1"' : ''}${f.type ? ` data-type="${f.type}"` : ''}`;
    const ph = f.ph ? ` placeholder="${esc(f.ph)}"` : '';
    switch (f.type) {
      case 'textarea': return `<textarea ${attrs}${ph} rows="3" maxlength="1500"></textarea>`;
      case 'select': return `<select ${attrs}>${optionsHtml(f.options)}</select>`;
      case 'date': return `<input type="date" ${attrs}>`;
      case 'money': return `<input type="text" inputmode="decimal" maxlength="24" ${attrs}${ph}>`;
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
            <span>${esc(c.label)}${c.key ? '<small>— ключевой документ</small>' : ''}${c.note ? `<small>— ${esc(c.note)}</small>` : ''}</span>
          </label>`).join('')}
        <div class="checklist-foot">
          <span id="docsCount"></span>
          <button type="button" class="link-btn" id="docsAll">Отметить все обязательные</button>
        </div>
      </div>` : '';
    const statuses = Object.entries(STATUSES).filter(([k]) => k !== 'na' || b.allowNA);
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
        <div class="seg${b.allowNA ? ' has-na' : ''}" role="radiogroup" aria-label="Статус проверки блока ${b.n}" data-seg="${b.n}">
          ${statuses.map(([k, s]) => `
            <label class="seg-opt ${k}">
              <input type="radio" name="${statusName}" value="${k}" data-block="${b.n}">
              <span><i>${s.icon}</i><b class="l-full">${s.label}</b><b class="l-short">${s.short}</b></span>
            </label>`).join('')}
        </div>
        ${checklist}
        <div class="fields${b.wide ? ' cols-3' : ''}">
          ${b.fields.map((f) => `
            <label class="field${f.full ? ' full' : ''}${f.id === 'source' ? ' keep-na' : ''}">
              <span class="label">${esc(f.label)}${f.req ? ' <i class="req">*</i>' : ''}</span>
              ${controlHtml(b, f)}
            </label>`).join('')}
        </div>
        <div class="files" data-files="${b.n}">
          <div class="files-list" id="files-${b.n}"></div>
          <label class="btn sm ghost file-add">Приложить файл
            <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" data-upload="${b.n}">
          </label>
        </div>
      </article>`;
  }

  $('#blocks').innerHTML = BLOCKS.map(blockHtml).join('');
  $('#blockNav').innerHTML = BLOCKS.map((b) => `<a href="#block-${b.n}" class="bn" data-n="${b.n}" title="${esc(b.title)}">${b.n}</a>`).join('')
    + '<a href="#conclusion" class="bn bn-end" data-n="end" title="Заключение">Итог</a>';
  META_FIELDS.forEach((f) => { if (f.options) $(`#${f.id}`).innerHTML = optionsHtml(f.options); });
  $('#recommendation').innerHTML = optionsHtml(RECOMMENDATIONS);

  /* =========================================================
     Данные формы
     ========================================================= */
  function collect() {
    const data = { schema: DC.SCHEMA };
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
    BLOCKS.forEach((b) => b.fields.forEach((f) => { if (f.defaultToday) $(`#${fname(b.n, f.id)}`).value = t; }));
    if (state.user) $('#reviewer').value = state.user.name;
  }

  function resetForm(data) {
    state.loading = true;
    form.reset();
    if (data) apply(data); else setDefaults();
    clearErrors();
    refresh(true);
    state.loading = false;
  }

  /* =========================================================
     Автосохранение на сервер
     ========================================================= */
  let saveTimer;
  const setSaveState = (text, cls = '') => {
    const el = $('#saveState');
    el.textContent = text;
    el.className = `save-state ${cls}`;
  };

  function markDirty() {
    if (state.loading || state.readOnly) return;
    state.dirty = true;
    setSaveState('Есть несохраненные изменения');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 800);
  }

  let saveChain = Promise.resolve();
  /* Сохранения идут строго по очереди: иначе ответы могут прийти вразнобой
     и версия для защиты от одновременной правки собьется */
  function flush() {
    clearTimeout(saveTimer);
    saveChain = saveChain.then(doSave);
    return saveChain;
  }

  async function doSave() {
    if (!state.dirty || state.readOnly) return true;
    state.dirty = false;
    state.saving = true;
    setSaveState('Сохранение…');
    const data = collect();
    try {
      if (state.id) {
        const r = await api.save(state.id, data, state.lock);
        state.lock = r.lockVersion;
      } else {
        const r = await api.create(data);
        state.id = r.id;
        state.lock = r.lockVersion;
        history.replaceState(null, '', `#/edit/${r.id}`);
        document.title = 'Черновик — Alliance Group';
        state.record = { ownerName: state.user.name, ownerId: state.user.id, status: 'draft' };
        updateNavCount();
        syncChrome();
      }
      setSaveState(`Сохранено в ${new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`, 'ok');
      return true;
    } catch (e) {
      state.dirty = true;
      setSaveState('Не сохранено', 'bad');
      toast(`Не удалось сохранить: ${e.message}`, 'error');
      return false;
    } finally {
      state.saving = false;
    }
  }

  window.addEventListener('beforeunload', (e) => {
    if (state.dirty) { e.preventDefault(); e.returnValue = ''; }
  });

  /* =========================================================
     Расчеты и живые индикаторы
     ========================================================= */
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

  function blockFill(b, data) {
    const st = data[fname(b.n, 'status')];
    let total = 1, done = st ? 1 : 0;
    b.fields.forEach((f) => {
      if (st === 'na' ? f.id !== 'source' : !f.req) return;
      total++;
      if (data[fname(b.n, f.id)]) done++;
    });
    return { done, total };
  }

  const TOP_REQUIRED = ['check_date', 'purpose', 'partner_disclosure', 'strengths', 'risks', 'recommendation', 'reviewer'];

  let lastLevel = null;
  function refresh(instant) {
    const data = collect();

    $(`#${fname(13, 'months_left')}`).value = DC.monthsLeft(data.check_date, data[fname(13, 'planned')]);

    let reqDone = TOP_REQUIRED.filter((id) => data[id]).length;
    let reqTotal = TOP_REQUIRED.length;

    BLOCKS.forEach((b) => {
      const st = data[fname(b.n, 'status')];
      const card = $(`#block-${b.n}`);
      ['ok', 'warn', 'risk', 'na'].forEach((k) => card.classList.toggle(`st-${k}`, st === k));
      const { done, total } = blockFill(b, data);
      reqDone += done; reqTotal += total;
      const fc = $(`#fill-${b.n}`);
      fc.textContent = done === total ? '✓ Заполнено' : `${done} / ${total}`;
      fc.classList.toggle('done', done === total);
      const chip = $(`.bn[data-n="${b.n}"]`);
      const current = chip.classList.contains('current');
      chip.className = `bn${st ? ` st-${st}` : ''}${done === total ? ' done' : ''}${card.classList.contains('has-error') ? ' err' : ''}${current ? ' current' : ''}`;
      chip.setAttribute('aria-label', `Блок ${b.n}, ${b.title}: ${st ? STATUSES[st].label : 'не проверено'}`);
    });

    const docs = data[fname(12, 'docs')] || [];
    $('#docsCount').textContent = `Отмечено документов: ${docs.length} из ${BLOCKS.find((b) => b.n === 12).checklist.length}`;

    const ev = DC.evaluate(data);
    const panel = $('#scorePanel');
    panel.classList.remove('level-high', 'level-mid', 'level-low');
    if (ev.level) panel.classList.add(`level-${ev.level}`);
    if (ev.level && ev.level !== lastLevel && !instant && !reduceMotion) {
      panel.classList.remove('flash'); void panel.offsetWidth; panel.classList.add('flash');
    }
    lastLevel = ev.level;
    if (instant) { shownScore = ev.score; $('#scoreValue').textContent = fmtScore(ev.score); } else animateScore(ev.score);
    $('#scoreMax').textContent = `из ${ev.max} баллов`;
    $('#ringFg').style.strokeDasharray = RING_LEN;
    $('#ringFg').style.strokeDashoffset = RING_LEN * (1 - (ev.max ? ev.score / ev.max : 0));
    const checked = BLOCKS.length - ev.counts.none;
    $('#cntOk').textContent = ev.counts.ok;
    $('#cntWarn').textContent = ev.counts.warn;
    $('#cntRisk').textContent = ev.counts.risk;
    $('#cntNone').textContent = ev.counts.none;
    const recHint = $('#recHint');
    if (ev.complete) {
      $('#scoreTitle').textContent = LEVELS[ev.level].title;
      $('#scoreNote').textContent = `Все ${BLOCKS.length} блоков оценены. Уровень риска: ${LEVELS[ev.level].risk.toLowerCase()}.`;
      const rec = LEVELS[ev.level].rec;
      recHint.innerHTML = LEVELS[ev.level].allowed.includes(data.recommendation)
        ? '✓ Не противоречит результату по баллам'
        : `По баллам: «${esc(rec)}» <button type="button" class="link-btn" id="recApply">Применить</button>`;
    } else {
      $('#scoreTitle').textContent = `Проверено блоков: ${checked} из ${BLOCKS.length}`;
      $('#scoreNote').textContent = 'Итоговый уровень риска появится после оценки всех блоков.';
      recHint.textContent = '';
    }

    const pct = reqTotal ? Math.round((reqDone / reqTotal) * 100) : 0;
    $('#dockPct').textContent = `${pct}%`;
    $('#dockSub').textContent = `${checked} из ${BLOCKS.length} ${plural(BLOCKS.length, 'блока', 'блоков', 'блоков')} оценено`;
    $('#dockArc').style.strokeDasharray = DOCK_LEN;
    $('#dockArc').style.strokeDashoffset = DOCK_LEN * (1 - pct / 100);
    $('#dock').classList.toggle('ready', pct === 100);
  }

  /* =========================================================
     Файлы-подтверждения
     ========================================================= */
  const fmtSize = (n) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} МБ` : `${Math.max(1, Math.round(n / 1024))} КБ`);

  function drawFiles() {
    BLOCKS.forEach((b) => {
      $(`#files-${b.n}`).innerHTML = state.files.filter((f) => f.block === b.n).map((f) => `
        <div class="file-row">
          <a href="/api/files/${esc(f.id)}" download>${esc(f.filename)}</a>
          <span class="muted">${fmtSize(f.size)}</span>
          ${f.locked || state.readOnly ? '' : `<button type="button" class="link-btn" data-del-file="${esc(f.id)}">Удалить</button>`}
        </div>`).join('');
    });
  }

  async function uploadFile(input) {
    const file = input.files[0];
    const block = Number(input.dataset.upload);
    input.value = '';
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) { toast('Файл больше 4 МБ. Сожмите его или разделите на части.', 'error'); return; }
    if (!state.id) { state.dirty = true; if (!(await flush()) || !state.id) return; }
    try {
      const { file: saved } = await api.uploadFile(state.id, block, file);
      state.files.push(saved);
      drawFiles();
      toast('Файл приложен', 'ok');
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  /* =========================================================
     Проверка
     ========================================================= */
  function clearErrors() {
    $$('.invalid', form).forEach((el) => { el.classList.remove('invalid'); el.removeAttribute('aria-invalid'); el.removeAttribute('aria-describedby'); });
    $$('.field-error', form).forEach((el) => el.remove());
    $$('.has-error', form).forEach((el) => el.classList.remove('has-error'));
    $('#errors').hidden = true;
  }

  function elementFor(field) {
    if (field.startsWith('seg-')) return $(`[data-seg="${field.slice(4)}"]`);
    if (field === fname(12, 'docs')) return $('.checklist');
    return document.getElementById(field);
  }

  function markInvalid(el, msg) {
    el.classList.add('invalid');
    if (msg && el.matches('input,select,textarea')) {
      const note = document.createElement('span');
      note.className = 'field-error';
      note.id = `err-${el.id || el.name}`;
      note.textContent = msg;
      el.setAttribute('aria-invalid', 'true');
      el.setAttribute('aria-describedby', note.id);
      el.insertAdjacentElement('afterend', note);
    }
    const card = el.closest('.block');
    if (card) card.classList.add('has-error');
    if (!reduceMotion) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); }
  }

  function showErrors(errors) {
    clearErrors();
    const items = errors.map((e) => ({ el: elementFor(e.field), text: `${e.where} · ${e.label}: ${e.text}`, msg: e.text }));
    items.forEach((i) => { if (i.el && !i.el.classList.contains('invalid')) markInvalid(i.el, i.msg); });
    const box = $('#errors');
    box.innerHTML = `
      <div class="errors-head">
        <h4>Заключение не выпущено — ${errors.length} ${plural(errors.length, 'замечание', 'замечания', 'замечаний')}</h4>
        <button type="button" class="btn sm ghost" id="errNext">К первому →</button>
      </div>
      <ul>${items.map((e, i) => `<li><button type="button" data-i="${i}">${esc(e.text)}</button></li>`).join('')}</ul>`;
    box.hidden = false;
    $$('li button', box).forEach((btn) => btn.addEventListener('click', () => focusEl(items[+btn.dataset.i].el)));
    $('#errNext').addEventListener('click', () => focusEl(items[0].el));
    refresh(true);
    toast(`Исправьте ${errors.length} ${plural(errors.length, 'замечание', 'замечания', 'замечаний')}: первое подсвечено`, 'error');
    if (items[0] && items[0].el) focusEl(items[0].el);
  }

  function focusEl(el) {
    if (!el) return;
    const block = el.closest('.block');
    if (block) block.classList.add('in');
    el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
    const target = el.matches('input,select,textarea') ? el : el.querySelector('input');
    if (target) setTimeout(() => target.focus({ preventScroll: true }), reduceMotion ? 0 : 380);
  }

  /* =========================================================
     Выпуск и согласование
     ========================================================= */
  async function issue() {
    if (state.readOnly) return;
    const errors = DC.validateData(DC.sanitize(collect()));
    if (errors.length) { showErrors(errors); return; }
    clearErrors();
    const btn = $('#btnMake');
    btn.classList.add('busy');
    btn.disabled = true;
    try {
      if (!state.id) state.dirty = true;
      await flush();
      if (state.dirty || !state.id) return;
      if (isManager()) {
        const r = await api.issue(state.id);
        toast(`Заключение ${r.number} выпущено, редакция ${r.version}`, 'ok');
        const id = state.id;
        state.id = null;
        location.hash = `#/doc/${id}`;
      } else {
        await api.submit(state.id);
        toast('Заключение отправлено руководителю', 'ok');
        state.id = null;
        location.hash = '#/admin';
      }
      updateNavCount();
    } catch (e) {
      if (e.errors) showErrors(e.errors); else toast(e.message, 'error');
    } finally {
      btn.classList.remove('busy');
      btn.disabled = false;
    }
  }

  /* =========================================================
     Кнопки и баннер под текущее состояние заключения
     ========================================================= */
  function syncChrome() {
    const rec = state.record;
    const banner = $('#editBanner');
    const manager = isManager();
    let text = '';
    if (rec && rec.status === 'revoked') text = `Заключение ${rec.number} аннулировано. Чтобы его менять, сначала восстановите его в реестре.`;
    else if (rec && rec.inReview && !manager) text = 'Заключение на проверке у руководителя. Правка откроется, если его вернут на доработку.';
    else if (rec && rec.inReview && manager) text = `На проверке, подготовил(а): ${rec.ownerName}. Можно поправить, выпустить или вернуть с комментарием.`;
    else if (rec && rec.number && state.readOnly) text = `Заключение ${rec.number} выпущено. Новую редакцию готовит руководитель, доступен только просмотр.`;
    else if (rec && rec.number) text = `Новая редакция заключения ${rec.number}. Текущая редакция ${rec.version} останется в истории.`;
    else if (rec && rec.reviewComment) text = `Руководитель вернул на доработку: ${rec.reviewComment}`;
    else if (rec && !state.readOnly) text = `Черновик, подготовил(а): ${rec.ownerName}.`;
    else if (rec && state.readOnly) text = `Черновик ведет ${rec.ownerName}. Доступен только просмотр.`;
    $('#editBannerText').textContent = text;
    banner.hidden = !text;
    $('#editBannerActions').innerHTML = rec ? '<a class="btn sm ghost" href="#/admin">В реестр</a>' : '';

    $('#btnMakeLabel').textContent = manager ? 'Выпустить заключение' : 'Отправить руководителю';
    $('#btnMake').hidden = state.readOnly;
    $('#btnReturn').hidden = !(rec && rec.inReview && manager);
    const discard = $('#btnDiscard');
    const canDelete = rec && !rec.number && !state.readOnly;
    const canDrop = rec && rec.number && rec.hasWorking && manager && !state.readOnly;
    discard.hidden = !(canDelete || canDrop);
    discard.textContent = canDrop ? 'Отменить правки редакции' : 'Удалить черновик';
    $('#btnPreview').hidden = !state.id;
    $('#btnDemo').hidden = state.readOnly || !/^(localhost|127\.0\.0\.1)$/.test(location.hostname);

    for (const el of form.elements) {
      if (el.tagName === 'FIELDSET' || el.id === 'btnPreview') continue;
      if (el.type === 'button' && el.id !== 'docsAll' && !el.closest('.files')) continue;
      el.disabled = state.readOnly;
    }
    form.classList.toggle('readonly', state.readOnly);
  }

  /* =========================================================
     Маршрутизация
     ========================================================= */
  const VIEWS = { login: '#loginView', form: '#formView', cert: '#certView', admin: '#adminView', users: '#usersView', account: '#accountView' };

  function showView(name) {
    Object.entries(VIEWS).forEach(([k, sel]) => {
      const el = $(sel);
      const on = k === name;
      el.hidden = !on;
      if (on && !reduceMotion) { el.classList.remove('view-enter'); void el.offsetWidth; el.classList.add('view-enter'); }
    });
    document.body.className = `view-${name}`;
    $('#topbar').hidden = name === 'login';
    $$('.nav a[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === name || (name === 'cert' && a.dataset.nav === 'admin')));
    if (state.view !== name) window.scrollTo(0, 0);
    state.view = name;
  }

  function openNew() {
    state.id = null;
    state.lock = null;
    state.record = null;
    state.files = [];
    state.readOnly = false;
    state.dirty = false;
    resetForm(null);
    drawFiles();
    setSaveState('');
    syncChrome();
    showView('form');
    document.title = 'Новая проверка — Alliance Group';
  }

  async function openEdit(id) {
    let rec;
    try {
      rec = await api.get(id);
    } catch (e) {
      toast(e.message, 'error');
      location.hash = '#/admin';
      return;
    }
    state.id = id;
    state.lock = rec.lockVersion;
    state.record = rec;
    state.files = rec.attachments;
    state.dirty = false;
    const manager = isManager();
    const mine = rec.ownerId === state.user.id;
    state.readOnly = rec.status === 'revoked'
      || (!manager && (rec.status !== 'draft' || !mine || rec.inReview));
    resetForm(rec.data);
    drawFiles();
    setSaveState('');
    syncChrome();
    showView('form');
    document.title = `${rec.number || 'Черновик'} — Alliance Group`;
  }

  let routeToken = 0;
  async function route() {
    if (!state.user) return;
    const token = ++routeToken;
    if (state.dirty) await flush();
    if (token !== routeToken) return;
    const [view, a, b] = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
    switch (view) {
      case 'admin':
        showView('admin');
        document.title = 'Реестр заключений — Alliance Group';
        await DC.admin.render($('#adminView'), state.user);
        break;
      case 'users':
        if (!isManager()) { location.hash = '#/admin'; return; }
        showView('users');
        document.title = 'Сотрудники — Alliance Group';
        await DC.staff.renderUsers($('#usersView'), state.user);
        break;
      case 'account':
        showView('account');
        document.title = 'Профиль — Alliance Group';
        DC.staff.renderAccount($('#accountView'), state.user);
        break;
      case 'doc':
        showView('cert');
        await DC.admin.showDocument(a, b, state.user);
        break;
      case 'edit':
        await openEdit(a);
        break;
      default:
        openNew();
    }
    if (token !== routeToken) return;
    /* Для чтения с экрана: после смены раздела фокус переходит к его заголовку */
    const heading = $(`${VIEWS[state.view]} h1`);
    if (heading && !$(`${VIEWS[state.view]}`).contains(document.activeElement)) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
  }

  async function updateNavCount() {
    try {
      const { items } = await api.list();
      const pending = items.filter((i) => i.inReview).length;
      const el = $('#navCount');
      el.textContent = pending || '';
      el.title = 'На проверке';
      el.hidden = !(pending && isManager());
    } catch (e) { /* счетчик не критичен */ }
  }

  /* Копия из реестра: новый черновик с теми же данными, но свежими датами */
  async function startFrom(data) {
    const copy = { ...data, check_date: todayISO(), strengths: data.strengths, schema: DC.SCHEMA };
    const r = await api.create(copy);
    location.hash = `#/edit/${r.id}`;
  }

  /* =========================================================
     Вход и выход
     ========================================================= */
  function signedIn(user) {
    state.user = user;
    $('#navUser').textContent = user.name;
    $('#navUsers').hidden = user.role !== 'manager';
    updateNavCount();
    route();
  }

  function signOutLocal() {
    state.user = null;
    state.dirty = false;
    state.id = null;
    $('#loginPassword').value = '';
    showView('login');
    document.title = 'Вход — Alliance Group';
  }
  DC.onSignedOut = signOutLocal;

  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#loginError');
    const btn = $('#loginBtn');
    err.hidden = true;
    btn.disabled = true;
    btn.textContent = 'Входим…';
    try {
      const { user } = await api.login($('#loginEmail').value.trim(), $('#loginPassword').value);
      signedIn(user);
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Войти';
    }
  });

  $('#loginShow').addEventListener('click', (e) => {
    const input = $('#loginPassword');
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    e.currentTarget.textContent = show ? 'Скрыть' : 'Показать';
    e.currentTarget.setAttribute('aria-pressed', String(show));
    input.focus();
  });

  /* =========================================================
     Уведомления и диалог
     ========================================================= */
  function toast(text, type = '') {
    const box = $('#toasts');
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerHTML = `<i>${type === 'ok' ? '✓' : type === 'error' ? '!' : 'i'}</i><span>${esc(text)}</span>`;
    box.appendChild(t);
    while (box.children.length > 3) box.firstElementChild.remove();
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 250); }, type === 'error' ? 5200 : 2800);
  }

  function dialog({ title, text, ok = 'OK', danger = false, input = false, placeholder = '' }) {
    const dlg = $('#dialog');
    $('#dlgTitle').textContent = title;
    $('#dlgText').textContent = text;
    const field = $('#dlgInput');
    field.hidden = !input;
    field.value = '';
    field.placeholder = placeholder;
    const okBtn = $('#dlgOk');
    okBtn.textContent = ok;
    okBtn.classList.toggle('danger', danger);
    dlg.returnValue = '';
    dlg.showModal();
    return new Promise((resolve) => {
      dlg.addEventListener('close', () => {
        const yes = dlg.returnValue === 'ok';
        resolve(input ? (yes ? field.value.trim() : null) : yes);
      }, { once: true });
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
     Демо-данные: кнопка видна только при локальном запуске,
     чтобы выдуманная компания не попала в боевой реестр
     ========================================================= */
  function demoData() {
    const t = todayISO();
    const d = (y, m) => { const x = new Date(); x.setFullYear(x.getFullYear() + y, x.getMonth() + m, 15); return x.toISOString().slice(0, 10); };
    return {
      check_date: t, purpose: 'Покупка недвижимости', partner_disclosure: 'Партнерских отношений нет',
      b1_status: 'ok', b1_name: 'ЖК «Навруз Резиденс»', b1_address: 'г. Ташкент, Мирзо-Улугбекский район, ул. Примерная, 12', b1_cadastre: '10:07:03:01:01:0457', b1_source: `Кадастровое агентство, выписка от ${fmtDate(t)}`,
      b2_status: 'ok', b2_legal_name: 'ООО «Пример Курилиш Инвест»', b2_reg_number: '№ 012345 от 14.03.2018', b2_state: 'Действует', b2_relation: 'Заказчик строительства и инвестор',
      b3_status: 'ok', b3_inn: '305123456', b3_match: 'Совпадает', b3_source: `Единый государственный реестр, ${fmtDate(t)}`,
      b4_status: 'warn', b4_declared: '5000000000', b4_paid: '3200000000', b4_last_change: '12.01.2025 — увеличение до 5 млрд сум', b4_sufficiency: 'Оплачено 64% заявленного фонда; для объекта данного масштаба капитал умеренный',
      b5_status: 'ok', b5_founders: 'Иванов А. Б.\nООО «Пример Холдинг»', b5_shares: '60%\n40%', b5_beneficiaries: 'Иванов А. Б. (прямо и через ООО «Пример Холдинг»)', b5_changes: 'Без изменений', b5_related: 'ООО «Пример Бетон»', b5_source: 'Реестр, устав от 12.01.2025',
      b6_status: 'ok', b6_fio: 'Петров Сергей Николаевич', b6_appointed: '2023-02-01', b6_basis: 'Решение общего собрания участников № 3', b6_links: 'Ограничений не выявлено',
      b7_status: 'ok', b7_activity: '41.20 — Строительство жилых и нежилых зданий', b7_construction: 'Да', b7_experience: '8', b7_projects: '4 объекта: ЖК «Первый», ЖК «Второй» и др.',
      b8_status: 'ok', b8_legal_address: 'г. Ташкент, ул. Примерная, 1', b8_office: 'г. Ташкент, ул. Примерная, 12, офис продаж', b8_confirmed: 'Да', b8_source: `Реестр и выезд на место, ${fmtDate(t)}`,
      b9_status: 'ok', b9_amount: '0', b9_settlement: 'Нет долга', b9_date: t, b9_source: 'my.soliq.uz — справка об отсутствии задолженности',
      b10_status: 'ok', b10_number: '326010012345', b10_reg_date: '2018-04-01', b10_state: 'Действует', b10_source: `Официальный налоговый сервис, ${fmtDate(t)}`,
      b11_status: 'warn', b11_count: '2', b11_total: '48500000', b11_significant: '№ 12-345/2025, взыскатель ООО «Поставщик», поставка материалов, 48,5 млн сум — в процессе погашения', b11_date: t, b11_source: 'Бюро принудительного исполнения',
      b12_status: 'ok', b12_docs: ['land', 'land_use', 'apz', 'psd', 'expertise', 'permit', 'supervision', 'contractor', 'approvals'],
      b12_customer: 'ООО «Пример Курилиш Инвест», ИНН 305123456', b12_general: 'ООО «Генподряд Строй», ИНН 302654321', b12_designer: 'ООО «Проект Лойиха», лицензия № 0042',
      b12_permit_doc: 'Уведомление о начале СМР № 77 от 10.05.2024, инспекция', b12_expertise_doc: '№ 18/24 от 02.04.2024 — положительное', b12_source: 'Заверенные копии, реестр разрешений', b12_missing: 'Документы о вводе в эксплуатацию не требуются (объект строится)',
      b13_status: 'warn', b13_planned: d(1, 3), b13_expected: d(1, 6), b13_readiness: '55', b13_deviation: '≈ 3 месяца', b13_source: 'Отчет технического надзора, осмотр', b13_assessment: 'Темп работ удовлетворительный, возможен перенос ввода на квартал из-за поставок фасадных материалов',
      b14_status: 'ok', b14_basis: 'Разрешение на привлечение средств покупателей', b14_doc: '№ 45 от 20.05.2024, уполномоченный орган', b14_scope: 'Да', b14_encumbrance: 'Обременений по участку не выявлено', b14_funds: 'Расчетный счет застройщика', b14_source: 'Заверенная копия, реестр',
      b15_status: 'warn', b15_contract: 'Проект договора долевого участия от 01.10.2026', b15_parties: 'Да', b15_object_match: 'Да', b15_price: 'Цена фиксирована, рассрочка на 24 месяца', b15_deadline: 'Срок передачи указан, неустойка не предусмотрена', b15_exit: 'Возврат средств в течение 60 дней', b15_clauses: 'П. 6.3: перенос срока без неустойки. Требовать фиксированный срок и неустойку за просрочку.', b15_source: 'Проект договора от застройщика',
      strengths: 'Полный пакет разрешительной документации, отсутствие налоговой задолженности, прозрачная структура собственности.',
      risks: 'Неполная оплата уставного фонда; открытое исполнительное производство; отставание от графика ≈ 3 месяца; нет неустойки за просрочку.',
      requests: 'Справку о погашении исполнительного производства; обновленный график строительства; дополнение к договору о неустойке.',
      recommendation: RECOMMENDATIONS[1],
      reviewer: state.user ? state.user.name : '',
    };
  }

  /* =========================================================
     События
     ========================================================= */
  form.addEventListener('input', (e) => {
    const el = e.target;
    if (el.type === 'file') return;
    if (el.classList.contains('invalid')) {
      const f = fieldDefs.get(el.name);
      if (!f || !DC.fieldProblem(f, el.value)) {
        el.classList.remove('invalid');
        const next = el.nextElementSibling;
        if (next && next.classList.contains('field-error')) next.remove();
      }
    }
    if (el.dataset.type === 'inn') el.value = el.value.replace(/\D/g, '').slice(0, 9);
    refresh();
    markDirty();
  });

  form.addEventListener('change', (e) => {
    const el = e.target;
    if (el.type === 'file') { uploadFile(el); return; }
    if (el.type === 'radio') {
      const seg = el.closest('.seg');
      seg.classList.remove('invalid');
      const card = el.closest('.block');
      if (card && !$$('.invalid', card).length) card.classList.remove('has-error');
    }
    if (el.type === 'checkbox') $('.checklist').classList.remove('invalid');
    refresh();
    markDirty();
  });

  form.addEventListener('focusout', (e) => {
    const el = e.target;
    if (el.dataset.type === 'money' && el.value.trim()) el.value = fmtMoney(el.value.trim());
  });

  form.addEventListener('submit', (e) => { e.preventDefault(); issue(); });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && state.view === 'form') { e.preventDefault(); issue(); }
  });

  form.addEventListener('click', async (e) => {
    if (e.target.id === 'recApply') {
      const ev = DC.evaluate(collect());
      if (ev.level) { $('#recommendation').value = LEVELS[ev.level].rec; refresh(); markDirty(); }
    }
    if (e.target.id === 'docsAll') {
      const optional = new Set(BLOCKS.find((b) => b.n === 12).checklist.filter((c) => c.optional).map((c) => c.id));
      $$(`input[name="${fname(12, 'docs')}"]`).forEach((c) => { if (!optional.has(c.value)) c.checked = true; });
      $('.checklist').classList.remove('invalid');
      refresh(); markDirty();
    }
    const del = e.target.dataset && e.target.dataset.delFile;
    if (del) {
      try {
        await api.deleteFile(del);
        state.files = state.files.filter((f) => f.id !== del);
        drawFiles();
      } catch (ex) { toast(ex.message, 'error'); }
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

  $('#btnDemo').addEventListener('click', () => {
    resetForm(demoData());
    markDirty();
    toast('Форма заполнена тестовыми данными', 'ok');
  });

  $('#btnPreview').addEventListener('click', async () => {
    await flush();
    if (state.id && !state.dirty) location.hash = `#/doc/${state.id}/working`;
  });

  $('#btnDiscard').addEventListener('click', async () => {
    const rec = state.record;
    const isDraft = !(rec && rec.number);
    if (!(await dialog({
      title: isDraft ? 'Удалить черновик?' : 'Отменить правки?',
      text: isDraft ? 'Черновик и приложенные к нему файлы будут удалены.' : 'Несохраненная редакция будет удалена. Выпущенные редакции не изменятся.',
      ok: isDraft ? 'Удалить' : 'Отменить правки',
      danger: true,
    }))) return;
    try {
      state.dirty = false;
      clearTimeout(saveTimer);
      await saveChain;
      await api.discard(state.id);
      state.id = null;
      toast(isDraft ? 'Черновик удален' : 'Правки отменены');
      location.hash = '#/admin';
    } catch (e) { toast(e.message, 'error'); }
  });

  $('#btnReturn').addEventListener('click', async () => {
    const comment = await dialog({ title: 'Вернуть на доработку', text: 'Сотрудник увидит этот комментарий в заключении.', ok: 'Вернуть', input: true, placeholder: 'Что нужно исправить' });
    if (comment === null) return;
    try {
      await flush();
      await api.sendBack(state.id, comment);
      toast('Заключение возвращено', 'ok');
      state.id = null;
      updateNavCount();
      location.hash = '#/admin';
    } catch (e) { toast(e.message, 'error'); }
  });

  window.addEventListener('beforeprint', () => $$('.reveal').forEach((el) => el.classList.add('in')));

  let resizeT;
  window.addEventListener('resize', () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => { if (state.view === 'cert') DC.certificate.fit($('#certificate')); }, 60);
  });

  window.addEventListener('hashchange', route);

  /* =========================================================
     Старт
     ========================================================= */
  Object.assign(DC, { toast, dialog, startFrom, updateNavCount, signOutLocal, isManager });

  (async () => {
    try {
      const { user } = await api.me();
      signedIn(user);
    } catch (e) {
      signOutLocal();
      if (e.status !== 401) {
        $('#loginError').textContent = e.message;
        $('#loginError').hidden = false;
      }
    }
  })();

})(window.DC);
