/* Реестр заключений и просмотр документа с историей */
(function (DC) {
  'use strict';

  const { LEVELS, esc, fmtDate, fmtDateTime, fmtScore, plural, api } = DC;

  const state = { q: '', level: '', status: '', sort: 'new', items: [] };

  const stageOf = (r) => {
    if (r.status === 'revoked') return 'revoked';
    if (r.inReview) return 'review';
    if (r.status === 'issued') return 'issued';
    return 'draft';
  };
  const STAGES = {
    draft: { label: 'Черновик', cls: '' },
    review: { label: 'На проверке', cls: 'info' },
    issued: { label: 'Выпущено', cls: 'high' },
    revoked: { label: 'Аннулировано', cls: 'low' },
  };

  function filtered(items) {
    const q = state.q.trim().toLowerCase();
    const res = items.filter((r) => {
      if (state.level && r.level !== state.level) return false;
      if (state.status && stageOf(r) !== state.status) return false;
      if (!q) return true;
      return [r.number, r.developer, r.project, r.inn, r.reviewer, r.code, r.ownerName].some((v) => String(v || '').toLowerCase().includes(q));
    });
    const by = {
      new: (a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)),
      old: (a, b) => String(a.updatedAt).localeCompare(String(b.updatedAt)),
      scoreDesc: (a, b) => b.score / (b.max || 1) - a.score / (a.max || 1),
      scoreAsc: (a, b) => a.score / (a.max || 1) - b.score / (b.max || 1),
      number: (a, b) => String(a.number || '').localeCompare(String(b.number || ''), 'ru', { numeric: true }),
    }[state.sort];
    return res.sort(by);
  }

  function stats(items) {
    const issued = items.filter((r) => r.status === 'issued');
    const avg = issued.length ? issued.reduce((s, r) => s + r.score / (r.max || 1), 0) / issued.length : 0;
    const by = (lv) => issued.filter((r) => r.level === lv).length;
    return {
      issued: issued.length,
      revoked: items.filter((r) => r.status === 'revoked').length,
      work: items.filter((r) => r.status === 'draft' || r.inReview).length,
      avg, high: by('high'), mid: by('mid'), low: by('low'),
    };
  }

  const statTile = (label, value, cls = '', note = '') =>
    `<div class="stat ${cls}"><div class="stat-val">${value}</div><div class="stat-label">${label}</div>${note ? `<div class="stat-note">${note}</div>` : ''}</div>`;

  function rowHtml(r, me) {
    const stage = stageOf(r);
    const manager = me.role === 'manager';
    const hasDoc = !!r.number;
    const L = LEVELS[r.level];
    const editable = manager ? stage !== 'revoked' : (stage === 'draft' && r.ownerId === me.id);
    return `
      <article class="reg-row${stage === 'revoked' ? ' revoked' : ''}" data-id="${esc(r.id)}">
        <div class="reg-main">
          <div class="reg-num">${esc(r.number || 'Без номера')} <span class="pill ${STAGES[stage].cls} mini">${STAGES[stage].label}</span>${r.hasWorking && r.number ? ' <span class="pill info mini">есть правки</span>' : ''}</div>
          <div class="reg-dev">${esc(r.developer || 'Застройщик не указан')}</div>
          <div class="reg-proj">${esc(r.project || 'Проект не указан')}${r.inn ? ` · ИНН ${esc(r.inn)}` : ''} · ${esc(r.ownerName)}</div>
          ${r.reviewComment ? `<div class="reg-comment">Вернули: ${esc(r.reviewComment)}</div>` : ''}
        </div>
        <div class="reg-date"><span class="k">${hasDoc ? 'Проверка' : 'Изменено'}</span>${hasDoc ? fmtDate(r.checkDate) : fmtDateTime(r.updatedAt)}<span class="k2">${r.issuedAt ? `выпущено ${fmtDateTime(r.issuedAt)}${r.version > 1 ? ` · ред. ${r.version}` : ''}` : ''}</span></div>
        <div class="reg-score">
          <div class="mini-bar"><i class="lv-${r.level || 'none'}" style="width:${r.max ? (r.score / r.max) * 100 : 0}%"></i></div>
          <b>${fmtScore(r.score)}</b><span>/ ${r.max}</span>
          ${L ? `<span class="pill ${r.level}">${L.short}</span>` : ''}
        </div>
        <div class="reg-actions">
          ${hasDoc ? '<button type="button" class="btn sm primary" data-act="open">Открыть</button>' : ''}
          ${editable ? `<button type="button" class="btn sm ${hasDoc ? 'ghost' : 'primary'}" data-act="edit">${hasDoc ? 'Изменить' : 'Продолжить'}</button>` : ''}
          ${!hasDoc && !editable ? '<button type="button" class="btn sm ghost" data-act="edit">Посмотреть</button>' : ''}
          <details class="menu">
            <summary class="btn sm ghost" aria-label="Еще действия">•••</summary>
            <div class="menu-list">
              <button type="button" data-act="copy">Создать копию</button>
              ${manager && r.status === 'issued' ? '<button type="button" data-act="revoke">Аннулировать</button>' : ''}
              ${manager && r.status === 'revoked' ? '<button type="button" data-act="restore">Восстановить</button>' : ''}
            </div>
          </details>
        </div>
      </article>`;
  }

  function download(name, content, type) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /* Excel воспринимает значения с =, +, -, @ как формулы: название из формы не должно исполняться */
  const csvCell = (v) => {
    let s = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };

  async function render(root, me) {
    const { items } = await api.list();
    state.items = items;
    const st = stats(items);
    const manager = me.role === 'manager';
    root.innerHTML = `
      <div class="admin">
        <header class="admin-head">
          <div>
            <h1>Реестр заключений</h1>
          </div>
          <div class="admin-cta">
            <a class="btn primary" href="#/">+ Новая проверка</a>
          </div>
        </header>

        <section class="stats">
          ${statTile('Выпущено', st.issued, '', `аннулировано: ${st.revoked} · в работе: ${st.work}`)}
          ${statTile('Средний результат', `${fmtScore(Math.round(st.avg * 100))}%`, '', 'от применимых баллов')}
          ${statTile('Высокая надежность', st.high, 'lv-high')}
          ${statTile('Средняя надежность', st.mid, 'lv-mid')}
          ${statTile('Низкая надежность', st.low, 'lv-low')}
        </section>

        <section class="reg-tools">
          <label class="search">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>
            <input type="search" id="regQ" placeholder="Поиск: номер, застройщик, ИНН, проект, код" value="${esc(state.q)}">
          </label>
          <select id="regLevel" aria-label="Уровень">
            <option value="">Все уровни</option>
            ${Object.entries(LEVELS).map(([k, v]) => `<option value="${k}"${state.level === k ? ' selected' : ''}>${v.short}</option>`).join('')}
          </select>
          <select id="regStatus" aria-label="Статус">
            <option value="">Все статусы</option>
            ${Object.entries(STAGES).map(([k, v]) => `<option value="${k}"${state.status === k ? ' selected' : ''}>${v.label}</option>`).join('')}
          </select>
          <select id="regSort" aria-label="Сортировка">
            <option value="new"${state.sort === 'new' ? ' selected' : ''}>Сначала новые</option>
            <option value="old"${state.sort === 'old' ? ' selected' : ''}>Сначала старые</option>
            <option value="scoreDesc"${state.sort === 'scoreDesc' ? ' selected' : ''}>Результат ↓</option>
            <option value="scoreAsc"${state.sort === 'scoreAsc' ? ' selected' : ''}>Результат ↑</option>
            <option value="number"${state.sort === 'number' ? ' selected' : ''}>По номеру</option>
          </select>
          <div class="io">
            <button type="button" class="btn sm ghost" id="regCsv">Экспорт CSV</button>
            ${manager ? `<button type="button" class="btn sm ghost" id="regExport">Резервная копия</button>
            <button type="button" class="btn sm ghost" id="regImport">Импорт старого реестра</button>
            <input type="file" id="regFile" accept="application/json,.json" hidden>` : ''}
          </div>
        </section>

        <section class="reg-list" id="regList"></section>
      </div>`;

    const listEl = root.querySelector('#regList');
    const draw = () => {
      if (!state.items.length) {
        listEl.innerHTML = `
          <div class="empty">
            <div class="empty-mark">ПЗ</div>
            <h3>Реестр пока пуст</h3>
            <p class="muted">Начните проверку: черновик появится здесь сразу, а номер заключение получит при выпуске.</p>
            <a class="btn primary" href="#/">Начать проверку</a>
          </div>`;
        return;
      }
      const res = filtered(state.items);
      listEl.innerHTML = res.length
        ? `<div class="reg-count">${res.length} ${plural(res.length, 'заключение', 'заключения', 'заключений')}</div>${res.map((r) => rowHtml(r, me)).join('')}`
        : '<div class="empty small"><h3>Ничего не найдено</h3><p class="muted">Измените запрос или фильтры.</p></div>';
    };
    draw();

    let t;
    root.querySelector('#regQ').addEventListener('input', (e) => { state.q = e.target.value; clearTimeout(t); t = setTimeout(draw, 80); });
    root.querySelector('#regLevel').addEventListener('change', (e) => { state.level = e.target.value; draw(); });
    root.querySelector('#regStatus').addEventListener('change', (e) => { state.status = e.target.value; draw(); });
    root.querySelector('#regSort').addEventListener('change', (e) => { state.sort = e.target.value; draw(); });

    root.querySelector('#regCsv').addEventListener('click', () => {
      const cols = ['Номер', 'Застройщик', 'ИНН', 'Проект', 'Дата проверки', 'Баллы', 'Максимум', 'Уровень', 'Статус', 'Контрольный код', 'Проверяющий', 'Выпущено'];
      const rows = state.items.map((r) => [
        r.number, r.developer, r.inn, r.project, fmtDate(r.checkDate), fmtScore(r.score), r.max, (LEVELS[r.level] || {}).short,
        STAGES[stageOf(r)].label, r.code, r.reviewer, r.issuedAt ? fmtDateTime(r.issuedAt) : '',
      ]);
      const text = [cols, ...rows].map((row) => row.map(csvCell).join(';')).join('\r\n');
      download(`reestr-${DC.todayISO()}.csv`, `﻿${text}`, 'text/csv');
      DC.toast('Реестр выгружен в CSV (открывается в Excel)');
    });

    if (manager) {
      root.querySelector('#regExport').addEventListener('click', async () => {
        try {
          const backup = await api.exportAll();
          download(`rezervnaya-kopiya-${DC.todayISO()}.json`, JSON.stringify(backup, null, 2), 'application/json');
          DC.toast('Резервная копия сохранена');
        } catch (e) { DC.toast(e.message, 'error'); }
      });
      const file = root.querySelector('#regFile');
      root.querySelector('#regImport').addEventListener('click', () => file.click());
      file.addEventListener('change', async () => {
        const f = file.files[0];
        if (!f) return;
        try {
          const report = await api.importLegacy(await f.text());
          const details = report.rejected.map((r) => `${r.number}: ${r.reason}`).join('\n');
          await DC.dialog({
            title: `Импорт: добавлено ${report.added}, отклонено ${report.rejected.length}`,
            text: `${details ? `${details}\n\n` : ''}Импортированные записи получили новые контрольные коды. Старые распечатки по старому коду не пройдут проверку: при необходимости распечатайте их заново.`,
          });
          render(root, me);
        } catch (err) {
          DC.toast(`Ошибка импорта: ${err.message}`, 'error');
        }
        file.value = '';
      });
    }

    listEl.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const id = btn.closest('.reg-row').dataset.id;
      const rec = state.items.find((r) => r.id === id);
      const menu = btn.closest('details');
      if (menu) menu.open = false;
      try {
        switch (btn.dataset.act) {
          case 'open': location.hash = `#/doc/${id}`; break;
          case 'edit': location.hash = `#/edit/${id}`; break;
          case 'copy': {
            const full = await api.get(id);
            await DC.startFrom(full.data);
            DC.toast('Создана копия: проверьте данные и даты');
            break;
          }
          case 'revoke': {
            const reason = await DC.dialog({ title: `Аннулировать ${rec.number}?`, text: 'Запись останется в реестре, на листах появится водяной знак, а публичная проверка покажет статус «Аннулировано». Действие можно отменить.', ok: 'Аннулировать', danger: true, input: true, placeholder: 'Причина аннулирования' });
            if (reason === null) return;
            await api.revoke(id, reason);
            DC.toast(`Заключение ${rec.number} аннулировано`);
            render(root, me);
            break;
          }
          case 'restore':
            await api.restore(id);
            DC.toast(`Заключение ${rec.number} восстановлено`, 'ok');
            render(root, me);
            break;
        }
      } catch (ex) { DC.toast(ex.message, 'error'); }
    });

    root.addEventListener('click', (e) => {
      root.querySelectorAll('details.menu[open]').forEach((d) => { if (!d.contains(e.target)) d.open = false; });
    });
  }

  /* ---------------- документ ---------------- */
  const ACTIONS = {
    create: 'Создан черновик', issue: 'Выпущена редакция', submit: 'Отправлено руководителю', send_back: 'Возвращено на доработку',
    revoke: 'Аннулировано', restore: 'Восстановлено', file_add: 'Приложен файл', file_delete: 'Удален файл',
    working_discard: 'Отменены правки', import: 'Импортировано', draft_delete: 'Удален черновик',
  };

  let docLang = 'ru';

  async function showDocument(id, versionArg, me) {
    const root = document.querySelector('#certificate');
    const info = document.querySelector('#certInfo');
    const actions = document.querySelector('#certActions');
    const history = document.querySelector('#docHistory');
    root.innerHTML = '';
    let doc, rec;
    try {
      [doc, rec] = await Promise.all([api.document(id, versionArg), api.get(id)]);
    } catch (e) {
      root.innerHTML = `<div class="empty"><h3>Документ не найден</h3><p class="muted">${esc(e.message)}</p><a class="btn primary" href="#/admin">Открыть реестр</a></div>`;
      info.innerHTML = '';
      actions.innerHTML = '';
      history.innerHTML = '';
      return;
    }
    const ev = DC.evaluate(doc.data);
    const L = LEVELS[ev.level];
    const manager = me.role === 'manager';
    const stateLabel = doc.preview ? 'предпросмотр' : doc.status === 'revoked' ? 'аннулировано' : doc.version !== doc.latestVersion ? 'устаревшая редакция' : '';
    info.innerHTML = `<b>${esc(doc.number || 'Без номера')}</b>${L ? `<span class="pill ${ev.level}">${fmtScore(ev.score)} / ${ev.max} · ${L.short}</span>` : ''}${stateLabel ? `<span class="pill risk">${stateLabel}</span>` : ''}<span class="tb-pages" id="tbPages"></span>`;
    const canEdit = manager ? doc.status !== 'revoked' : (rec.status === 'draft' && rec.ownerId === me.id && !rec.inReview);
    actions.innerHTML = `
      <div class="lang-switch" role="group" aria-label="Язык документа">
        <button type="button" class="${docLang === 'ru' ? 'on' : ''}" data-lang="ru">RU</button>
        <button type="button" class="${docLang === 'uz' ? 'on' : ''}" data-lang="uz">UZ</button>
      </div>
      ${canEdit ? `<a class="btn ghost sm" href="#/edit/${esc(id)}">${doc.preview ? 'К форме' : 'Изменить'}</a>` : ''}
      ${doc.preview && manager ? '<button type="button" class="btn primary sm" id="btnIssue">Выпустить</button>' : ''}
      ${doc.preview ? '' : '<button type="button" class="btn primary sm" id="btnPrint">Печать / PDF</button>'}`;
    document.title = `${doc.number || 'Предпросмотр'} — Alliance Group`;

    const paint = async () => {
      if (document.fonts && document.fonts.ready) {
        await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 800))]);
      }
      const total = DC.certificate.render(root, doc, docLang);
      document.querySelector('#tbPages').textContent = `${total} ${plural(total, 'лист', 'листа', 'листов')} A4`;
    };
    await paint();

    actions.querySelectorAll('[data-lang]').forEach((b) => b.addEventListener('click', () => {
      docLang = b.dataset.lang;
      actions.querySelectorAll('[data-lang]').forEach((x) => x.classList.toggle('on', x === b));
      paint();
    }));
    const printBtn = actions.querySelector('#btnPrint');
    if (printBtn) printBtn.addEventListener('click', () => window.print());
    const issueBtn = actions.querySelector('#btnIssue');
    if (issueBtn) {
      issueBtn.addEventListener('click', async () => {
        try {
          const r = await api.issue(id);
          DC.toast(`Заключение ${r.number} выпущено`, 'ok');
          DC.updateNavCount();
          showDocument(id, null, me);
          location.hash = `#/doc/${id}`;
        } catch (e) {
          DC.toast(e.errors ? 'Заключение заполнено не полностью: откройте форму и нажмите «Выпустить»' : e.message, 'error');
        }
      });
    }

    history.innerHTML = `
      <div class="dh-grid">
        <section>
          <h3>Редакции</h3>
          ${rec.revisions.length ? rec.revisions.map((r) => `
            <a class="dh-row${!doc.preview && r.version === doc.version ? ' on' : ''}" href="#/doc/${esc(id)}/${r.version}">
              <b>Редакция ${r.version}</b><span>${fmtDateTime(r.issuedAt)} · ${esc(r.issuedBy)}</span><code>${esc(r.code)}</code>
            </a>`).join('') : '<p class="muted">Еще не выпускалось.</p>'}
          ${rec.revokedReason ? `<p class="dh-reason">Причина аннулирования: ${esc(rec.revokedReason)}</p>` : ''}
          ${doc.verifyUrl ? `<p class="dh-link">Ссылка для проверки этой редакции:<br><a href="${esc(doc.verifyUrl)}" target="_blank" rel="noopener">${esc(doc.verifyUrl)}</a></p>` : ''}
        </section>
        <section>
          <h3>Журнал действий</h3>
          ${rec.log.map((l) => `<div class="dh-log"><span>${fmtDateTime(l.at)}</span><b>${esc(ACTIONS[l.action] || l.action)}${l.details && l.details.version ? ` ${l.details.version}` : ''}</b><span class="muted">${esc(l.actor || '')}</span>${l.details && (l.details.comment || l.details.reason || l.details.filename) ? `<em>${esc(l.details.comment || l.details.reason || l.details.filename)}</em>` : ''}</div>`).join('')}
        </section>
      </div>`;
  }

  DC.admin = { render, showDocument };
})(window.DC);
