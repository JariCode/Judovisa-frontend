// js/game.js
// Pelisivun logiikka: käyttäjän tunnistus, uloskirjautuminen ja visa
// Vastaukset tarkistetaan backendissä, oikeita vastauksia ei ole frontendissä

// ============================================================
// KÄYTTÄJÄ JA YLÄPALKKI
// ============================================================

// Tallenna kirjautunut käyttäjä myöhempää käyttöä varten
let currentUser = null;

// ---- Tarkista kirjautuminen ja näytä käyttäjätiedot ----
async function initUser() {
  // Hae kirjautuneen käyttäjän tiedot
  const res = await api.auth.me();

  // Jos ei kirjautunut, ohjaa etusivulle
  if (!res.ok || !res.success) {
    sessionStorage.removeItem('quiz_state');
    window.location.href = 'index.html';
    return;
  }

  // Tallenna käyttäjä
  currentUser = res.user;

  // Näytä käyttäjänimi yläpalkissa
  document.getElementById('header-username').textContent = res.user.displayName;

  // Näytä rooli merkkinä (pelaaja tai admin)
  const roleBadge = document.getElementById('header-role');
  roleBadge.textContent = res.user.role === 'admin' ? 'Admin' : 'Pelaaja';
  roleBadge.classList.add(res.user.role);

  // Näytä admin-painike vain admineille
  if (res.user.role === 'admin') {
    document.getElementById('btn-admin').style.display = '';
  }

  // Lataa sivupalkin tiedot heti
  loadLeaderboard();
  loadMyScores();

  // Palauta visan tila jos se on tallennettu
  loadStateFromSession();
}

// ---- Uloskirjautuminen ----
document.getElementById('btn-logout').addEventListener('click', async () => {
  // Tyhjennä visan tila
  sessionStorage.removeItem('quiz_state');
  // Kutsu backendin logout-reittiä joka poistaa evästeen
  await api.auth.logout();
  // Ohjaa takaisin etusivulle
  window.location.href = 'index.html';
});

// ---- Profiilipainike: siirry profiilisivulle ----
document.getElementById('btn-profile').addEventListener('click', () => {
  window.location.href = 'profile.html';
});

// ---- Adminpainike: siirry adminsivulle ----
document.getElementById('btn-admin').addEventListener('click', () => {
  window.location.href = 'admin.html';
});

// ============================================================
// VISAN TILA
// ============================================================

// Pelin tila kootusti
let state = {
  questions: [],          // backendistä haetut kysymykset (ilman vastauksia)
  currentIndex: 0,        // monesko kysymys menossa
  attemptsLeft: 0,        // yrityksiä jäljellä nykyisessä kysymyksessä
  givenAnswers: [],       // tässä kysymyksessä annetut vastaukset { text, type }
  correctGiven: new Set(),// oikeat vastaukset tässä kysymyksessä (normalisoituina)
  sessionScores: [],      // kategoriakohtaiset tulokset
  totalCorrect: 0,        // oikeat yhteensä
  totalWrong: 0,          // väärät yhteensä
  totalSkipped: 0,        // ohitetut yhteensä
  running: false,         // onko peli käynnissä
  checking: false,        // estetään tuplalähetys API-kutsun aikana
};

// Tallenna tila istuntoon
function saveStateToSession() {
  if (state.running) {
    const stateToSave = { ...state, correctGiven: Array.from(state.correctGiven) };
    sessionStorage.setItem('quiz_state', JSON.stringify(stateToSave));
  } else {
    sessionStorage.removeItem('quiz_state');
  }
}

// Palauta tila istunnosta
function loadStateFromSession() {
  try {
    const saved = sessionStorage.getItem('quiz_state');
    if (saved) {
      const parsed = JSON.parse(saved);
      
      // Varmistetaan, että tallennetussa tilassa on kysymyksiä ja peli oli käynnissä
      if (parsed.running && parsed.questions && parsed.questions.length > 0) {
        state = { ...parsed, correctGiven: new Set(parsed.correctGiven) };
        state.checking = false; // Varmistetaan ettei jää jumiin lataustilaan
        
        const q = getQ();
        if (q) {
          showScreen('screen-question');
          document.getElementById('q-category').textContent = `${q.jpName || ''} · ${q.category}`;
          document.getElementById('q-text').textContent = q.questionText;
          document.getElementById('answer-input').value = '';
          document.getElementById('feedback-area').innerHTML = '';
          document.getElementById('given-answers').innerHTML = '';
          document.getElementById('given-title').textContent = '';
          
          // Piirretään sirut turvallisesti ilman looppiriskiä
          if (Array.isArray(state.givenAnswers)) {
            state.givenAnswers.forEach(ans => {
              addAnswerChip(ans.text, ans.type);
            });
          }
          
          renderAttemptDots();
          updateProgress();
          
          setTimeout(() => {
            const input = document.getElementById('answer-input');
            if (input) input.focus();
          }, 50);
        } else {
          endGame();
        }
      }
    }
  } catch (e) {
    console.error('Tilan palautus epäonnistui', e);
    sessionStorage.removeItem('quiz_state');
  }
}

// ============================================================
// APUFUNKTIOT
// ============================================================

// Normalisoi vastaus frontissa vain duplikaattien tunnistukseen
// (backend tekee oman normalisoinnin oikeellisuustarkistukseen)
function normalize(str) {
  return String(str || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s\-_]+/g, '');
}

// Sekoita taulukko satunnaiseen järjestykseen
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Hae nykyinen kysymys
function getQ() {
  return state.questions[state.currentIndex];
}

// Escape html, jotta käyttäjän syöte ei aiheuta injektiota
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Vaihda näkyvä näyttö (aloitus, kysymys, tulokset)
function showScreen(id) {
  // Piilota kaikki näytöt
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  // Näytä haluttu näyttö
  document.getElementById(id).classList.add('active');
}

// ============================================================
// PELIN KULKU
// ============================================================

// ---- Aloita peli ----
async function startGame() {
  // Estä tuplaklikkaus napin kautta
  const btn = document.getElementById('btn-start-game');
  btn.disabled = true;
  btn.textContent = 'Ladataan...';

  try {
    // Hae kysymykset backendistä
    const res = await api.quiz.getQuestions();

    // Jos haku epäonnistui, palauta nappi ja lopeta
    if (!res.ok || !res.questions || res.questions.length === 0) {
      alert('Kysymysten lataus epäonnistui');
      return;
    }

    // Nollaa tila ja sekoita kysymysten järjestys
    state = {
      questions: shuffle(res.questions),
      currentIndex: 0,
      attemptsLeft: 0,
      givenAnswers: [],
      correctGiven: new Set(),
      sessionScores: [],
      totalCorrect: 0,
      totalWrong: 0,
      totalSkipped: 0,
      running: true,
      checking: false,
    };
    saveStateToSession();

    // Siirry kysymysnäyttöön ja lataa ensimmäinen kysymys
    showScreen('screen-question');
    loadQuestion();
  } catch (error) {
    console.error('Pelin aloitus epäonnistui:', error);
    alert('Palvelinvirhe, yritä uudelleen');
  } finally {
    // Palauta napin teksti ja tila
    btn.disabled = false;
    btn.textContent = '始める · Aloita visa';
  }
}

// ---- Lataa nykyinen kysymys näkyviin ----
function loadQuestion() {
  // Hae kysymys
  const q = getQ();
  if (!q) {
    endGame();
    return;
  }

  // Aseta yritykset ja nollaa kysymyskohtainen tila
  state.attemptsLeft = q.attempts;
  state.givenAnswers = [];
  state.correctGiven = new Set();
  state.checking = false;
  saveStateToSession();

  // Päivitä kysymyksen tiedot näkyviin
  document.getElementById('q-category').textContent = `${q.jpName || ''} · ${q.category}`;
  document.getElementById('q-text').textContent = q.questionText;
  document.getElementById('answer-input').value = '';
  document.getElementById('feedback-area').innerHTML = '';
  document.getElementById('given-answers').innerHTML = '';
  document.getElementById('given-title').textContent = '';

  // Aseta fokus syötekenttään
  document.getElementById('answer-input').focus();

  // Päivitä mittarit
  renderAttemptDots();
  updateProgress();
}

// ---- Piirrä yrityspisteet ----
function renderAttemptDots() {
  const q = getQ();
  const container = document.getElementById('attempts-dots');
  container.innerHTML = '';
  // Yksi piste per yritys, käytetyt merkitään
  for (let i = 0; i < q.attempts; i++) {
    const dot = document.createElement('div');
    dot.className = 'attempt-dot' + (i >= state.attemptsLeft ? ' used' : '');
    container.appendChild(dot);
  }
}

// ---- Päivitä edistymispalkki ----
function updateProgress() {
  const total = state.questions.length;
  const current = state.currentIndex + 1;
  // Täyttö perustuu jo suoritettuihin kysymyksiin
  const pct = (state.currentIndex / total) * 100;
  document.getElementById('progress-fill').style.width = pct + '%';
  document.getElementById('progress-current').textContent = current;
  document.getElementById('progress-total').textContent = total;
}

// ---- Näytä palauteviesti ----
function showFeedback(text, type) {
  const area = document.getElementById('feedback-area');
  area.innerHTML = '';
  const msg = document.createElement('div');
  msg.className = `feedback-msg ${type}`;
  msg.textContent = text;
  area.appendChild(msg);
}

// ---- Lisää vastaussiru annettujen vastausten listaan ----
function addAnswerChip(text, type) {
  const list = document.getElementById('given-answers');
  document.getElementById('given-title').textContent = 'Annetut vastaukset:';
  const chip = document.createElement('div');
  chip.className = `answer-chip ${type}`;
  // Merkki tyypin mukaan
  const icon = type === 'correct' ? '✓' : type === 'same' ? '↻' : '✗';
  chip.textContent = `${icon} ${text}`;
  list.appendChild(chip);
}

// ---- Tarkista käyttäjän vastaus ----
async function checkAnswer() {
  // Estä jos peli ei käynnissä tai tarkistus kesken
  if (!state.running || state.checking) return;

  const input = document.getElementById('answer-input');
  const raw = input.value.trim();

  // Tyhjää ei tarkisteta
  if (!raw) return;

  // Jos yrityksiä ei ole jäljellä, ilmoita
  if (state.attemptsLeft <= 0) {
    showFeedback('Yrityksiä ei enää jäljellä', 'out');
    return;
  }

  const normalized = normalize(raw);
  const q = getQ();

  // Onko sama vastaus jo annettu tässä kysymyksessä
  const alreadyGiven = state.givenAnswers.find((a) => normalize(a.text) === normalized);
  if (alreadyGiven) {
    // Sama vastaus kuluttaa yrityksen
    state.attemptsLeft--;
    renderAttemptDots();
    showFeedback('Olet jo antanut tämän vastauksen', 'same');
    addAnswerChip(raw, 'same');
    state.givenAnswers.push({ text: raw, type: 'same' });
    saveStateToSession();
    input.value = '';
    input.classList.add('shake');
    setTimeout(() => input.classList.remove('shake'), 400);
    // Jos yritykset loppuivat, siirry seuraavaan
    if (state.attemptsLeft <= 0) {
      showFeedback('Olet jo antanut tämän vastauksen, yritykset loppuivat', 'same');
      setTimeout(() => nextQuestion(false), 1000);
    }
    return;
  }

  // Lähetä vastaus backendiin tarkistettavaksi
  state.checking = true;
  document.getElementById('btn-check').disabled = true;

  try {
    const res = await api.quiz.checkAnswer(q._id, raw);

    // Jos tarkistus epäonnistui
    if (!res.ok) {
      showFeedback('Virhe tarkistaessa vastausta', 'out');
      return;
    }

    if (res.correct) {
      // Oikea vastaus: kuluttaa yrityksen ja antaa pisteen
      state.correctGiven.add(normalized);
      state.attemptsLeft--;
      state.totalCorrect++;
      addAnswerChip(raw, 'correct');
      state.givenAnswers.push({ text: raw, type: 'correct' });
      saveStateToSession();
      input.value = '';
      renderAttemptDots();

      // Kaikki vaaditut annettu tai yritykset loppu
      if (state.correctGiven.size >= q.attempts) {
        showFeedback(`Erinomainen, kaikki ${q.attempts} oikein`, 'correct');
        setTimeout(() => nextQuestion(false), 1000);
      } else if (state.attemptsLeft <= 0) {
        showFeedback('Oikein, yritykset käytetty', 'correct');
        setTimeout(() => nextQuestion(false), 1000);
      } else {
        showFeedback('Oikein, +1 piste', 'correct');
      }
    } else {
      // Väärä vastaus: kuluttaa yrityksen
      state.attemptsLeft--;
      state.totalWrong++;
      renderAttemptDots();
      showFeedback('Väärä vastaus, yritä uudelleen', 'wrong');
      addAnswerChip(raw, 'wrong');
      state.givenAnswers.push({ text: raw, type: 'wrong' });
      saveStateToSession();
      input.value = '';
      input.classList.add('shake');
      setTimeout(() => input.classList.remove('shake'), 400);
      // Jos yritykset loppuivat, siirry seuraavaan
      if (state.attemptsLeft <= 0) {
        showFeedback('Väärä vastaus, yritykset loppuivat', 'wrong');
        setTimeout(() => nextQuestion(false), 1000);
      }
    }
  } catch (error) {
    console.error('Vastauksen tarkistus epäonnistui:', error);
    showFeedback('Verkkovirhe', 'out');
  } finally {
    // Vapauta tarkistuslukko ja palauta fokus
    state.checking = false;
    document.getElementById('btn-check').disabled = false;
    input.focus();
  }
}

// ---- Siirry seuraavaan kysymykseen ----
function nextQuestion(skipped) {
  // Tallenna kategorian tulos
  const q = getQ();
  state.sessionScores.push({
    category: q.category,
    jpName: q.jpName || '',
    correct: state.correctGiven.size,
    required: q.attempts,
    skipped,
  });

  // Jos ohitettiin ilman yhtään oikeaa, laske ohitetuksi
  if (skipped) state.totalSkipped++;

  // Siirry seuraavaan
  state.currentIndex++;
  saveStateToSession();

  // Jos kysymykset loppuivat, päätä peli
  if (state.currentIndex >= state.questions.length) {
    endGame();
  } else {
    loadQuestion();
  }
}

// ---- Ohita kysymys ----
function skipQuestion() {
  if (!state.running) return;
  nextQuestion(true);
}

// ---- Peli päättyy ----
async function endGame() {
  // Merkitse peli päättyneeksi
  state.running = false;
  sessionStorage.removeItem('quiz_state');

  // Näytä tulosnäyttö
  showScreen('screen-results');
  renderResults();

  // Laske vaadittujen vastausten kokonaismäärä
  const totalRequired = state.sessionScores.reduce((sum, s) => sum + s.required, 0);

  // Tallenna pisteet backendiin
  try {
    await api.quiz.saveScore(state.totalCorrect, state.totalWrong, totalRequired);
  } catch (error) {
    console.error('Pisteiden tallennus epäonnistui:', error);
  }

  // Päivitä sivupalkin listat
  loadLeaderboard();
  loadMyScores();
}

// ---- Piirrä tulosnäyttö ----
function renderResults() {
  // Laske vaaditut vastaukset ja prosentti
  const totalRequired = state.sessionScores.reduce((sum, s) => sum + s.required, 0);
  const pct = totalRequired > 0 ? Math.round((state.totalCorrect / totalRequired) * 100) : 0;

  // Valitse kanji ja otsikko prosentin mukaan
  let kanji = '頑';
  let title = 'Harjoitus tekee mestarin';
  if (pct >= 90) { kanji = '優'; title = 'Erinomainen'; }
  else if (pct >= 70) { kanji = '良'; title = 'Hyvä suoritus'; }
  else if (pct >= 50) { kanji = '可'; title = 'Kohtuullinen'; }

  // Aseta tulosten yläosa
  document.getElementById('results-kanji').textContent = kanji;
  document.getElementById('results-title').textContent = title;
  document.getElementById('results-points').textContent = state.totalCorrect;
  document.getElementById('results-pct').textContent = pct + '% oikein';

  // Aseta erittely
  document.getElementById('res-correct').textContent = state.totalCorrect;
  document.getElementById('res-wrong').textContent = state.totalWrong;
  document.getElementById('res-skipped').textContent = state.totalSkipped;

  // Piirrä kategoriakohtaiset tulokset
  const container = document.getElementById('category-results');
  container.innerHTML = '';
  state.sessionScores.forEach((s) => {
    const catPct = s.required > 0 ? Math.round((s.correct / s.required) * 100) : 0;
    const item = document.createElement('div');
    item.className = 'cat-result-item';
    item.innerHTML = `
      <div class="cat-result-name">${escHtml(s.jpName)} · ${escHtml(s.category)}</div>
      <div class="cat-result-bar-wrap">
        <div class="cat-result-bar" style="width:0%"></div>
      </div>
      <div class="cat-result-pct">${s.correct}/${s.required}</div>
    `;
    container.appendChild(item);
    // Animoi palkki leveämmäksi pienen viiveen jälkeen
    setTimeout(() => {
      item.querySelector('.cat-result-bar').style.width = catPct + '%';
    }, 100);
  });
}

// ============================================================
// SIVUPALKKI
// ============================================================

// ---- Lataa Top 10 ----
async function loadLeaderboard() {
  const container = document.getElementById('leaderboard');
  try {
    const res = await api.quiz.getTop10();
    // Jos ei tuloksia
    if (!res.ok || !res.scores || res.scores.length === 0) {
      container.innerHTML = '<li class="lb-loading">Ei tuloksia</li>';
      return;
    }

    // Piirrä rivit
    container.innerHTML = '';
    const medals = ['🥇', '🥈', '🥉'];
    res.scores.forEach((s, i) => {
      const li = document.createElement('li');
      li.className = 'lb-item';
      // Onko tämä kirjautunut käyttäjä
      const isMe = currentUser && s.displayName === currentUser.displayName;
      // Mitali tai sijaluku
      const rank = medals[i] || `<span class="default">${i + 1}</span>`;
      li.innerHTML = `
        <div class="lb-rank">${rank}</div>
        <div class="lb-name ${isMe ? 'is-me' : ''}">${escHtml(s.displayName)}${isMe ? ' (sinä)' : ''}</div>
        <div class="lb-score">${s.bestScore}</div>
      `;
      container.appendChild(li);
    });
  } catch (error) {
    container.innerHTML = '<li class="lb-loading">Virhe ladattaessa</li>';
  }
}

// ---- Lataa omat tulokset ----
async function loadMyScores() {
  const container = document.getElementById('my-scores-list');
  try {
    const res = await api.quiz.getMyScores();
    // Jos ei suorituksia
    if (!res.ok || !res.scores || res.scores.length === 0) {
      container.innerHTML = '<div class="lb-loading">Ei vielä suorituksia</div>';
      // Tyhjennä paras tulos aloitusnäytöltä
      document.getElementById('my-best-score').textContent = '';
      return;
    }

    // Piirrä viisi viimeisintä
    container.innerHTML = '';
    res.scores.slice(0, 5).forEach((s) => {
      const div = document.createElement('div');
      div.className = 'my-score-item';
      // Muotoile päivä
      const date = new Date(s.quizDate).toLocaleDateString('fi-FI', { day: '2-digit', month: '2-digit' });
      div.innerHTML = `
        <span>${s.correct} pistettä</span>
        <span class="my-score-pct">${s.percentage}%</span>
        <span class="my-score-date">${date}</span>
      `;
      container.appendChild(div);
    });

    // Näytä paras tulos aloitusnäytöllä
    if (res.stats) {
      document.getElementById('my-best-score').textContent =
        `Paras tuloksesi: ${res.stats.bestPercentage}% (${res.stats.totalGames} peliä)`;
    }
  } catch (error) {
    container.innerHTML = '<div class="lb-loading">Virhe</div>';
  }
}

// ============================================================
// TAPAHTUMANKUUNTELIJAT
// ============================================================

// Aloita peli -nappi
document.getElementById('btn-start-game').addEventListener('click', startGame);

// Tarkista vastaus -nappi
document.getElementById('btn-check').addEventListener('click', checkAnswer);

// Enter-näppäin syötekentässä tarkistaa vastauksen
document.getElementById('answer-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') checkAnswer();
});

// Ohita kysymys -nappi
document.getElementById('btn-skip').addEventListener('click', skipQuestion);

// Pelaa uudelleen -nappi
document.getElementById('btn-play-again').addEventListener('click', startGame);

// ============================================================
// KÄYNNISTYS
// ============================================================

// Käynnistä sivun logiikka
initUser();