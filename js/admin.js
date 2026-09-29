/* Реестр сертификатов (админка): поиск, фильтры, статистика, действия, импорт/экспорт */
(function (DC) {
  'use strict';

  const { LEVELS, MAX_SCORE, esc, fmtDate, fmtDateTime, fmtScore, plural } = DC;

  const state = { q: '', level: '', status: '', sort: 'new' };

  function filtered(items) {
    const q = state.q.trim().toLowerCase();
    let res = items.filter((r) => {
      if (state.level && r.level !== state.level) return false;
      if (state.status && r.status !== state.status) return false;
      if (!q) return true;
      return [r.number, r.developer, r.project, r.inn, r.reviewer, r.code].some((v) => String(v || '').toLowerCase().includes(q));
    });
    const by = {
      new: (a, b) => String(b.createdAt).localeCompare(String(a.createdAt)),
      old: (a, b) => String(a.createdAt).localeCompare(String(b.createdAt)),
      scoreDesc: (a, b) => b.score - a.score,
      scoreAsc: (a, b) => a.score - b.score,
      number: (a, b) => String(a.number).localeCompare(String(b.number), 'ru', { numeric: true }),
    }[state.sort];
    return res.sort(by);
  }

  function stats(items) {
    const active = items.filter((r) => r.status !== 'revoked');
    const avg = active.length ? active.reduce((s, r) => s + r.score, 0) / active.length : 0;
    const by = (lv) => active.filter((r) => r.level === lv).length;
    return { total: items.length, active: active.length, revoked: items.length - active.length, avg, high: by('high'), mid: by('mid'), low: by('low') };
  }

  function statTile(label, value, cls = '', note = '') {
    return `<div class="stat ${cls}"><div class="stat-val" data-count="${value}">${value}</div><div class="stat-label">${label}</div>${note ? `<div class="stat-note">${note}</div>` : ''}</div>`;
  }

  function rowHtml(r) {
    const L = LEVELS[r.level] || LEVELS.low;
    const revoked = r.status === 'revoked';
    return `
      <article class="reg-row${revoked ? ' revoked' : ''}" data-id="${esc(r.id)}">
        <div class="reg-main">
          <div class="reg-num">${esc(r.number)}${revoked ? ' <span class="pill risk mini">аннулирован</span>' : ''}</div>
          <div class="reg-dev">${esc(r.developer)}</div>
          <div class="reg-proj">${esc(r.project)} · ИНН ${esc(r.inn)}</div>
        </div>
        <div class="reg-date"><span class="k">Проверка</span>${fmtDate(r.checkDate)}<span class="k2">выдан ${fmtDateTime(r.createdAt)}${r.version > 1 ? ` · ред. ${r.version}` : ''}</span></div>
        <div class="reg-score">
          <div class="mini-bar"><i class="lv-${r.level}" style="width:${(r.score / MAX_SCORE) * 100}%"></i></div>
          <b>${fmtScore(r.score)}</b><span>/ ${MAX_SCORE}</span>
          <span class="pill ${r.level}">${L.short}</span>
        </div>
        <div class="reg-actions">
          <button type="button" class="btn sm primary" data-act="open">Открыть</button>
          <button type="button" class="btn sm ghost" data-act="edit">Изменить</button>
          <details class="menu">
            <summary class="btn sm ghost" aria-label="Еще действия">•••</summary>
            <div class="menu-list">
              <button type="button" data-act="copy">Создать копию</button>
              <button type="button" data-act="${revoked ? 'restore' : 'revoke'}">${revoked ? 'Восстановить' : 'Аннулировать'}</button>
              <button type="button" data-act="delete" class="danger">Удалить</button>
            </div>
          </details>
        </div>
      </article>`;
  }

  function render(root) {
    const items = DC.store.all();
    const st = stats(items);
    root.innerHTML = `
      <div class="admin">
        <header class="admin-head">
          <div>
            <div class="eyebrow">Администрирование</div>
            <h1>Реестр сертификатов</h1>
            <p class="muted">Все выданные сертификаты, их статус и результаты. Данные хранятся в этом браузере — для переноса используйте экспорт и импорт.</p>
          </div>
          <div class="admin-cta">
            <a class="btn primary" href="#/new">+ Новая проверка</a>
          </div>
        </header>

        <section class="stats">
          ${statTile('Всего выдано', st.total, '', st.revoked ? `аннулировано: ${st.revoked}` : 'действующих: ' + st.active)}
          ${statTile('Средний балл', fmtScore(Math.round(st.avg * 10) / 10), '', `из ${MAX_SCORE}`)}
          ${statTile('Высокая надежность', st.high, 'lv-high')}
          ${statTile('Средняя', st.mid, 'lv-mid')}
          ${statTile('Низкая', st.low, 'lv-low')}
        </section>

        <section class="reg-tools">
          <label class="search">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>
            <input type="search" id="regQ" placeholder="Поиск: номер, застройщик, ИНН, проект, код" value="${esc(state.q)}">
          </label>
          <select id="regLevel" aria-label="Уровень">
            <option value="">Все уровни</option>
            <option value="high"${state.level === 'high' ? ' selected' : ''}>Высокая</option>
            <option value="mid"${state.level === 'mid' ? ' selected' : ''}>Средняя</option>
            <option value="low"${state.level === 'low' ? ' selected' : ''}>Низкая</option>
          </select>
          <select id="regStatus" aria-label="Статус">
            <option value="">Все статусы</option>
            <option value="issued"${state.status === 'issued' ? ' selected' : ''}>Действующие</option>
            <option value="revoked"${state.status === 'revoked' ? ' selected' : ''}>Аннулированные</option>
          </select>
          <select id="regSort" aria-label="Сортировка">
            <option value="new"${state.sort === 'new' ? ' selected' : ''}>Сначала новые</option>
            <option value="old"${state.sort === 'old' ? ' selected' : ''}>Сначала старые</option>
            <option value="scoreDesc"${state.sort === 'scoreDesc' ? ' selected' : ''}>Балл ↓</option>
            <option value="scoreAsc"${state.sort === 'scoreAsc' ? ' selected' : ''}>Балл ↑</option>
            <option value="number"${state.sort === 'number' ? ' selected' : ''}>По номеру</option>
          </select>
          <div class="io">
            <button type="button" class="btn sm ghost" id="regExport">Экспорт JSON</button>
            <button type="button" class="btn sm ghost" id="regCsv">Экспорт CSV</button>
            <button type="button" class="btn sm ghost" id="regImport">Импорт</button>
            <input type="file" id="regFile" accept="application/json,.json" hidden>
          </div>
        </section>

        <section class="reg-list" id="regList"></section>
      </div>`;

    const listEl = root.querySelector('#regList');
    const draw = () => {
      const res = filtered(DC.store.all());
      if (!items.length) {
        listEl.innerHTML = `
          <div class="empty">
            <div class="empty-mark">ПЗ</div>
            <h3>Реестр пока пуст</h3>
            <p class="muted">Заполните форму проверки — выпущенный сертификат автоматически появится здесь.</p>
            <a class="btn primary" href="#/new">Начать проверку</a>
          </div>`;
        return;
      }
      listEl.innerHTML = res.length
        ? `<div class="reg-count">${res.length} ${plural(res.length, 'сертификат', 'сертификата', 'сертификатов')}</div>` + res.map(rowHtml).join('')
        : `<div class="empty small"><h3>Ничего не найдено</h3><p class="muted">Измените запрос или фильтры.</p></div>`;
    };
    draw();

    let t;
    root.querySelector('#regQ').addEventListener('input', (e) => { state.q = e.target.value; clearTimeout(t); t = setTimeout(draw, 80); });
    root.querySelector('#regLevel').addEventListener('change', (e) => { state.level = e.target.value; draw(); });
    root.querySelector('#regStatus').addEventListener('change', (e) => { state.status = e.target.value; draw(); });
    root.querySelector('#regSort').addEventListener('change', (e) => { state.sort = e.target.value; draw(); });

    root.querySelector('#regExport').addEventListener('click', () => {
      download(`reestr-sertifikatov-${DC.todayISO()}.json`, DC.store.exportJSON(), 'application/json');
      DC.toast('Реестр выгружен в JSON');
    });
    root.querySelector('#regCsv').addEventListener('click', () => {
      const cols = ['Номер', 'Застройщик', 'ИНН', 'Проект', 'Дата проверки', 'Баллы', 'Уровень', 'Статус', 'Контрольный код', 'Проверяющий', 'Выдан'];
      const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const lines = [cols.map(q).join(';')].concat(DC.store.all().map((r) => [
        r.number, r.developer, r.inn, r.project, fmtDate(r.checkDate), fmtScore(r.score), (LEVELS[r.level] || {}).short,
        r.status === 'revoked' ? 'Аннулирован' : 'Действует', r.code, r.reviewer, fmtDateTime(r.createdAt),
      ].map(q).join(';')));
      download(`reestr-sertifikatov-${DC.todayISO()}.csv`, '﻿' + lines.join('\r\n'), 'text/csv');
      DC.toast('Реестр выгружен в CSV (открывается в Excel)');
    });
    const file = root.querySelector('#regFile');
    root.querySelector('#regImport').addEventListener('click', () => file.click());
    file.addEventListener('change', async () => {
      const f = file.files[0];
      if (!f) return;
      try {
        const { added, updated } = DC.store.importJSON(await f.text());
        DC.toast(`Импорт завершен: добавлено ${added}, обновлено ${updated}`, 'ok');
        render(root);
        DC.updateNavCount();
      } catch (err) {
        DC.toast(`Ошибка импорта: ${err.message}`, 'error');
      }
      file.value = '';
    });

    listEl.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const row = btn.closest('.reg-row');
      const id = row.dataset.id;
      const rec = DC.store.get(id);
      const menu = btn.closest('details');
      if (menu) menu.open = false;
      if (!rec) return;
      switch (btn.dataset.act) {
        case 'open': location.hash = `#/cert/${id}`; break;
        case 'edit': location.hash = `#/edit/${id}`; break;
        case 'copy':
          DC.startFrom(DC.store.duplicate(id));
          DC.toast(`Создана копия ${rec.number} — проверьте данные и выпустите сертификат`);
          break;
        case 'revoke':
          if (await DC.confirm({ title: `Аннулировать ${rec.number}?`, text: 'Сертификат останется в реестре с отметкой «Аннулирован», на листах появится водяной знак. Действие можно отменить.', ok: 'Аннулировать', danger: true })) {
            DC.store.setStatus(id, 'revoked'); DC.toast(`Сертификат ${rec.number} аннулирован`); render(root);
          }
          break;
        case 'restore':
          DC.store.setStatus(id, 'issued'); DC.toast(`Сертификат ${rec.number} восстановлен`, 'ok'); render(root);
          break;
        case 'delete':
          if (await DC.confirm({ title: `Удалить ${rec.number}?`, text: 'Запись будет удалена из реестра без возможности восстановления. Если нужно сохранить историю — используйте «Аннулировать».', ok: 'Удалить', danger: true })) {
            row.classList.add('leaving');
            setTimeout(() => { DC.store.remove(id); DC.toast(`Сертификат ${rec.number} удален`); render(root); DC.updateNavCount(); }, 200);
          }
          break;
      }
    });

    // закрывать меню «•••» при клике вне его
    root.addEventListener('click', (e) => {
      root.querySelectorAll('details.menu[open]').forEach((d) => { if (!d.contains(e.target)) d.open = false; });
    });
  }

  function download(name, content, type) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /* ---------------- проверка подлинности ---------------- */
  function renderVerify(root, preset = {}) {
    root.innerHTML = `
      <div class="verify">
        <div class="eyebrow">Проверка подлинности</div>
        <h1>Проверить сертификат</h1>
        <p class="muted">Введите номер сертификата и контрольный код из нижней части любого листа. Проверка выполняется по реестру этого браузера.</p>
        <form class="verify-form" id="verifyForm" novalidate>
          <label class="field"><span class="label">Номер сертификата</span><input id="vNum" placeholder="ПЗ-2026-001" value="${esc(preset.num || '')}"></label>
          <label class="field"><span class="label">Контрольный код</span><input id="vCode" placeholder="XXXX-XXXX" value="${esc(preset.code || '')}" maxlength="9"></label>
          <button class="btn primary" type="submit">Проверить</button>
        </form>
        <div id="vResult" aria-live="polite"></div>
      </div>`;
    const form = root.querySelector('#verifyForm');
    const out = root.querySelector('#vResult');
    const check = () => {
      const num = root.querySelector('#vNum').value.trim();
      const code = root.querySelector('#vCode').value.trim().toUpperCase().replace(/[^0-9A-F]/g, '');
      if (!num) { out.innerHTML = ''; return; }
      const rec = DC.store.findByNumber(num);
      let cls, title, text;
      if (!rec) {
        cls = 'bad'; title = 'Сертификат не найден'; text = 'В реестре нет сертификата с таким номером. Проверьте номер или обратитесь к организации, выдавшей сертификат.';
      } else if (code && code !== rec.code.replace('-', '')) {
        cls = 'bad'; title = 'Контрольный код не совпадает'; text = 'Данные на предъявленном документе отличаются от данных в реестре — документ мог быть изменен или относится к старой редакции.';
      } else if (rec.status === 'revoked') {
        cls = 'warn'; title = 'Сертификат аннулирован'; text = 'Сертификат с таким номером был выдан, но впоследствии аннулирован.';
      } else {
        cls = 'good'; title = code ? 'Сертификат действителен' : 'Сертификат найден'; text = code ? 'Номер и контрольный код совпадают с данными реестра.' : 'Для полной проверки укажите контрольный код.';
      }
      out.innerHTML = `
        <div class="v-card ${cls}">
          <div class="v-icon">${cls === 'good' ? '✓' : cls === 'warn' ? '!' : '✕'}</div>
          <div>
            <h3>${title}</h3>
            <p>${text}</p>
            ${rec ? `<dl class="v-kv">
              <div><dt>Застройщик</dt><dd>${esc(rec.developer)}</dd></div>
              <div><dt>Проект</dt><dd>${esc(rec.project)}</dd></div>
              <div><dt>Дата проверки</dt><dd>${fmtDate(rec.checkDate)}</dd></div>
              <div><dt>Результат</dt><dd>${fmtScore(rec.score)} из ${MAX_SCORE} · ${(LEVELS[rec.level] || {}).short || ''}</dd></div>
            </dl>
            <a class="btn sm ghost" href="#/cert/${esc(rec.id)}">Открыть сертификат</a>` : ''}
          </div>
        </div>`;
    };
    form.addEventListener('submit', (e) => { e.preventDefault(); check(); });
    if (preset.num) check();
  }

  DC.admin = { render, renderVerify };
})(window.DC);
