'use strict';
const DC = require('../public/js/core.js');

/** Полностью заполненная проверка: все блоки подтверждены */
function completeData(over = {}) {
  const today = '2026-01-15';
  const data = {
    schema: DC.SCHEMA,
    check_date: today,
    purpose: 'Покупка недвижимости',
    partner_disclosure: 'Партнерских отношений нет',
    strengths: 'Документы в порядке',
    risks: 'Не выявлены',
    requests: '',
    recommendation: DC.RECOMMENDATIONS[0],
    reviewer: 'Тестовый проверяющий',
    sign_note: '',
  };
  DC.BLOCKS.forEach((b) => {
    data[DC.fname(b.n, 'status')] = 'ok';
    b.fields.forEach((f) => {
      const name = DC.fname(b.n, f.id);
      if (f.type === 'date') data[name] = '2025-06-01';
      else if (f.type === 'money') data[name] = '1000';
      else if (f.type === 'int') data[name] = '3';
      else if (f.type === 'percent') data[name] = '50';
      else if (f.type === 'inn') data[name] = '305123456';
      else if (f.type === 'select') data[name] = f.options[0];
      else if (f.type === 'auto') data[name] = '';
      else data[name] = `Значение ${name}`;
    });
  });
  data.b2_legal_name = 'ООО «Тест Строй»';
  data.b1_name = 'ЖК Тестовый';
  data.b9_amount = '0';
  data.b11_total = '0';
  data.b13_planned = '2027-06-01';
  data.b13_expected = '2027-08-01';
  data.b12_docs = DC.BLOCKS.find((b) => b.n === 12).checklist.filter((c) => !c.optional).map((c) => c.id);
  return Object.assign(data, over);
}

module.exports = { completeData };
