/* Клиент API: все данные живут на сервере, в браузере ничего не сохраняется */
(function (DC) {
  'use strict';

  class ApiError extends Error {
    constructor(status, message, extra) {
      super(message);
      this.status = status;
      Object.assign(this, extra);
    }
  }

  async function call(method, path, body, opts = {}) {
    let res;
    try {
      res = await fetch(`/api${path}`, {
        method,
        credentials: 'same-origin',
        headers: opts.headers || (body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        body: body === undefined || opts.raw ? (opts.raw ? body : undefined) : JSON.stringify(body),
      });
    } catch (e) {
      throw new ApiError(0, 'Нет связи с сервером');
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401 && DC.onSignedOut && !path.startsWith('/auth/')) DC.onSignedOut();
      throw new ApiError(res.status, json.error || 'Ошибка сервера', json);
    }
    return json;
  }

  DC.api = {
    me: () => call('GET', '/auth/me'),
    login: (email, password) => call('POST', '/auth/login', { email, password }),
    logout: () => call('POST', '/auth/logout'),
    changePassword: (current, next) => call('POST', '/auth/password', { current, next }),

    users: () => call('GET', '/users'),
    createUser: (u) => call('POST', '/users', u),
    updateUser: (id, patch) => call('PATCH', `/users/${id}`, patch),

    list: () => call('GET', '/certificates'),
    get: (id) => call('GET', `/certificates/${id}`),
    create: (data) => call('POST', '/certificates', { data }),
    save: (id, data, lockVersion) => call('PUT', `/certificates/${id}/working`, { data, lockVersion }),
    discard: (id) => call('DELETE', `/certificates/${id}/working`),
    submit: (id) => call('POST', `/certificates/${id}/submit`),
    sendBack: (id, comment) => call('POST', `/certificates/${id}/return`, { comment }),
    issue: (id) => call('POST', `/certificates/${id}/issue`),
    revoke: (id, reason) => call('POST', `/certificates/${id}/revoke`, { reason }),
    restore: (id) => call('POST', `/certificates/${id}/restore`),
    document: (id, version) => call('GET', `/certificates/${id}/document${version ? `?version=${encodeURIComponent(version)}` : ''}`),

    uploadFile: (id, block, file) => call('POST', `/certificates/${id}/files?block=${block}&name=${encodeURIComponent(file.name)}`, file, { raw: true, headers: { 'Content-Type': file.type } }),
    deleteFile: (id) => call('DELETE', `/files/${id}`),

    exportAll: () => call('GET', '/export'),
    importLegacy: (text) => call('POST', '/import', text, { raw: true, headers: { 'Content-Type': 'application/json' } }),
  };
})(window.DC);
