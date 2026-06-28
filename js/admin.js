// js/admin.js
// Dojo Hallinnan (Admin) käyttöliittymälogiikka, haku, toiminnot ja kysymysten luonti

let currentAdmin = null;
let allUsers = []; // Varastoidaan palvelimelta haetut käyttäjät suodatusta varten
let allLogs = [];  // Varastoidaan palvelimelta haetut lokit suodatusta varten

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

  // Otetaan hakukentän kuuntelija käyttöön lennosta (Päivitetty suodattamaan molemmat)
  document.getElementById('admin-search').addEventListener('input', filterDojoData);
}

// ============================================================
// DATA-ALUSTUS JA TULOSTUS (Käyttäjät ja Oikeat Lokit)
// ============================================================

// Haetaan aidot lokit suoraan kannasta
async function fetchDojoLogs() {
  const res = await api.admin.getLogs();
  
  if (res.success && res.logs) {
    allLogs = res.logs; // Tallennetaan globaaliin muuttujaan suodatusta varten
    renderLogTable(allLogs);
  } else {
    const logOutput = document.getElementById('admin-log-output');
    if (logOutput) {
      logOutput.innerHTML = '<span class="log-row danger">[Järjestelmä] Lokien lataus epäonnistui.</span>';
    }
  }
}

// Erotettu lokien piirtäminen omaksi funktioksi, jotta suodatus voi kutsua tätä lennosta
function renderLogTable(logsList) {
  const logOutput = document.getElementById('admin-log-output');
  if (!logOutput) return;

  if (logsList && logsList.length > 0) {
    logOutput.innerHTML = ''; // Tyhjennetään vanha sisältö
    
    logsList.forEach(log => {
      // Määritetään oikea väri luokan (CSS) mukaan tapahtumatyypin perusteella
      let type = 'info';
      const action = log.action;

      if (['LOGIN', 'REGISTER', 'QUESTION_ADD'].includes(action)) type = 'success'; // vihreä (onnistumiset)
      if (['ROLE_CHANGE', 'UPDATE_USERNAME', 'CHANGE_PASSWORD'].includes(action)) type = 'warning'; // keltainen (muutokset)
      if (['DELETE_ACCOUNT', 'ADMIN_DELETE_USER', 'LOGOUT'].includes(action)) type = 'danger'; // punainen (poistot/uloskirjautumiset)

      // ÄLYKÄS AIKAMUOTOILU: Luodaan pvm-objektit vertailua varten
      const logDate = new Date(log.timestamp);
      const today = new Date();
      
      let timeStr = '';
      
      // Tarkistetaan, onko tapahtuma tänään (sama vuosi, kuukausi ja päivä)
      if (
        logDate.getDate() === today.getDate() &&
        logDate.getMonth() === today.getMonth() &&
        logDate.getFullYear() === today.getFullYear()
      ) {
        // Tänään: näytetään vain pelkkä kelloaika
        timeStr = logDate.toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      } else {
        // Aiemmin: näytetään päivämäärä, VUOSI ja kelloaika
        const pvm = logDate.toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric', year: 'numeric' });
        const klo = logDate.toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        timeStr = `${pvm} klo ${klo}`;
      }
      
      const row = document.createElement('span');
      row.className = `log-row ${type}`;
      
      // SUOMENNOS LENNOSTA: Korvataan englanninkieliset roolit tekstistä ennen tulostusta
      let naytettavaDetails = log.details
        .replace('PLAYER', 'PELAAJA')
        .replace('ADMIN', 'ADMIN');

      row.textContent = `[${timeStr}] [${log.username}] ${naytettavaDetails}`;
      
      logOutput.appendChild(row);
    });
    
    // Skrollataan lokilaatikko automaattisesti aivan alareunaan
    const wrapper = logOutput.parentElement;
    wrapper.scrollTop = wrapper.scrollHeight;
  } else {
    logOutput.innerHTML = '<span class="log-row info">[Järjestelmä] Ei lokitapahtumia tällä rajauksella.</span>';
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
      roleBtn.textContent = isRoleVarmistus ? '⚠ Vahvista' : 'Muuta rooli';
      roleBtn.addEventListener('click', () => handleRoleToggle(user));

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'admin-btn-sm user-delete';
      deleteBtn.textContent = isDeleteVarmistus ? '⚠ Vahvista' : 'Poista';
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

// Yhdistetty suodatusfunktio, joka suodattaa sekuntien murto-osassa molemmat näkymät
function filterDojoData() {
  const query = document.getElementById('admin-search').value.toLowerCase().trim();
  
  // 1. Suodatetaan käyttäjät
  const filteredUsers = allUsers.filter(user => user.displayName.toLowerCase().includes(query));
  renderUserTable(filteredUsers);

  // 2. Suodatetaan tapahtumaloki (PÄIVITETTY: etsitään sekä tekijää että kuvauksen tekstiä)
  const filteredLogs = allLogs.filter(log => {
    const tekijaMatches = log.username.toLowerCase().includes(query);
    const kuvausMatches = log.details.toLowerCase().includes(query);
    
    // Rivi otetaan mukaan, jos nimi löytyy joko tekijästä tai selitteestä
    return tekijaMatches || kuvausMatches;
  });
  
  renderLogTable(filteredLogs);
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
// KYSYMYSLOMAKKEEN DYNAAMINEN OHJAUS
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  const selectType = document.getElementById('q-select-type');
  const textSection = document.getElementById('dynamic-text-section');
  const choiceSection = document.getElementById('dynamic-choice-section');

  const inputAnswers = document.getElementById('q-answers');
  const opt0 = document.getElementById('opt-0');
  const opt1 = document.getElementById('opt-1');
  const opt2 = document.getElementById('opt-2');
  const opt3 = document.getElementById('opt-3');

  if (selectType) {
    selectType.addEventListener('change', (e) => {
      if (e.target.value === 'choice') {
        textSection.classList.add('choice-hidden');
        choiceSection.classList.remove('choice-hidden');

        //Vain kaksi ensimmäistä on pakollisia, 3 ja 4 voivat olla tyhjiä!
        opt0.required = true;
        opt1.required = true;
        opt2.required = false;
        opt3.required = false;
        inputAnswers.required = false;
      } else {
        textSection.classList.remove('choice-hidden');
        choiceSection.classList.add('choice-hidden');

        opt0.required = false;
        opt1.required = false;
        opt2.required = false;
        opt3.required = false;
        inputAnswers.required = true;
      }
    });
  }
});

// ============================================================
// UUDEN KYSYMYKSEN LÄHETYS BACKENDILLE
// ============================================================
const formAddQuestion = document.getElementById('form-add-question');
const formMsg = document.getElementById('question-form-msg');

if (formAddQuestion) {
  formAddQuestion.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    formMsg.textContent = 'Tallennetaan kysymystä dojo-tietokantaan...';
    formMsg.className = 'auth-message info';

    const qType = document.getElementById('q-type').value.trim();
    const qCategory = document.getElementById('q-category').value.trim();
    const qJpName = document.getElementById('q-jpname').value.trim();
    const qText = document.getElementById('q-text').value.trim();
    const selectTypeValue = document.getElementById('q-select-type').value;

    let payload = {
      type: qType,
      category: qCategory,
      jpName: qJpName,
      questionText: qText
    };

    if (selectTypeValue === 'text') {
      payload.attempts = parseInt(document.getElementById('q-attempts').value, 10) || 1;
      payload.answers = document.getElementById('q-answers').value
        .split(',')
        .map(ans => ans.trim())
        .filter(ans => ans.length > 0);
      payload.options = [];
    } else {
      payload.attempts = 1; // Monivalinnassa aina vain 1 yritys
      
      // Kerätään kaikki syötetyt vaihtoehdot
      const rawOptions = [
        document.getElementById('opt-0').value.trim(),
        document.getElementById('opt-1').value.trim(),
        document.getElementById('opt-2').value.trim(),
        document.getElementById('opt-3').value.trim()
      ];
      
      //Suodatetaan tyhjät rivit pois lennosta (sallii 2 tai 3 vaihtoehtoa!)
      const options = rawOptions.filter(opt => opt.length > 0);
      payload.options = options;

      // Katsotaan minkä rivin radiopainike on aktiivinen
      const selectedRadio = document.querySelector('input[name="correct-choice-index"]:checked');
      const correctIndex = parseInt(selectedRadio.value, 10);
      
      // Haetaan alkuperäisestä listasta se tekstivaihtoehto, joka valittiin oikeaksi
      const correctText = rawOptions[correctIndex];
      
      if (!correctText) {
        formMsg.textContent = '❌ Virhe: Valitsit oikeaksi vaihtoehdoksi tyhjän kentän!';
        formMsg.className = 'auth-message error';
        return;
      }
      
      payload.answers = [correctText];
    }

    try {
      const token = localStorage.getItem('token') || sessionStorage.getItem('token');
      
      const response = await fetch('/api/admin/questions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (response.ok && result.success) {
        formMsg.textContent = '✅ Kysymys tallennettu onnistuneesti dojo-tietokantaan!';
        formMsg.className = 'auth-message success';
        formAddQuestion.reset();
        
        document.getElementById('dynamic-text-section').classList.remove('choice-hidden');
        document.getElementById('dynamic-choice-section').classList.add('choice-hidden');
        
        // Päivitetään varmuuden vuoksi myös lokitiedot, jos kanta teki lokimerkinnän
        await fetchDojoLogs();
      } else {
        formMsg.textContent = `❌ Virhe: ${result.message || 'Tallennus epäonnistui'}`;
        formMsg.className = 'auth-message error';
      }
    } catch (error) {
      console.error('Virhe suoritettaessa API-kutsua:', error);
      formMsg.textContent = '❌ Järjestelmävirhe: Tietokantayhteydessä on häiriö.';
      formMsg.className = 'auth-message error';
    }
  });
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