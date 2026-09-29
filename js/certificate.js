/* Сертификат: сборка содержимого и раскладка по отдельным листам A4 */
(function (DC) {
  'use strict';

  const { STATUSES, BLOCKS, LEVELS, MAX_SCORE, esc, fname, fmtDate, fmtDateTime, fmtScore, valueText } = DC;

  const RING_LEN = 2 * Math.PI * 52;

  const html = (s) => {
    const t = document.createElement('template');
    t.innerHTML = s.trim();
    return t.content.firstElementChild;
  };

  function ringSvg(score, level) {
    const off = RING_LEN * (1 - score / MAX_SCORE);
    return `
      <div class="ring level-${level}">
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <circle class="ring-bg" cx="60" cy="60" r="52"/>
          <circle class="ring-fg" cx="60" cy="60" r="52" stroke-dasharray="${RING_LEN}" stroke-dashoffset="${off}"/>
        </svg>
        <div class="ring-text"><span>${fmtScore(score)}</span><small>из ${MAX_SCORE} баллов</small></div>
      </div>`;
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

  /* ---------------- пагинация ---------------- */

  function createCtx(container, rec) {
    return { container, rec, pages: [], body: null };
  }

  function newPage(ctx) {
    const first = ctx.pages.length === 0;
    const { rec } = ctx;
    const slot = html(`
      <div class="page-slot">
        <section class="page${first ? ' page-first' : ''}">
          <div class="page-frame">
            <span class="corner tl"></span><span class="corner tr"></span><span class="corner bl"></span><span class="corner br"></span>
            ${rec.status === 'revoked' ? '<div class="watermark">Аннулирован</div>' : ''}
            ${first ? '' : `
            <header class="page-head">
              <span class="ph-title">Сертификат проверки застройщика</span>
              <span class="ph-num">№ ${esc(rec.number)}</span>
            </header>`}
            <div class="page-body"></div>
            <footer class="page-foot">
              <span>Контрольный код <b class="cert-code">${esc(rec.code)}</b></span>
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
    // если на странице остались только заголовки — не создаем пустую страницу
    if (ctx.body.childElementCount === 0 && carry.length) {
      carry.forEach((n) => ctx.body.appendChild(n));
      return;
    }
    newPage(ctx);
    carry.forEach((n) => ctx.body.appendChild(n));
  }

  /** Неделимый элемент */
  function place(ctx, node) {
    ctx.body.appendChild(node);
    if (!overflows(ctx.body) || ctx.body.childElementCount === 1) return;
    node.remove();
    breakPage(ctx);
    ctx.body.appendChild(node);
  }

  /**
   * Делимый элемент: оболочка + части. При нехватке места
   * оболочка продолжается на следующем листе с пометкой «продолжение».
   */
  function placeSplit(ctx, makeShell, parts) {
    let shell = makeShell(false);
    ctx.body.appendChild(shell.root);
    parts.forEach((part) => {
      shell.target.appendChild(part);
      if (!overflows(ctx.body)) return;
      part.remove();
      if (shell.target.childElementCount === 0) {
        // ни одна часть не поместилась — переносим оболочку целиком
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

  function render(container, rec) {
    const data = rec.data;
    const ev = DC.evaluate(data);
    const level = ev.level || 'low';
    const L = LEVELS[level];
    const g = (n, id) => data[fname(n, id)] || '';

    container.innerHTML = '';
    const ctx = createCtx(container, rec);
    newPage(ctx);

    // --- титульная часть ---
    place(ctx, html(`
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
      </header>`));

    place(ctx, html(`
      <p class="cert-lead">
        Настоящий сертификат подтверждает, что проведена независимая проверка сведений о застройщике
        <b>${esc(g(2, 'legal_name'))}</b> (ИНН ${esc(g(3, 'inn'))}) по проекту
        <b>${esc(g(1, 'name'))}</b>, расположенному по адресу: ${esc(g(1, 'address'))},
        по ${BLOCKS.length} ключевым блокам юридической прозрачности, задолженностей и готовности объекта.
      </p>`));

    place(ctx, html(`
      <section class="cert-score">
        ${ringSvg(ev.score, level)}
        <div>
          <div class="cs-label">Итоговый уровень надежности</div>
          <div class="level-title">${L.title} <span class="pill ${level}">${L.risk}</span></div>
          <div class="counts">
            <span>Подтверждено: <b>${ev.counts.ok}</b></span>
            <span>С замечаниями: <b>${ev.counts.warn}</b></span>
            <span>Риск: <b>${ev.counts.risk}</b></span>
          </div>
          <div class="cert-rec">Рекомендация: <b>${esc(data.recommendation)}</b></div>
        </div>
      </section>`));

    // --- сводная таблица ---
    place(ctx, html(`<h2 class="keep-next">Сводка по блокам</h2>`));
    const tableShell = (cont) => {
      const root = html(`
        <div class="table-wrap">
          ${cont ? '<div class="cont">Сводка по блокам — продолжение</div>' : ''}
          <table class="cert-table">
            <thead><tr><th></th><th>Блок проверки</th><th class="c">Вес</th><th>Статус</th><th class="r">Баллы</th></tr></thead>
            <tbody></tbody>
          </table>
        </div>`);
      return { root, target: root.querySelector('tbody') };
    };
    const rows = ev.rows.map(({ b, st, pts }) => html(`
      <table><tr>
        <td class="n">${b.n}</td>
        <td>${esc(b.title)}${b.critical ? ' <span class="pill risk mini">критический</span>' : ''}</td>
        <td class="c">${b.weight}</td>
        <td><span class="pill ${st}">${STATUSES[st].label}</span></td>
        <td class="r">${fmtScore(pts)} / ${b.weight}</td>
      </tr></table>`).querySelector('tr'));
    rows.push(html(`<table><tr class="total"><td></td><td>Итого</td><td class="c">${MAX_SCORE}</td><td></td><td class="r">${fmtScore(ev.score)} / ${MAX_SCORE}</td></tr></table>`).querySelector('tr'));
    placeSplit(ctx, tableShell, rows);

    // --- подробные результаты: всегда с нового листа ---
    forceBreak(ctx);
    place(ctx, html(`<h2 class="keep-next">Результаты проверки по блокам</h2>`));

    ev.rows.forEach(({ b, st, pts }) => {
      const shell = (cont) => {
        const root = html(`
          <div class="detail st-${st}">
            <div class="detail-head">
              <div class="num">${b.n}</div>
              <h3>${esc(b.title)}${cont ? ' <span class="cont-inline">— продолжение</span>' : ''}</h3>
              ${cont ? '' : `<span class="pill ${st}">${STATUSES[st].label}</span><span class="pts">${fmtScore(pts)} из ${b.weight}</span>`}
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
            <dt>Проверенные документы · ${done} из ${b.checklist.length}</dt>
            <dd><ul class="doc-list">${b.checklist.map((c) => {
              const yes = checked.includes(c.id);
              return `<li class="${yes ? 'yes' : 'no'}"><span class="mark">${yes ? '✓' : '—'}</span><span>${esc(c.label)}${c.note ? ` (${esc(c.note)})` : ''}</span></li>`;
            }).join('')}</ul></dd>
          </div>`));
      }
      b.fields.forEach((f) => {
        const v = valueText(f, g(b.n, f.id));
        if (!v) return;
        const full = f.type === 'textarea' || f.full || v.length > 60;
        parts.push(html(`<div class="${full ? 'full' : ''}"><dt>${esc(f.label)}</dt><dd>${esc(v)}</dd></div>`));
      });
      placeSplit(ctx, shell, parts);
    });

    // --- заключение: заголовок, выводы и рекомендация держатся вместе с подписью ---
    place(ctx, html(`<h2 class="keep-next">Заключение проверяющего</h2>`));
    const concl = [
      ['Подтвержденные сильные стороны', data.strengths],
      ['Выявленные риски', data.risks],
      ['Что запросить до заключения договора', data.requests || '—'],
    ];
    const totalLen = concl.reduce((s, c) => s + String(c[1]).length, 0);
    if (totalLen < 700) {
      place(ctx, html(`<div class="concl keep-next">${concl.map(([t, v]) => `<div><h4>${t}</h4><p>${esc(v)}</p></div>`).join('')}</div>`));
    } else {
      concl.forEach(([t, v]) => place(ctx, html(`<div class="concl one"><div><h4>${t}</h4><p>${esc(v)}</p></div></div>`)));
    }
    place(ctx, html(`<div class="rec-banner keep-next ${level}"><small>Итоговая рекомендация</small>${esc(data.recommendation)}</div>`));

    place(ctx, html(`
      <section class="cert-summary keep-next">
        <div class="cs-label">Реквизиты сертификата</div>
        <dl>
          <div><dt>Номер</dt><dd>${esc(data.cert_number)}</dd></div>
          <div><dt>Дата проверки</dt><dd>${fmtDate(data.check_date)}</dd></div>
          <div><dt>Цель</dt><dd>${esc(data.purpose)}</dd></div>
          <div class="wide"><dt>Застройщик</dt><dd>${esc(g(2, 'legal_name'))}, ИНН ${esc(g(3, 'inn'))}</dd></div>
          <div><dt>Итоговый балл</dt><dd>${fmtScore(ev.score)} из ${MAX_SCORE}</dd></div>
          <div class="wide"><dt>Объект</dt><dd>${esc(g(1, 'name'))} — ${esc(g(1, 'address'))}</dd></div>
          <div><dt>Уровень надежности</dt><dd>${L.short} · ${L.risk.toLowerCase()}</dd></div>
        </dl>
      </section>`));

    place(ctx, html(`
      <section class="cert-final">
        <div class="cert-sign">
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
        </div>
        <div class="cert-notes">
          <p>Оценка отражает сведения, доступные на дату проверки, и зависит от полноты представленных документов. Сертификат не является государственной гарантией, разрешением на строительство или заключением о юридической чистоте сделки.</p>
          <p>Шкала: 40–50 — высокая, 25–39 — средняя, менее 25 — низкая надежность; риск по критическому блоку 12 — низкая надежность.
          Выдан: ${fmtDateTime(rec.createdAt)}${rec.version > 1 ? ` · редакция ${rec.version} от ${fmtDateTime(rec.updatedAt)}` : ''}.</p>
        </div>
      </section>`));

    // --- нумерация листов ---
    const total = ctx.pages.length;
    ctx.pages.forEach((p, i) => {
      p.querySelector('.page-no').textContent = `Лист ${i + 1} из ${total}`;
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
