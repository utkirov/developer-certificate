/* Документ: сборка содержимого и раскладка по отдельным листам A4 */
(function (DC) {
  'use strict';

  const { STATUSES, LEVELS, ISSUER, esc, fname, fmtDate, fmtDateTime, fmtScore, valueText } = DC;

  const RING_LEN = 2 * Math.PI * 52;
  let lang = 'ru';
  /* Подписи и значения из списков переводятся словарем; свободный текст аналитика остается как есть */
  const t = (s) => (lang === 'uz' && DC.UZ && DC.UZ[s]) || s;

  const html = (s) => {
    const tpl = document.createElement('template');
    tpl.innerHTML = s.trim();
    return tpl.content.firstElementChild;
  };

  function ringSvg(score, max, level) {
    const off = RING_LEN * (1 - (max ? score / max : 0));
    return `
      <div class="ring level-${level}">
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <circle class="ring-bg" cx="60" cy="60" r="52"/>
          <circle class="ring-fg" cx="60" cy="60" r="52" stroke-dasharray="${RING_LEN}" stroke-dashoffset="${off}"/>
        </svg>
        <div class="ring-text"><span>${fmtScore(score)}</span><small>${t('из')} ${max} ${t('баллов')}</small></div>
      </div>`;
  }

  /* QR ведет на публичную страницу проверки именно этой редакции */
  function qrBlock(rec) {
    if (!rec.qrSvg) return `<div class="doc-qr empty-qr"><span>${t('QR-код появится при выпуске')}</span></div>`;
    return `<div class="doc-qr">${rec.qrSvg}<span>${t('Проверить подлинность')}</span></div>`;
  }

  /* ---------------- пагинация ---------------- */

  function newPage(ctx) {
    const first = ctx.pages.length === 0;
    const { rec } = ctx;
    const mark = rec.preview ? 'Черновик' : rec.status === 'revoked' ? 'Аннулировано' : rec.version !== rec.latestVersion ? 'Устарела' : '';
    const slot = html(`
      <div class="page-slot">
        <section class="page${first ? ' page-first' : ''}">
          <div class="page-frame">
            <span class="corner tl"></span><span class="corner tr"></span><span class="corner bl"></span><span class="corner br"></span>
            ${mark ? `<div class="watermark">${t(mark)}</div>` : ''}
            ${first ? '' : `
            <header class="page-head">
              <span class="ph-title">${t('Заключение о проверке застройщика')}</span>
              <span class="ph-num">№ ${esc(rec.number || '—')}</span>
            </header>`}
            <div class="page-body"></div>
            <footer class="page-foot">
              <span>${t('Контрольный код')} <b class="cert-code">${esc(rec.code || '—')}</b></span>
              <span class="ph-mid">${esc(rec.data.b2_legal_name || '')}</span>
              <span class="page-no"></span>
            </footer>
          </div>
        </section>
      </div>`);
    ctx.container.appendChild(slot);
    const page = slot.querySelector('.page');
    ctx.pages.push(page);
    ctx.body = page.querySelector('.page-body');
  }

  const overflows = (body) => body.scrollHeight > body.clientHeight + 1;

  /** Переносит «висящие» заголовки (keep-next) вместе со следующим элементом */
  function breakPage(ctx) {
    const carry = [];
    while (ctx.body.lastElementChild && ctx.body.lastElementChild.classList.contains('keep-next')) {
      carry.unshift(ctx.body.lastElementChild);
      ctx.body.lastElementChild.remove();
    }
    if (ctx.body.childElementCount === 0 && carry.length) {
      carry.forEach((n) => ctx.body.appendChild(n));
      return;
    }
    newPage(ctx);
    carry.forEach((n) => ctx.body.appendChild(n));
  }

  function place(ctx, node) {
    ctx.body.appendChild(node);
    if (!overflows(ctx.body) || ctx.body.childElementCount === 1) return;
    node.remove();
    breakPage(ctx);
    ctx.body.appendChild(node);
  }

  /** Делимый элемент: при нехватке места продолжается на следующем листе */
  function placeSplit(ctx, makeShell, parts) {
    let shell = makeShell(false);
    ctx.body.appendChild(shell.root);
    parts.forEach((part) => {
      shell.target.appendChild(part);
      if (!overflows(ctx.body)) return;
      part.remove();
      if (shell.target.childElementCount === 0) {
        shell.root.remove();
        if (ctx.body.childElementCount > 0) breakPage(ctx);
        ctx.body.appendChild(shell.root);
      } else {
        newPage(ctx);
        shell = makeShell(true);
        ctx.body.appendChild(shell.root);
      }
      shell.target.appendChild(part);
    });
  }

  function forceBreak(ctx) {
    if (ctx.body.childElementCount > 0) newPage(ctx);
  }

  /* ---------------- содержимое ---------------- */

  function render(container, rec, language = 'ru') {
    lang = language;
    const data = rec.data;
    const ev = DC.evaluate(data);
    const level = ev.level || 'low';
    const L = LEVELS[level];
    const g = (n, id) => data[fname(n, id)] || '';
    const number = rec.number || t('Без номера');
    const until = DC.validUntil(data.check_date);
    const statusLabel = (st) => (st ? t(STATUSES[st].label) : t('Не оценено'));

    container.innerHTML = '';
    container.lang = lang;
    const ctx = { container, rec, pages: [], body: null };
    newPage(ctx);

    place(ctx, html(`
      <header class="cert-head">
        <div>
          <svg class="cert-logo" viewBox="0 0 460 185" aria-label="Alliance Group"><use href="#ag-logo"></use></svg>
          <h1>${t('Заключение')}<br>${t('о проверке застройщика')}</h1>
          <div class="cert-meta">
            <span>№ <b>${esc(number)}</b></span>
            <span>${t('Дата проверки')}: <b>${fmtDate(data.check_date)}</b></span>
            <span>${t('Цель')}: <b>${esc(t(data.purpose))}</b></span>
          </div>
        </div>
        ${qrBlock(rec)}
      </header>`));

    const intro = lang === 'uz'
      ? `Ushbu xulosa <b>${esc(g(2, 'legal_name'))}</b> quruvchisi (STIR ${esc(g(3, 'inn'))}) haqidagi maʼlumotlarni <b>${esc(g(1, 'name'))}</b> loyihasi boʻyicha (manzil: ${esc(g(1, 'address'))}) ${ev.rows.length} ta asosiy blok doirasida tekshirish natijalarini oʻz ichiga oladi.`
      : `Настоящее заключение содержит результаты проверки сведений о застройщике
        <b>${esc(g(2, 'legal_name'))}</b> (ИНН ${esc(g(3, 'inn'))}) по проекту
        <b>${esc(g(1, 'name'))}</b>, расположенному по адресу: ${esc(g(1, 'address'))},
        по ${ev.rows.length} ключевым блокам юридической прозрачности, задолженностей, договора и готовности объекта.`;
    place(ctx, html(`<p class="cert-lead">${intro}</p>`));

    place(ctx, html(`
      <section class="cert-score">
        ${ringSvg(ev.score, ev.max, level)}
        <div>
          <div class="cs-label">${t('Итоговый уровень надежности')}</div>
          <div class="level-title">${t(L.title)} <span class="pill ${level}">${t(L.risk)}</span></div>
          <div class="counts">
            <span>${t('Подтверждено')}: <b>${ev.counts.ok}</b></span>
            <span>${t('С замечаниями')}: <b>${ev.counts.warn}</b></span>
            <span>${t('Риск')}: <b>${ev.counts.risk}</b></span>
            ${ev.counts.na ? `<span>${t('Не применимо')}: <b>${ev.counts.na}</b></span>` : ''}
          </div>
          <div class="cert-rec">${t('Рекомендация')}: <b>${esc(t(data.recommendation))}</b></div>
        </div>
      </section>`));

    place(ctx, html(`<h2 class="keep-next">${t('Сводка по блокам')}</h2>`));
    const tableShell = (cont) => {
      const root = html(`
        <div class="table-wrap">
          ${cont ? `<div class="cont">${t('Сводка по блокам')} — ${t('продолжение')}</div>` : ''}
          <table class="cert-table">
            <thead><tr><th></th><th>${t('Блок проверки')}</th><th class="c">${t('Вес')}</th><th>${t('Статус')}</th><th class="r">${t('Баллы')}</th></tr></thead>
            <tbody></tbody>
          </table>
        </div>`);
      return { root, target: root.querySelector('tbody') };
    };
    const rows = ev.rows.map(({ b, st, pts }) => html(`
      <table><tr>
        <td class="n">${b.n}</td>
        <td>${esc(t(b.title))}${b.critical ? ` <span class="pill risk mini">${t('критический')}</span>` : ''}</td>
        <td class="c">${st === 'na' ? '—' : b.weight}</td>
        <td><span class="pill ${st}">${statusLabel(st)}</span></td>
        <td class="r">${st === 'na' ? '—' : `${fmtScore(pts)} / ${b.weight}`}</td>
      </tr></table>`).querySelector('tr'));
    rows.push(html(`<table><tr class="total"><td></td><td>${t('Итого')}</td><td class="c">${ev.max}</td><td></td><td class="r">${fmtScore(ev.score)} / ${ev.max}</td></tr></table>`).querySelector('tr'));
    placeSplit(ctx, tableShell, rows);

    forceBreak(ctx);
    place(ctx, html(`<h2 class="keep-next">${t('Результаты проверки по блокам')}</h2>`));

    ev.rows.forEach(({ b, st, pts }) => {
      const shell = (cont) => {
        const root = html(`
          <div class="detail st-${st}">
            <div class="detail-head">
              <div class="num">${b.n}</div>
              <h3>${esc(t(b.title))}${cont ? ` <span class="cont-inline">— ${t('продолжение')}</span>` : ''}</h3>
              ${cont ? '' : `<span class="pill ${st}">${statusLabel(st)}</span>${st === 'na' ? '' : `<span class="pts">${fmtScore(pts)} ${t('из')} ${b.weight}</span>`}`}
            </div>
            <dl class="kv"></dl>
          </div>`);
        return { root, target: root.querySelector('.kv') };
      };
      const parts = [];
      if (b.checklist) {
        const checked = data[fname(b.n, 'docs')] || [];
        const done = b.checklist.filter((c) => checked.includes(c.id)).length;
        parts.push(html(`
          <div class="full">
            <dt>${t('Проверенные документы')} · ${done} ${t('из')} ${b.checklist.length}</dt>
            <dd><ul class="doc-list">${b.checklist.map((c) => {
              const yes = checked.includes(c.id);
              return `<li class="${yes ? 'yes' : 'no'}"><span class="mark">${yes ? '✓' : '—'}</span><span>${esc(t(c.label))}${c.note ? ` (${esc(t(c.note))})` : ''}</span></li>`;
            }).join('')}</ul></dd>
          </div>`));
      }
      b.fields.forEach((f) => {
        const v = valueText(f, g(b.n, f.id));
        if (!v) return;
        const full = f.type === 'textarea' || f.full || v.length > 60;
        const shown = f.type === 'select' ? t(v) : v;
        parts.push(html(`<div class="${full ? 'full' : ''}"><dt>${esc(t(f.label))}</dt><dd>${esc(shown)}</dd></div>`));
      });
      const files = (rec.attachments || []).filter((a) => a.block === b.n);
      if (files.length) {
        parts.push(html(`<div class="full"><dt>${t('Приложенные подтверждения')}</dt><dd>${files.map((a) => esc(a.filename)).join('; ')}</dd></div>`));
      }
      placeSplit(ctx, shell, parts);
    });

    place(ctx, html(`<h2 class="keep-next">${t('Заключение проверяющего')}</h2>`));
    const concl = [
      [t('Подтвержденные сильные стороны'), data.strengths],
      [t('Выявленные риски'), data.risks],
      [t('Что запросить до заключения договора'), data.requests || '—'],
    ];
    const totalLen = concl.reduce((s, c) => s + String(c[1]).length, 0);
    if (totalLen < 700) {
      place(ctx, html(`<div class="concl keep-next">${concl.map(([h, v]) => `<div><h4>${h}</h4><p>${esc(v)}</p></div>`).join('')}</div>`));
    } else {
      concl.forEach(([h, v]) => place(ctx, html(`<div class="concl one"><div><h4>${h}</h4><p>${esc(v)}</p></div></div>`)));
    }
    place(ctx, html(`<div class="rec-banner keep-next ${level}"><small>${t('Итоговая рекомендация')}</small>${esc(t(data.recommendation))}</div>`));

    place(ctx, html(`
      <section class="cert-summary keep-next">
        <div class="cs-label">${t('Реквизиты заключения')}</div>
        <dl>
          <div><dt>${t('Номер')}</dt><dd>${esc(number)}${rec.version > 1 ? ` · ${t('редакция')} ${rec.version}` : ''}</dd></div>
          <div><dt>${t('Дата проверки')}</dt><dd>${fmtDate(data.check_date)}</dd></div>
          <div><dt>${t('Цель')}</dt><dd>${esc(t(data.purpose))}</dd></div>
          <div class="wide"><dt>${t('Застройщик')}</dt><dd>${esc(g(2, 'legal_name'))}, ${t('ИНН')} ${esc(g(3, 'inn'))}</dd></div>
          <div><dt>${t('Итоговый балл')}</dt><dd>${fmtScore(ev.score)} ${t('из')} ${ev.max}</dd></div>
          <div class="wide"><dt>${t('Объект')}</dt><dd>${esc(g(1, 'name'))} — ${esc(g(1, 'address'))}</dd></div>
          <div><dt>${t('Уровень надежности')}</dt><dd>${t(L.short)} · ${t(L.risk)}</dd></div>
          <div class="wide"><dt>${t('Исполнитель')}</dt><dd>${esc(ISSUER.name)}, ${t('ИНН')} ${esc(ISSUER.inn)}, ${esc(ISSUER.phone)}</dd></div>
          <div><dt>${t('Сведения стоит обновить после')}</dt><dd>${fmtDate(until)}</dd></div>
          ${data.partner_disclosure ? `<div class="wide"><dt>${t('Отношения с застройщиком')}</dt><dd>${esc(t(data.partner_disclosure))}</dd></div>` : ''}
        </dl>
      </section>`));

    const issuedLine = rec.issuedAt ? `${t('Выпущено')}: ${fmtDateTime(rec.issuedAt)}${rec.version > 1 ? ` · ${t('редакция')} ${rec.version}` : ''}.` : '';
    place(ctx, html(`
      <section class="cert-final">
        <div class="cert-sign">
          <div class="line">
            <div class="cap">${t('Проверку выполнил')}</div>
            <div class="val">${esc(data.reviewer)}</div>
          </div>
          <div class="sign-box">
            <div class="line">
              <div class="cap">${t('Подпись и печать')}</div>
              <div class="val">${esc(data.sign_note) || '&nbsp;'}</div>
            </div>
            <div class="mp">${t('М.П.')}</div>
          </div>
        </div>
        <div class="cert-notes">
          <p>${t('Оценка отражает сведения, доступные на дату проверки, и зависит от полноты представленных документов. Заключение не является государственной гарантией, разрешением на строительство или заключением о юридической чистоте сделки.')}</p>
          <p>${esc(t(DC.scaleNote(data)))} ${issuedLine}</p>
        </div>
      </section>`));

    const total = ctx.pages.length;
    ctx.pages.forEach((p, i) => {
      p.querySelector('.page-no').textContent = `${t('Лист')} ${i + 1} ${t('из')} ${total}`;
      p.style.setProperty('--i', i);
    });
    fit(container);
    return total;
  }

  /** Масштабирует листы под ширину экрана (на печать не влияет) */
  function fit(container) {
    const page = container.querySelector('.page');
    if (!page) return;
    const pageW = page.offsetWidth;
    const pageH = page.offsetHeight;
    const cs = getComputedStyle(container);
    const avail = container.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const s = Math.min(1, avail / pageW);
    container.style.setProperty('--scale', s);
    container.style.setProperty('--page-w', `${pageW}px`);
    container.style.setProperty('--page-h', `${pageH}px`);
  }

  DC.certificate = { render, fit };
})(window.DC);
