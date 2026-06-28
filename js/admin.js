// js/admin.js
// Dojo Hallinnan (Admin) käyttöliittymälogiikka, haku, toiminnot ja kysymysten luonti

let currentAdmin = null;
let allUsers = []; // Varastoidaan palvelimelta haetut käyttäjät suodatusta varten
let allLogs = [];  // Varastoidaan palvelimelta haetut lokit suodatusta varten

// Seurataan klikkauksia kaksivaiheista varmistusta varten (tallennetaan käyttäjä-ID:t)
let roleToggleTargetId = null;
let deleteTargetId = null;

// Kysymysten hallintaa varten (kysymysten haku, suodatus ja poistaminen)
let allQuestions = []; // Varastoidaan tietokannan kysymykset suodatusta varten
let questionDeleteTargetId = null; // Kaksivaiheinen varmistus kysymyksen poistolle
let editingQuestionId = null; // Pitää kirjaa, mitä kysymystä muokataan parhaillaan (null = luodaan uutta)

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

  // Ladattujen käyttäjätietojen jälkeen haetaan käyttäjät, AIKAISEMMAT LOKIT ja KYSYMYKSET tietokannasta!
  await fetchDojoUsers();
  await fetchDojoLogs();
  await fetchDojoQuestions();

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
      if (['ROLE_CHANGE', 'UPDATE_USERNAME', 'CHANGE_PASSWORD', 'QUESTION_UPDATE'].includes(action)) type = 'warning'; // keltainen (muutokset)
      if (['DELETE_ACCOUNT', 'ADMIN_DELETE_USER', 'LOGOUT', 'QUESTION_DELETE'].includes(action)) type = 'danger'; // punainen (poistot/uloskirjautumiset)

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

  // 2. Suodatetaan tapahtumaloki
  const filteredLogs = allLogs.filter(log => {
    const tekijaMatches = log.username.toLowerCase().includes(query);
    const kuvausMatches = log.details.toLowerCase().includes(query);
    return tekijaMatches || kuvausMatches;
  });
  renderLogTable(filteredLogs);

  // 3. Suodatetaan kysymykset lennosta (etsitään tunnisteesta, kategoriasta tai tekstistä)
  const filteredQuestions = allQuestions.filter(q => 
    q.type.toLowerCase().includes(query) || 
    q.category.toLowerCase().includes(query) || 
    q.questionText.toLowerCase().includes(query)
  );
  renderQuestionTable(filteredQuestions);
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
// UUDEN KYSYMYKSEN LÄHETYS TAI PÄIVITYS BACKENDILLE
// ============================================================
const formAddQuestion = document.getElementById('form-add-question');
const formMsg = document.getElementById('question-form-msg');

if (formAddQuestion) {
  formAddQuestion.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const submitBtn = formAddQuestion.querySelector('.btn-admin-submit');
    formMsg.textContent = editingQuestionId ? 'Päivitetään kysymyksen tietoja...' : 'Tallennetaan kysymystä dojo-tietokantaan...';
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
      payload.attempts = 1;
      
      const rawOptions = [
        document.getElementById('opt-0').value.trim(),
        document.getElementById('opt-1').value.trim(),
        document.getElementById('opt-2').value.trim(),
        document.getElementById('opt-3').value.trim()
      ];
      
      const options = rawOptions.filter(opt => opt.length > 0);
      payload.options = options;

      const selectedRadio = document.querySelector('input[name="correct-choice-index"]:checked');
      const correctIndex = parseInt(selectedRadio.value, 10);
      const correctText = rawOptions[correctIndex];
      
      if (!correctText) {
        formMsg.textContent = '❌ Virhe: Valitsit oikeaksi vaihtoehdoksi tyhjän kentän!';
        formMsg.className = 'auth-message error';
        return;
      }
      
      payload.answers = [correctText];
    }

    try {
      let result;
      
      if (editingQuestionId) {
        // MUOKKAUSTILA: Päivitetään vanhaa
        result = await api.admin.updateQuestion(editingQuestionId, payload);
      } else {
        // LUONTITILA: Luodaan uutta
        result = await api.admin.addQuestion(payload);
      }

      if (result.success || result.ok) {
        formMsg.textContent = editingQuestionId ? '✅ Kysymys päivitetty onnistuneesti!' : '✅ Kysymys tallennettu onnistuneesti dojo-tietokantaan!';
        formMsg.className = 'auth-message success';
        
        // Nollataan muokkaustila
        editingQuestionId = null;
        if (submitBtn) submitBtn.textContent = '💾 Tallenna Dojo-tietokantaan';
        
        formAddQuestion.reset();
        
        document.getElementById('dynamic-text-section').classList.remove('choice-hidden');
        document.getElementById('dynamic-choice-section').classList.add('choice-hidden');
        
        await fetchDojoLogs();
        await fetchDojoQuestions();
      } else {
        formMsg.textContent = `❌ Virhe: ${result.message || 'Toiminto epäonnistui'}`;
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
// KYSYMYSTEN HAKU, MUOKKAUS JA POISTAMINEN
// ============================================================

// Haetaan kaikki kysymykset backendistä talteen
async function fetchDojoQuestions() {
  const res = await api.admin.getQuestions();

  if (res.success && res.questions) {
    allQuestions = res.questions;
    renderQuestionTable(allQuestions);
  } else {
    const tbody = document.getElementById('admin-questions-tbody');
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="3" class="table-loading danger">Kysymysten lataus epäonnistui.</td></tr>`;
    }
  }
}

// Piirretään kysymykset siistiin taulukkoon ruudulle
function renderQuestionTable(questionsList) {
  const tbody = document.getElementById('admin-questions-tbody');
  const countBadge = document.getElementById('question-count');
  
  if (!tbody) return;
  
  tbody.innerHTML = '';
  countBadge.textContent = questionsList.length;

  if (questionsList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" class="table-loading">Ei löytyneitä kysymyksiä.</td></tr>`;
    return;
  }

  questionsList.forEach(q => {
    const tr = document.createElement('tr');

    // Sarake 1: Tunniste, kategoria ja kanji
    const infoTd = document.createElement('td');
    // Poistettu turha margin-left badgesta, koska se menee nyt omalle rivilleen
    const jpBadge = q.jpName ? `<div style="margin-top:4px;"><span class="user-badge admin">${q.jpName}</span></div>` : '';
    
    infoTd.innerHTML = `
      <strong style="color:var(--gold); font-size:13px;">${q.type}</strong>
      <div style="font-size:11px; color:var(--muted); margin-top:4px;">
        Kategoria: <strong>${q.category}</strong>
      </div>
      ${jpBadge}
    `;

    // Sarake 2: Kysymysteksti ja mahdolliset monivalintavaihtoehdot
    const textTd = document.createElement('td');
    let optionsHtml = '';
    
    if (q.options && q.options.length > 0) {
      optionsHtml = `<div style="font-size:11px; margin-top:6px; display:flex; gap:8px; flex-wrap:wrap;">`;
      q.options.forEach(opt => {
        const isCorrect = q.answers.includes(opt);
        const style = isCorrect ? 'background:rgba(40,167,69,0.15); color:#28a745; border:1px solid rgba(40,167,69,0.3);' : 'background:rgba(255,255,255,0.05); color:var(--muted);';
        optionsHtml += `<span style="padding:2px 6px; border-radius:4px; ${style}">${opt}</span>`;
      });
      optionsHtml += `</div>`;
    } else {
      optionsHtml = `
        <div style="font-size:11px; color:var(--muted); margin-top:4px;">
          Sallitut vastaukset: <span style="color:var(--text); font-style:italic;">${q.answers.join(', ')}</span> 
          (Yritykset: <strong>${q.attempts}</strong>)
        </div>
      `;
    }

    textTd.innerHTML = `<div>${q.questionText}</div>${optionsHtml}`;

    // Sarake 3: Toiminnot (Muokkaa & Poista)
    const actionsTd = document.createElement('td');
    actionsTd.className = 'text-right';
    actionsTd.style.whiteSpace = 'nowrap';

    // Perustetaan Muokkaa-nappi
    const editBtn = document.createElement('button');
    editBtn.className = 'admin-btn-sm role-toggle';
    editBtn.style.marginRight = '5px';
    editBtn.textContent = 'Muokkaa';
    editBtn.addEventListener('click', () => startQuestionEdit(q));

    // Perustetaan Poista-nappi kaksivaiheisella varmistuksella
    const isDeleteVarmistus = questionDeleteTargetId === q._id;
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'admin-btn-sm user-delete';
    deleteBtn.textContent = isDeleteVarmistus ? '⚠ Vahvista' : 'Poista';
    deleteBtn.addEventListener('click', () => handleQuestionDelete(q));

    actionsTd.appendChild(editBtn);
    actionsTd.appendChild(deleteBtn);

    tr.appendChild(infoTd);
    tr.appendChild(textTd);
    tr.appendChild(actionsTd);
    tbody.appendChild(tr);
  });
}

// Siirretään valitun kysymyksen tiedot yläpuolella olevaan lomakkeeseen muokattavaksi
function startQuestionEdit(question) {
  editingQuestionId = question._id;
  
  // Päivitetään tallennusnapin teksti
  const submitBtn = formAddQuestion.querySelector('.btn-admin-submit');
  if (submitBtn) submitBtn.textContent = '📝 Päivitä kysymyksen tiedot';

  // Täytetään peruskentät lomakkeelle
  document.getElementById('q-type').value = question.type;
  document.getElementById('q-category').value = question.category;
  document.getElementById('q-jpname').value = question.jpName || '';
  document.getElementById('q-text').value = question.questionText;

  const selectType = document.getElementById('q-select-type');

  // Katsotaan onko kysymys tekstisyöttö vai monivalinta
  if (question.options && question.options.length > 0) {
    selectType.value = 'choice';
    
    //Herätetään dynaamisen HTML-lomakkeen vaihtotapahtuma käsin lennosta!
    // Tämä poistaa required-pakotukset piilotetusta tekstilaatikosta heti.
    selectType.dispatchEvent(new Event('change'));

    // Täytetään monivalintakentät
    document.getElementById('opt-0').value = question.options[0] || '';
    document.getElementById('opt-1').value = question.options[1] || '';
    document.getElementById('opt-2').value = question.options[2] || '';
    document.getElementById('opt-3').value = question.options[3] || '';

    // Etsitään mikä vaihtoehdoista on oikea ja ruksataan vastaava radio
    const correctText = question.answers[0];
    const correctIndex = question.options.indexOf(correctText);
    
    if (correctIndex !== -1) {
      const radio = document.querySelector(`input[name="correct-choice-index"][value="${correctIndex}"]`);
      if (radio) radio.checked = true;
    }
  } else {
    // Tavallinen tekstikysymys
    selectType.value = 'text';
    
    // Herätetään dynaamisen HTML-lomakkeen vaihtotapahtuma käsin lennosta!
    selectType.dispatchEvent(new Event('change'));

    document.getElementById('q-attempts').value = question.attempts || 1;
    document.getElementById('q-answers').value = question.answers.join(', ');
  }

  // Skrollataan sivu nätisti ja pehmeästi ylös lomakkeen kohdalle
  formAddQuestion.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// Kysymyksen poiston hallinta (kaksivaiheinen varmistus)
async function handleQuestionDelete(question) {
  // Nollataan muut varmistukset suosiolla
  roleToggleTargetId = null;
  deleteTargetId = null;
  document.getElementById('admin-user-message').textContent = '';

  if (questionDeleteTargetId !== question._id) {
    questionDeleteTargetId = question._id;
    showAdminMessage(`Haluatko varmasti poistaa kysymyksen "${question.type}"? Klikkaa uudestaan vahvistaaksesi!`, 'error');
    renderQuestionTable(allQuestions);
    return;
  }

  const res = await api.admin.deleteQuestion(question._id);
  questionDeleteTargetId = null;

  if (res.success) {
    showAdminMessage(`Kysymys "${question.type}" poistettu pysyvästi kannasta.`, 'success');
    await fetchDojoQuestions(); // Päivitetään lista
    await fetchDojoLogs();      // Päivitetään tapahtumaloki
  } else {
    showAdminMessage(res.message || 'Kysymyksen poistaminen epäonnistui', 'error');
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