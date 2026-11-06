/* Публичная страница проверки подлинности. Работает без входа. */
(function (DC) {
  'use strict';

  const { esc, fmtDate, fmtScore } = DC;

  const I18N = {
    ru: {
      eyebrow: 'Проверка подлинности', title: 'Проверить заключение',
      lead: 'Отсканируйте QR-код на документе или введите номер и контрольный код из нижней части любого листа.',
      number: 'Номер заключения', code: 'Контрольный код', check: 'Проверить',
      note: 'Проверка подтверждает, что документ выпущен Alliance Group, и показывает его текущий статус. Она не заменяет чтение самого заключения. Заключение не является государственной гарантией.',
      need: 'Укажите номер и контрольный код полностью.',
      error: 'Не удалось выполнить проверку. Повторите попытку позже.',
      limit: 'Слишком много попыток. Повторите через минуту.',
      notFound: ['Документ не найден', 'Номер и код не совпадают с реестром. Проверьте, нет ли опечатки. Если данные верны, документ мог быть подделан или изменен.'],
      valid: ['Заключение действительно', 'Номер и код совпадают с реестром, это актуальная редакция.'],
      revoked: ['Заключение аннулировано', 'Документ был выпущен, но позже аннулирован. Полагаться на него нельзя.'],
      superseded: ['Есть более новая редакция', 'Этот документ подлинный, но после него выпущена редакция {n}. Запросите актуальную у того, кто передал вам документ.'],
      tampered: ['Запись не прошла контроль целостности', 'Данные в реестре не совпадают с подписью. Не полагайтесь на этот документ и свяжитесь с Alliance Group.'],
      outdated: 'С даты проверки прошло больше {d} дней: сведения могли устареть, стоит запросить обновление.',
      developer: 'Застройщик', inn: 'ИНН', project: 'Проект', date: 'Дата проверки', result: 'Результат', edition: 'Редакция', issuer: 'Исполнитель', of: 'из',
      levels: { high: 'высокая надежность', mid: 'средняя надежность', low: 'низкая надежность' },
    },
    uz: {
      eyebrow: 'Haqiqiylikni tekshirish', title: 'Xulosani tekshirish',
      lead: 'Hujjatdagi QR-kodni skanerlang yoki istalgan varaqning pastki qismidagi raqam va nazorat kodini kiriting.',
      number: 'Xulosa raqami', code: 'Nazorat kodi', check: 'Tekshirish',
      note: 'Tekshiruv hujjat Alliance Group tomonidan chiqarilganini tasdiqlaydi va uning joriy holatini koʻrsatadi. U xulosaning oʻzini oʻqish oʻrnini bosmaydi. Xulosa davlat kafolati hisoblanmaydi.',
      need: 'Raqam va nazorat kodini toʻliq kiriting.',
      error: 'Tekshirib boʻlmadi. Keyinroq qayta urinib koʻring.',
      limit: 'Urinishlar juda koʻp. Bir daqiqadan soʻng qayta urinib koʻring.',
      notFound: ['Hujjat topilmadi', 'Raqam va kod reyestrga mos kelmaydi. Xato yoʻqligini tekshiring. Maʼlumotlar toʻgʻri boʻlsa, hujjat soxta yoki oʻzgartirilgan boʻlishi mumkin.'],
      valid: ['Xulosa haqiqiy', 'Raqam va kod reyestrga mos keladi, bu joriy tahrir.'],
      revoked: ['Xulosa bekor qilingan', 'Hujjat chiqarilgan, ammo keyinroq bekor qilingan. Unga tayanib boʻlmaydi.'],
      superseded: ['Yangiroq tahrir mavjud', 'Bu hujjat haqiqiy, ammo undan keyin {n}-tahrir chiqarilgan. Hujjatni bergan kishidan joriy tahrirni soʻrang.'],
      tampered: ['Yozuv yaxlitlik nazoratidan oʻtmadi', 'Reyestrdagi maʼlumotlar imzoga mos kelmaydi. Bu hujjatga tayanmang va Alliance Group bilan bogʻlaning.'],
      outdated: 'Tekshiruv sanasidan {d} kundan koʻp vaqt oʻtgan: maʼlumotlar eskirgan boʻlishi mumkin, yangilanishini soʻrash tavsiya etiladi.',
      developer: 'Quruvchi', inn: 'STIR', project: 'Loyiha', date: 'Tekshiruv sanasi', result: 'Natija', edition: 'Tahrir', issuer: 'Ijrochi', of: '/',
      levels: { high: 'yuqori ishonchlilik', mid: 'oʻrta ishonchlilik', low: 'past ishonchlilik' },
    },
    en: {
      eyebrow: 'Authenticity check', title: 'Verify a report',
      lead: 'Scan the QR code on the document, or enter the number and control code from the bottom of any page.',
      number: 'Report number', code: 'Control code', check: 'Verify',
      note: 'This check confirms that the document was issued by Alliance Group and shows its current status. It does not replace reading the report itself. The report is not a state guarantee.',
      need: 'Enter the full number and control code.',
      error: 'The check failed. Please try again later.',
      limit: 'Too many attempts. Try again in a minute.',
      notFound: ['Document not found', 'The number and code do not match the registry. Check for typos. If they are correct, the document may be forged or altered.'],
      valid: ['Report is valid', 'The number and code match the registry, and this is the current edition.'],
      revoked: ['Report revoked', 'This document was issued but later revoked. Do not rely on it.'],
      superseded: ['A newer edition exists', 'This document is genuine, but edition {n} was issued after it. Ask the sender for the current one.'],
      tampered: ['Record failed the integrity check', 'The registry data does not match its signature. Do not rely on this document and contact Alliance Group.'],
      outdated: 'More than {d} days have passed since the check date: the information may be out of date, so consider requesting an update.',
      developer: 'Developer', inn: 'TIN', project: 'Project', date: 'Check date', result: 'Result', edition: 'Edition', issuer: 'Issued by', of: 'of',
      levels: { high: 'high reliability', mid: 'medium reliability', low: 'low reliability' },
    },
  };

  const readLang = () => { try { return localStorage.getItem('verify-lang'); } catch (e) { return null; } };
  const saveLang = (v) => { try { localStorage.setItem('verify-lang', v); } catch (e) { /* не критично */ } };
  const urlLang = new URLSearchParams(location.search).get('lang');
  const browserLang = (navigator.language || 'ru').slice(0, 2);
  let lang = [urlLang, readLang(), browserLang].find((l) => I18N[l]) || 'ru';
  let last = null;
  const L = () => I18N[lang];
  const $ = (s) => document.querySelector(s);

  function paintStatic() {
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-t]').forEach((el) => { el.textContent = L()[el.dataset.t]; });
    document.querySelectorAll('#langSwitch [data-lang]').forEach((b) => b.classList.toggle('on', b.dataset.lang === lang));
  }

  function card(cls, [title, text], body = '') {
    return `
      <div class="v-card ${cls}">
        <div class="v-icon">${cls === 'good' ? '✓' : cls === 'warn' ? '!' : '✕'}</div>
        <div><h3>${esc(title)}</h3><p>${esc(text)}</p>${body}</div>
      </div>`;
  }

  function paintResult() {
    const out = $('#vResult');
    if (!last) { out.innerHTML = ''; return; }
    if (last.message) { out.innerHTML = `<p class="login-error">${esc(L()[last.message])}</p>`; return; }
    if (!last.found) { out.innerHTML = card('bad', L().notFound); return; }
    const r = last;
    if (r.state === 'tampered') { out.innerHTML = card('bad', L().tampered); return; }
    const cls = r.state === 'valid' ? 'good' : r.state === 'superseded' ? 'warn' : 'bad';
    const [title, text] = L()[r.state];
    const body = `
      <dl class="v-kv">
        <div><dt>№</dt><dd>${esc(r.number)}</dd></div>
        <div><dt>${L().edition}</dt><dd>${r.version}</dd></div>
        <div><dt>${L().developer}</dt><dd>${esc(r.developer)}</dd></div>
        <div><dt>${L().inn}</dt><dd>${esc(r.inn)}</dd></div>
        <div><dt>${L().project}</dt><dd>${esc(r.project)}</dd></div>
        <div><dt>${L().date}</dt><dd>${fmtDate(r.checkDate)}</dd></div>
        <div><dt>${L().result}</dt><dd>${fmtScore(r.score)} ${L().of} ${r.max} · ${esc(L().levels[r.level] || '')}</dd></div>
        <div><dt>${L().issuer}</dt><dd>${esc(r.issuer)}</dd></div>
      </dl>
      ${r.outdated && r.state === 'valid' ? `<p class="v-outdated">${esc(L().outdated.replace('{d}', DC.VALID_DAYS))}</p>` : ''}`;
    out.innerHTML = card(cls, [title, text.replace('{n}', r.latestVersion)], body);
  }

  async function check(query) {
    try {
      const res = await fetch(`/api/public/verify?${query}`);
      if (res.status === 429) last = { message: 'limit' };
      else if (res.status === 400) last = { message: 'need' };
      else if (!res.ok) last = { message: 'error' };
      else last = await res.json();
    } catch (e) {
      last = { message: 'error' };
    }
    paintResult();
  }

  $('#verifyForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = new URLSearchParams({ number: $('#vNum').value.trim(), code: $('#vCode').value.trim() });
    check(q.toString());
  });

  $('#langSwitch').addEventListener('click', (e) => {
    const b = e.target.closest('[data-lang]');
    if (!b) return;
    lang = b.dataset.lang;
    saveLang(lang);
    paintStatic();
    paintResult();
  });

  paintStatic();
  const m = /^\/v\/([^/]+)$/.exec(location.pathname);
  if (m) check(`token=${encodeURIComponent(m[1])}`);
})(window.DC);
