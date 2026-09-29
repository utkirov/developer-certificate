/* Реестр выданных сертификатов и черновик формы (localStorage этого браузера) */
(function (DC) {
  'use strict';

  const REGISTRY_KEY = 'developer-certificate:registry:v1';
  const DRAFT_KEY = 'developer-certificate:v1';

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
  }

  const list = () => {
    const v = readJSON(REGISTRY_KEY, []);
    return Array.isArray(v) ? v : [];
  };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const normNum = (s) => String(s || '').trim().toUpperCase().replace(/\s+/g, '');

  function summarize(data) {
    const ev = DC.evaluate(data);
    return {
      number: data.cert_number,
      developer: data.b2_legal_name || '',
      project: data.b1_name || '',
      inn: data.b3_inn || '',
      checkDate: data.check_date || '',
      reviewer: data.reviewer || '',
      score: ev.score,
      level: ev.level,
      code: DC.controlCode(data),
    };
  }

  const store = {
    all: list,

    get: (id) => list().find((r) => r.id === id) || null,

    findByNumber: (num) => list().find((r) => normNum(r.number) === normNum(num)) || null,

    /** Сохраняет новый сертификат или обновляет существующий (id) */
    upsert(data, id) {
      const items = list();
      const now = new Date().toISOString();
      let rec = id ? items.find((r) => r.id === id) : null;
      if (rec) {
        Object.assign(rec, summarize(data), { data, updatedAt: now, version: (rec.version || 1) + 1 });
      } else {
        rec = { id: uid(), status: 'issued', createdAt: now, updatedAt: now, version: 1, ...summarize(data), data };
        items.unshift(rec);
      }
      return writeJSON(REGISTRY_KEY, items) ? rec : null;
    },

    duplicate(id) {
      const src = store.get(id);
      if (!src) return null;
      const data = { ...src.data, cert_number: store.nextNumber(), check_date: DC.todayISO() };
      return data;
    },

    setStatus(id, status) {
      const items = list();
      const rec = items.find((r) => r.id === id);
      if (!rec) return null;
      rec.status = status;
      rec.updatedAt = new Date().toISOString();
      return writeJSON(REGISTRY_KEY, items) ? rec : null;
    },

    remove(id) {
      return writeJSON(REGISTRY_KEY, list().filter((r) => r.id !== id));
    },

    /** Следующий свободный номер вида ПЗ-2026-001 */
    nextNumber() {
      const year = new Date().getFullYear();
      const re = new RegExp(`^ПЗ-${year}-(\\d+)$`);
      let max = 0;
      list().forEach((r) => {
        const m = re.exec(normNum(r.number));
        if (m) max = Math.max(max, +m[1]);
      });
      return `ПЗ-${year}-${String(max + 1).padStart(3, '0')}`;
    },

    exportJSON() {
      return JSON.stringify({ format: 'developer-certificate-registry', version: 1, exportedAt: new Date().toISOString(), items: list() }, null, 2);
    },

    /** Импорт: записи с новым id добавляются, с существующим — заменяются */
    importJSON(text) {
      const parsed = JSON.parse(text);
      const incoming = Array.isArray(parsed) ? parsed : parsed && parsed.items;
      if (!Array.isArray(incoming)) throw new Error('Неверный формат файла');
      const items = list();
      let added = 0, updated = 0;
      incoming.forEach((r) => {
        if (!r || typeof r !== 'object' || !r.data || typeof r.data !== 'object') return;
        const rec = { ...r, id: r.id || uid(), status: r.status === 'revoked' ? 'revoked' : 'issued', ...summarize(r.data) };
        const i = items.findIndex((x) => x.id === rec.id);
        if (i >= 0) { items[i] = rec; updated++; } else { items.push(rec); added++; }
      });
      if (!writeJSON(REGISTRY_KEY, items)) throw new Error('Не удалось сохранить: хранилище браузера недоступно');
      return { added, updated };
    },

    loadDraft: () => readJSON(DRAFT_KEY, null),
    saveDraft: (data) => writeJSON(DRAFT_KEY, data),
    clearDraft: () => { try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* ignore */ } },
  };

  DC.store = store;
})(window.DC);
