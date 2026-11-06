'use strict';
const test = require('node:test');
const assert = require('node:assert');
const DC = require('../public/js/core.js');
const { completeData } = require('./fixtures');

test('сумма сохраняет дробную часть', () => {
  assert.equal(DC.fmtMoney('1000.50'), '1 000,50');
  assert.equal(DC.fmtMoney('48,5'), '48,5');
  assert.equal(DC.fmtMoney('5000000000'), '5 000 000 000');
  assert.equal(DC.moneyValue('1 000,50'), 1000.5);
  assert.ok(!DC.isMoney('12 млн'));
});

test('вес блоков и максимум', () => {
  assert.equal(DC.MAX_SCORE, 60);
  assert.equal(DC.BLOCKS.filter((b) => b.n <= 13).reduce((s, b) => s + b.weight, 0), 50);
});

test('все подтверждено — высокий уровень', () => {
  const ev = DC.evaluate(completeData());
  assert.equal(ev.score, 60);
  assert.equal(ev.level, 'high');
});

test('замечание по блоку 12 не может дать низкий риск', () => {
  const ev = DC.evaluate(completeData({ b12_status: 'warn' }));
  assert.equal(ev.score, 55);
  assert.equal(ev.level, 'mid');
});

test('риск по критическим блокам — низкий уровень при любых баллах', () => {
  assert.equal(DC.evaluate(completeData({ b12_status: 'risk' })).level, 'low');
  assert.equal(DC.evaluate(completeData({ b14_status: 'risk' })).level, 'low');
});

test('долги ограничивают уровень средним', () => {
  for (const key of ['b9_status', 'b11_status']) {
    assert.equal(DC.evaluate(completeData({ [key]: 'risk' })).level, 'mid');
    assert.equal(DC.evaluate(completeData({ [key]: 'warn' })).level, 'mid');
  }
});

test('неприменимый блок не входит в максимум', () => {
  const ev = DC.evaluate(completeData({ b15_status: 'na' }));
  assert.equal(ev.max, 55);
  assert.equal(ev.score, 55);
  assert.equal(ev.level, 'high');
});

test('«Не применимо» доступно не всем блокам', () => {
  const ev = DC.evaluate(completeData({ b9_status: 'na' }));
  assert.equal(ev.complete, false);
});

test('старые записи считаются по старым правилам', () => {
  const legacy = completeData({ schema: 1, b12_status: 'warn' });
  const ev = DC.evaluate(legacy);
  assert.equal(ev.max, 50);
  assert.equal(ev.score, 45);
  assert.equal(ev.level, 'high');
});

test('полные данные проходят проверку', () => {
  assert.deepEqual(DC.validateData(completeData()), []);
});

const problem = (over) => DC.validateData(completeData(over)).map((e) => e.field);

test('статус «Подтверждено» не сочетается с противоречащими данными', () => {
  assert.ok(problem({ b3_match: 'Не совпадает' }).includes('b3_match'));
  assert.ok(problem({ b7_construction: 'Нет' }).includes('b7_construction'));
  assert.ok(problem({ b8_confirmed: 'Частично' }).includes('b8_confirmed'));
  assert.ok(problem({ b9_amount: '100' }).includes('b9_amount'));
  assert.ok(problem({ b11_total: '100' }).includes('b11_total'));
  assert.ok(problem({ b14_scope: 'Нет' }).includes('b14_scope'));
  assert.ok(problem({ b15_object_match: 'Частично' }).includes('b15_object_match'));
});

test('блок 12: без ключевых документов замечаний недостаточно', () => {
  assert.ok(problem({ b12_status: 'warn', b12_docs: [], b12_missing: 'нет' }).includes('b12_docs'));
  assert.ok(problem({ b12_status: 'ok', b12_docs: ['land'] }).includes('b12_docs'));
  assert.ok(!problem({ b12_status: 'risk', b12_docs: [], recommendation: DC.RECOMMENDATIONS[2] }).includes('b12_docs'));
});

test('рекомендация не может противоречить уровню', () => {
  assert.ok(problem({ b12_status: 'risk' }).includes('recommendation'));
  assert.ok(!problem({ b12_status: 'risk', recommendation: DC.RECOMMENDATIONS[3] }).includes('recommendation'));
});

test('даты: будущее и нарушенный порядок', () => {
  assert.ok(problem({ check_date: '2999-01-01' }).includes('check_date'));
  assert.ok(problem({ b6_appointed: '2999-01-01' }).includes('b6_appointed'));
  assert.ok(problem({ b13_planned: '2030-06-01', b13_expected: '2030-01-01' }).includes('b13_expected'));
});

test('сумма с мусором не проходит', () => {
  assert.ok(problem({ b4_declared: '5 млрд' }).includes('b4_declared'));
  assert.ok(!problem({ b4_declared: '2000', b4_paid: '1000,50' }).includes('b4_paid'));
});

test('sanitize выбрасывает неизвестные поля и лишние документы', () => {
  const clean = DC.sanitize({ evil: '<script>', b12_docs: ['land', 'hack'], b9_status: 'na', b15_status: 'na' });
  assert.equal(clean.evil, undefined);
  assert.deepEqual(clean.b12_docs, ['land']);
  assert.equal(clean.b9_status, '');
  assert.equal(clean.b15_status, 'na');
});

test('дата считается по Ташкенту', () => {
  assert.equal(DC.todayISO(new Date('2026-11-06T20:00:00Z')), '2026-11-07');
});
