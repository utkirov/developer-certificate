/* Сотрудники (для руководителя) и профиль */
(function (DC) {
  'use strict';

  const { esc, api } = DC;
  const ROLES = { analyst: 'Аналитик', manager: 'Руководитель' };

  async function renderUsers(root, me) {
    const { users } = await api.users();
    root.innerHTML = `
      <div class="admin">
        <header class="admin-head">
          <div>
            <div class="eyebrow">Администрирование</div>
            <h1>Сотрудники</h1>
            <p class="muted">Аналитик готовит заключения. Руководитель проверяет, выпускает и аннулирует их.</p>
          </div>
        </header>
        <form class="user-form" id="userForm" novalidate>
          <label class="field"><span class="label">Имя</span><input id="uName" maxlength="160" autocomplete="off"></label>
          <label class="field"><span class="label">Электронная почта</span><input id="uEmail" type="email" autocomplete="off"></label>
          <label class="field"><span class="label">Роль</span><select id="uRole"><option value="analyst">Аналитик</option><option value="manager">Руководитель</option></select></label>
          <label class="field"><span class="label">Начальный пароль, от 10 символов</span><input id="uPass" type="password" autocomplete="new-password"></label>
          <button class="btn primary" type="submit">Добавить</button>
        </form>
        <section class="reg-list">
          ${users.map((u) => `
            <article class="reg-row user-row${u.active ? '' : ' revoked'}" data-id="${esc(u.id)}">
              <div class="reg-main">
                <div class="reg-num">${esc(u.name)}${u.active ? '' : ' <span class="pill risk mini">отключен</span>'}</div>
                <div class="reg-proj">${esc(u.email)}</div>
              </div>
              <div><span class="pill ${u.role === 'manager' ? 'high' : 'mid'}">${ROLES[u.role]}</span></div>
              <div class="reg-actions">
                ${u.id === me.id ? '<span class="muted">это вы</span>' : `
                  <button type="button" class="btn sm ghost" data-act="password">Новый пароль</button>
                  <button type="button" class="btn sm ghost" data-act="role">${u.role === 'manager' ? 'Сделать аналитиком' : 'Сделать руководителем'}</button>
                  <button type="button" class="btn sm ghost" data-act="active">${u.active ? 'Отключить' : 'Включить'}</button>`}
              </div>
            </article>`).join('')}
        </section>
      </div>`;

    root.querySelector('#userForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api.createUser({
          name: root.querySelector('#uName').value.trim(),
          email: root.querySelector('#uEmail').value.trim(),
          role: root.querySelector('#uRole').value,
          password: root.querySelector('#uPass').value,
        });
        DC.toast('Сотрудник добавлен', 'ok');
        renderUsers(root, me);
      } catch (ex) { DC.toast(ex.message, 'error'); }
    });

    root.querySelector('.reg-list').addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const id = btn.closest('[data-id]').dataset.id;
      const user = users.find((u) => u.id === id);
      try {
        if (btn.dataset.act === 'password') {
          const password = await DC.dialog({ title: `Новый пароль: ${user.name}`, text: 'Минимум 10 символов. Все сеансы сотрудника будут завершены.', ok: 'Сохранить', input: true });
          if (password === null) return;
          await api.updateUser(id, { password });
        } else if (btn.dataset.act === 'role') {
          await api.updateUser(id, { role: user.role === 'manager' ? 'analyst' : 'manager' });
        } else {
          await api.updateUser(id, { active: !user.active });
        }
        DC.toast('Изменения сохранены', 'ok');
        renderUsers(root, me);
      } catch (ex) { DC.toast(ex.message, 'error'); }
    });
  }

  function renderAccount(root, me) {
    root.innerHTML = `
      <div class="admin account">
        <header class="admin-head">
          <div>
            <div class="eyebrow">${ROLES[me.role]}</div>
            <h1>${esc(me.name)}</h1>
            <p class="muted">${esc(me.email)}</p>
          </div>
          <div class="admin-cta"><button type="button" class="btn ghost" id="btnLogout">Выйти</button></div>
        </header>
        <form class="user-form" id="passForm" novalidate>
          <label class="field"><span class="label">Текущий пароль</span><input id="pCur" type="password" autocomplete="current-password"></label>
          <label class="field"><span class="label">Новый пароль, от 10 символов</span><input id="pNew" type="password" autocomplete="new-password"></label>
          <button class="btn primary" type="submit">Сменить пароль</button>
        </form>
      </div>`;
    root.querySelector('#btnLogout').addEventListener('click', async () => {
      await api.logout().catch(() => {});
      DC.signOutLocal();
      location.hash = '#/';
    });
    root.querySelector('#passForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api.changePassword(root.querySelector('#pCur').value, root.querySelector('#pNew').value);
        DC.toast('Пароль изменен, войдите заново', 'ok');
        DC.signOutLocal();
      } catch (ex) { DC.toast(ex.message, 'error'); }
    });
  }

  DC.staff = { renderUsers, renderAccount };
})(window.DC);
