// js/admin.js
// Dojo Hallinnan (Admin) käyttöliittymälogiikka, haku ja toiminnot

let currentAdmin = null;
let allUsers = []; // Varastoidaan palvelimelta haetut käyttäjät suodatusta varten

// Seurataan klikkauksia kaksivaiheista varmistusta varten (tallennetaan käyttäjä-ID:t)
let roleToggleTargetId = null;
let deleteTargetId = null;

// ============================================================
// ALUSTUS JA YLÄPALKKI
// ============================================================

async function initAdminPage() {
  const res = await api.auth.me();

  if (!res.ok || !res.success) {
    window.location.href = 'index.html';
    return;
  }

  if (res.user.role !== 'admin') {
    window.location.href = 'game.html';
    return;
  }

  currentAdmin = res.user;

  document.getElementById('header-username').textContent = res.user.displayName;
  const roleBadge = document.getElementById('header-role');
  roleBadge.textContent = 'Admin';
  roleBadge.className = 'user-badge admin';

  // Ladattujen käyttäjätietojen jälkeen haetaan käyttäjät ja AIKAISEMMAT LOKIT tietokannasta!
  await fetchDojoUsers();
  await fetchDojoLogs();

  // Otetaan hakukentän kuuntelija käyttöön lennosta
  document.getElementById('admin-search').addEventListener('input', filterUsers);
}

// ============================================================
// DATA-ALUSTUS JA TULOSTUS (Käyttäjät ja Oikeat Lokit)
// ============================================================

// Haetaan aidot lokit suoraan kannasta ja tulostetaan ne värikoodatusti
async function fetchDojoLogs() {
  const res = await api.admin.getLogs();
  const logOutput = document.getElementById('admin-log-output');
  
  if (!logOutput) return;

  if (res.success && res.logs && res.logs.length > 0) {
    logOutput.innerHTML = ''; // Tyhjennetään oletusarvoinen alustusviesti
    
    res.logs.forEach(log => {
      // Määritetään oikea väri luokan (CSS) mukaan tapahtumatyypin perusteella
      let type = 'info';
      const action = log.action;

      if (['LOGIN', 'REGISTER'].includes(action)) type = 'success'; // vihreä
      if (['ROLE_CHANGE', 'UPDATE_USERNAME', 'CHANGE_PASSWORD'].includes(action)) type = 'warning'; // keltainen
      if (['DELETE_ACCOUNT', 'ADMIN_DELETE_USER', 'LOGOUT'].includes(action)) type = 'danger'; // punainen

      // Muotoillaan nätti aikaleimi (tuntien, minuuttien ja sekuntien tarkkuudella)
      const timeStr = new Date(log.timestamp).toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      
      const row = document.createElement('span');
      row.className = `log-row ${type}`;
      row.textContent = `[${timeStr}] [${log.username}] ${log.details}`;
      
      logOutput.appendChild(row);
    });
    
    // Skrollataan lokilaatikko automaattisesti aivan alareunaan
    const wrapper = logOutput.parentElement;
    wrapper.scrollTop = wrapper.scrollHeight;
  } else if (res.success && res.logs && res.logs.length === 0) {
    logOutput.innerHTML = '<span class="log-row info">[Järjestelmä] Tietokanta on tyhjä. Ei aiempia lokitapahtumia.</span>';
  }
}

async function fetchDojoUsers() {
  const res = await api.admin.getUsers();

  if (res.success) {
    allUsers = res.users;
    renderUserTable(allUsers);
  } else {
    showAdminMessage(res.message || 'Käyttäjälistan lataus epäonnistui', 'error');
  }
}

function renderUserTable(usersList) {
  const tbody = document.getElementById('admin-users-tbody');
  const countBadge = document.getElementById('user-count');
  
  tbody.innerHTML = '';
  countBadge.textContent = usersList.length;

  if (usersList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" class="table-loading">Ei löytyneitä käyttäjiä.</td></tr>`;
    return;
  }

  usersList.forEach(user => {
    const tr = document.createElement('tr');
    
    if (currentAdmin && user._id === currentAdmin.id) {
      tr.style.background = 'rgba(184, 146, 10, 0.05)';
    }

    const nameTd = document.createElement('td');
    nameTd.textContent = user.displayName;
    if (currentAdmin && user._id === currentAdmin.id) {
      nameTd.innerHTML += ' <span style="font-size:10px; color:var(--gold); font-weight:700;">(SINÄ)</span>';
    }

    const roleTd = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = `user-badge ${user.role}`;
    badge.textContent = user.role === 'admin' ? 'Admin' : 'Pelaaja';
    roleTd.appendChild(badge);

    const actionsTd = document.createElement('td');
    actionsTd.className = 'text-right';

    if (currentAdmin && user._id === currentAdmin.id) {
      actionsTd.innerHTML = '<span style="font-size:12px; color:var(--muted);">Estetty</span>';
    } else {
      const isRoleVarmistus = roleToggleTargetId === user._id;
      const isDeleteVarmistus = deleteTargetId === user._id;

      const roleBtn = document.createElement('button');
      roleBtn.className = 'admin-btn-sm role-toggle';
      roleBtn.textContent = isRoleVarmistus ? '⚠ Vahvista rooli' : 'Muuta rooli';
      roleBtn.addEventListener('click', () => handleRoleToggle(user));

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'admin-btn-sm user-delete';
      deleteBtn.textContent = isDeleteVarmistus ? '⚠ Poista varmasti' : 'Poista';
      deleteBtn.addEventListener('click', () => handleUserDelete(user));

      actionsTd.appendChild(roleBtn);
      actionsTd.appendChild(deleteBtn);
    }

    tr.appendChild(nameTd);
    tr.appendChild(roleTd);
    tr.appendChild(actionsTd);
    tbody.appendChild(tr);
  });
}

function filterUsers() {
  const query = document.getElementById('admin-search').value.toLowerCase().trim();
  const filtered = allUsers.filter(user => user.displayName.toLowerCase().includes(query));
  renderUserTable(filtered);
}

// ============================================================
// TOIMINTOJEN KÄSITTELIJÄT (Kaksivaiheiset varmistukset)
// ============================================================

async function handleRoleToggle(user) {
  nollaaToinenVarmistus('role');

  if (roleToggleTargetId !== user._id) {
    roleToggleTargetId = user._id;
    showAdminMessage(`Klikkaa uudestaan vahvistaaksesi käyttäjän ${user.displayName} roolin muutos.`, 'success');
    renderUserTable(allUsers);
    return;
  }

  const res = await api.admin.toggleRole(user._id);
  roleToggleTargetId = null;

  if (res.success) {
    showAdminMessage(`Käyttäjän ${user.displayName} rooli vaihdettu onnistuneesti.`, 'success');
    await fetchDojoUsers();
    await fetchDojoLogs();
  } else {
    showAdminMessage(res.message || 'Roolin vaihto epäonnistui', 'error');
  }
}

async function handleUserDelete(user) {
  nollaaToinenVarmistus('delete');

  if (deleteTargetId !== user._id) {
    deleteTargetId = user._id;
    showAdminMessage(`VAROITUS: Klikkaa uudestaan poistaaksesi käyttäjän "${user.displayName}" dojolta lopullisesti!`, 'error');
    renderUserTable(allUsers);
    return;
  }

  const res = await api.admin.deleteUser(user._id);
  deleteTargetId = null;

  if (res.success) {
    showAdminMessage(res.message, 'success');
    await fetchDojoUsers();
    await fetchDojoLogs();
  } else {
    showAdminMessage(res.message || 'Käyttäjän poistaminen epäonnistui', 'error');
  }
}

// ============================================================
// NAVIGOINTI JA LIITÄNNÄISET
// ============================================================

document.getElementById('btn-game').addEventListener('click', () => {
  window.location.href = 'game.html';
});

document.getElementById('btn-profile').addEventListener('click', () => {
  window.location.href = 'profile.html';
});

document.getElementById('btn-logout').addEventListener('click', async () => {
  sessionStorage.removeItem('quiz_state');
  await api.auth.logout();
  window.location.href = 'index.html';
});

document.getElementById('btn-clear-logs').addEventListener('click', () => {
  const logOutput = document.getElementById('admin-log-output');
  logOutput.innerHTML = '<span class="log-row info">[Järjestelmä] Loki tyhjennetty näkymästä.</span>';
});

function nollaaToinenVarmistus(tyyppi) {
  if (tyyppi === 'role') deleteTargetId = null;
  if (tyyppi === 'delete') roleToggleTargetId = null;
  document.getElementById('admin-user-message').textContent = '';
}

function showAdminMessage(text, type) {
  const el = document.getElementById('admin-user-message');
  el.textContent = text;
  el.className = 'auth-message ' + type;
}

// Käynnistetään sivu
initAdminPage();