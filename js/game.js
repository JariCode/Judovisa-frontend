// js/game.js
// Pelisivun logiikka: käyttäjän tunnistus, uloskirjautuminen ja visa
// Vastaukset, yritykset ja pisteet hoidetaan backendin pelisessiossa
// Frontend ei laske pisteitä, vaan näyttää backendin palauttamat tulokset

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
    sessionStorage.removeItem('quiz_sid');
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

  // Yritä palauttaa kesken jäänyt peli backendin sessiosta
  restoreSession();
}

// ---- Uloskirjautuminen ----
document.getElementById('btn-logout').addEventListener('click', async () => {
  // Tyhjennä paikallinen sessioviite
  sessionStorage.removeItem('quiz_sid');
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
// Huom: pisteitä ja yrityksiä EI lasketa täällä, vaan ne tulevat backendista
let state = {
  sessionId: null,        // backendin pelisession id
  questions: [],          // backendin arpomat kysymykset (ilman vastauksia)
  currentIndex: 0,        // monesko kysymys menossa
  attemptsLeft: 0,        // yrityksiä jäljellä nykyisessä kysymyksessä (backendista)
  correctCount: 0,        // oikeita annettu nykyisessä kysymyksessä (backendista)
  givenAnswers: [],       // tässä kysymyksessä annetut vastaukset näyttöä varten { text, type }
  sessionScores: [],      // kategoriakohtaiset tulokset tulosnäyttöä varten
  totalCorrect: 0,        // oikeat yhteensä (näyttöä varten, backend laskee viralliset)
  totalWrong: 0,          // väärät yhteensä (näyttöä varten)
  totalSkipped: 0,        // ohitetut yhteensä (näyttöä varten)
  running: false,         // onko peli käynnissä
  checking: false,        // estetään tuplalähetys API-kutsun aikana
  
};

// ============================================================
// APUFUNKTIOT
// ============================================================

// Normalisoi vastaus frontissa vain duplikaattisirujen näyttöön
function normalize(str) {
  return String(str || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s\-_]+/g, '');
}

// Sekoita taulukko satunnaiseen järjestykseen (käytetään vain monivalinnan vaihtoehtoihin)
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
    // Pyydä backendia aloittamaan peli: se arpoo kysymykset ja luo session
    const res = await api.quiz.startGame();

    // Jos aloitus epäonnistui, palauta nappi ja lopeta
    if (!res.ok || !res.sessionId || !res.questions || res.questions.length === 0) {
      alert('Pelin aloitus epäonnistui');
      return;
    }

    // Nollaa tila ja ota käyttöön backendin arpomat kysymykset
    state = {
      sessionId: res.sessionId,
      questions: res.questions,
      currentIndex: 0,
      attemptsLeft: 0,
      correctCount: 0,
      givenAnswers: [],
      sessionScores: [],
      totalCorrect: 0,
      totalWrong: 0,
      totalSkipped: 0,
      running: true,
      checking: false,
    };

    // Tallenna vain session id selaimeen, jotta sivun päivitys löytää pelin
    sessionStorage.setItem('quiz_sid', res.sessionId);

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

// ---- Palauta kesken jäänyt peli backendin sessiosta (sivun päivitys) ----
async function restoreSession() {
  // Katso onko selaimeen tallennettu session id
  const sid = sessionStorage.getItem('quiz_sid');
  if (!sid) return;

  try {
    // Hae session tila backendista
    const res = await api.quiz.getSession(sid);

    // Jos sessiota ei voi jatkaa (päättynyt tai virhe), siivoa viite ja jää aloitusnäyttöön
    if (!res.ok || !res.sessionId || !res.questions || res.questions.length === 0) {
      sessionStorage.removeItem('quiz_sid');
      return;
    }

    // Etsi ensimmäinen kysymys jota ei ole vielä käsitelty loppuun
    let resumeIndex = res.questions.findIndex((q) => !q.done);
    // Jos kaikki on tehty, peli on käytännössä valmis - siivoa ja jää aloitukseen
    if (resumeIndex === -1) {
      sessionStorage.removeItem('quiz_sid');
      return;
    }

    // Haetaan talteen kohdekysymys, jotta saadaan sen tämänhetkiset vastaukset
    const currentQ = res.questions[resumeIndex];

    // Rakenna tila backendin tiedoista
    state = {
      sessionId: res.sessionId,
      questions: res.questions,
      currentIndex: resumeIndex,
      attemptsLeft: currentQ.attemptsLeft,
      correctCount: currentQ.correctCount,
      givenAnswers: currentQ.givenAnswers || [], // Päivitetty: ladataan aiemmin annetut vastaukset tähän kysymykseen
      sessionScores: [],
      totalCorrect: 0,
      totalWrong: 0,
      totalSkipped: 0,
      running: true,
      checking: false,
    };

    // Näytä kysymysnäyttö ja lataa kysymys, johon jäätiin
    showScreen('screen-question');
    loadQuestion();
  } catch (error) {
    console.error('Session palautus epäonnistui:', error);
    sessionStorage.removeItem('quiz_sid');
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

  // Aseta yritykset ja oikeat backendin tilan mukaan
  // Jatketussa pelissä q.attemptsLeft ja q.correctCount tulevat sessiosta,
  // uudessa pelissä ne ovat määrittelemättömiä, jolloin käytetään täyttä yritysmäärää
  state.attemptsLeft = (typeof q.attemptsLeft === 'number') ? q.attemptsLeft : q.attempts;
  state.correctCount = (typeof q.correctCount === 'number') ? q.correctCount : 0;
  
  // Päivitetty: jos tilassa on jo ladattuna siruja (esim. restoreSession jäljiltä), säilytetään ne, muuten tyhjennetään uutta kysymystä varten
  state.givenAnswers = state.givenAnswers.length > 0 ? state.givenAnswers : [];
  state.checking = false;

  // Päivitä kysymyksen tiedot näkyviin
  document.getElementById('q-category').textContent = `${q.jpName || ''} · ${q.category}`;
  document.getElementById('q-text').textContent = q.questionText;
  document.getElementById('answer-input').value = '';
  document.getElementById('feedback-area').innerHTML = '';
  document.getElementById('given-answers').innerHTML = '';
  document.getElementById('given-title').textContent = '';

  // Päivitetty: Piirretään mahdolliset valmiina olevat vastaussirut näytölle sivun latautuessa
  if (state.givenAnswers.length > 0) {
    state.givenAnswers.forEach((ans) => {
      addAnswerChip(ans.text, ans.type);
    });
  }

  // HAETAAN VALINNAT JA VASTATTAVAT ALUEET LENNOSTA
  const textWrap = document.getElementById('text-answer-wrap');
  const choicesWrap = document.getElementById('choices-answer-wrap');
  const choicesList = document.getElementById('choices-list');

  // Tarkistetaan onko options taulukko olemassa
  if (q.options && Array.isArray(q.options) && q.options.length > 0) {
    // 1. Kyseessä on monivalinta: vaihdetaan näkymät
    if (textWrap) textWrap.style.display = 'none';
    if (choicesWrap) choicesWrap.style.display = 'block';
    if (choicesList) {
      choicesList.innerHTML = '';

      // Sekoitetaan vaihtoehtojen järjestys lennosta, jotta oikea vastaus ei ole aina samassa kohdassa!
      const shuffledOptions = shuffle(q.options);

      // 2. Luodaan radiopainikkeet sekoitetusta listasta
      shuffledOptions.forEach((option, index) => {
        const label = document.createElement('label');
        label.className = 'choice-item'; // Asettaa luokan laatikolle

        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'judo-choice';
        radio.className = 'choice-radio'; // Asettaa luokan pallolle
        radio.value = option;

        // Kun radiopainiketta klikataan, se hyödyntää suoraan checkAnswer()-logiikkaa
        radio.addEventListener('change', () => {
          if (state.attemptsLeft > 0 && !state.checking) {
            // Asetetaan valittu arvo piilotettuun tekstikenttään, jotta checkAnswer lukee sen
            document.getElementById('answer-input').value = option;
            checkAnswer();

            // Jos yritysmäärä on 1, lukitaan valinnat välittömästi painalluksen jälkeen
            if (q.attempts === 1) {
              document.querySelectorAll('input[name="judo-choice"]').forEach(input => input.disabled = true);
            }
          }
        });

        label.appendChild(radio);
        label.appendChild(document.createTextNode(` ${option}`));
        choicesList.appendChild(label);
      });
    }
  } else {
    // Perinteinen tekstikysymys: palautetaan normaali asettelu ja piilotetaan monivalinta
    if (textWrap) textWrap.style.display = 'flex';
    if (choicesWrap) choicesWrap.style.display = 'none';

    // Asetetaanko fokus syötekenttään vain tekstikysymyksessä
    const inputField = document.getElementById('answer-input');
    if (inputField) inputField.focus();
  }

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

// ---- Lisää vastaus annettujen vastausten listaan ----
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

  const q = getQ();

  // Lähetä vastaus backendiin tarkistettavaksi (backend hoitaa yritykset, synonyymit ja pisteet)
  state.checking = true;
  document.getElementById('btn-check').disabled = true;

  try {
    const res = await api.quiz.checkAnswer(state.sessionId, q._id, raw);

    // Jos tarkistus epäonnistui
    if (!res.ok || !res.success) {
      showFeedback(res.message || 'Virhe tarkistaessa vastausta', 'out');
      return;
    }

    // Päivitä tila backendin palauttamilla luvuilla (backend is absolute truth)
    state.attemptsLeft = res.attemptsLeft;
    state.correctCount = res.correctCount;

    // Tarkistetaan onko kyseessä monivalintakysymys (löytyy options-kenttä)
    const isMultipleChoice = q.options && q.options.length > 0;

    // Käsittele tulos backendin result-arvon mukaan
    if (res.result === 'correct') {
      // Uusi oikea vastaus
      state.totalCorrect++;
      addAnswerChip(raw, 'correct');
      state.givenAnswers.push({ text: raw, type: 'correct' });
      input.value = '';
      renderAttemptDots();

      if (isMultipleChoice) {
        showFeedback('Oikein!', 'correct');
        setTimeout(() => nextQuestion(false), 1000);
      } else if (res.questionDone) {
        // Kysymys valmis: joko kaikki oikein tai yritykset loppu
        if (state.correctCount >= q.attempts) {
          showFeedback(`Erinomainen, kaikki ${q.attempts} oikein`, 'correct');
        } else {
          showFeedback('Oikein, yritykset käytetty', 'correct');
        }
        setTimeout(() => nextQuestion(false), 1000);
      } else {
        showFeedback('Oikein, +1 piste', 'correct');
      }
    } else if (res.result === 'already') {
      // Sama lukko jo annettu (synonyymi tai sama vastaus) - kuluttaa yrityksen, ei pistettä
      state.totalWrong++;
      addAnswerChip(raw, 'same');
      state.givenAnswers.push({ text: raw, type: 'same' });
      input.value = '';
      input.classList.add('shake');
      setTimeout(() => input.classList.remove('shake'), 400);
      renderAttemptDots();

      if (isMultipleChoice) {
        showFeedback('Olet jo antanut tämän vastauksen', 'same');
        setTimeout(() => nextQuestion(false), 1000);
      } else if (res.questionDone) {
        showFeedback('Olet jo antanut tämän vastauksen, yritykset loppuivat', 'same');
        setTimeout(() => nextQuestion(false), 1000);
      } else {
        showFeedback('Olet jo antanut tämän vastauksen', 'same');
      }
    } else {
      // Väärä vastaus - kuluttaa yrityksen
      state.totalWrong++;
      addAnswerChip(raw, 'wrong');
      state.givenAnswers.push({ text: raw, type: 'wrong' });
      input.value = '';
      input.classList.add('shake');
      setTimeout(() => input.classList.remove('shake'), 400);
      renderAttemptDots();

      if (isMultipleChoice) {
        showFeedback('Väärin!', 'wrong');
        setTimeout(() => nextQuestion(false), 1000);
      } else if (res.questionDone) {
        showFeedback('Väärä vastaus, yritykset loppuivat', 'wrong');
        setTimeout(() => nextQuestion(false), 1000);
      } else {
        showFeedback('Väärä vastaus, yritä uudelleen', 'wrong');
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
  // Tallenna kategorian tulos tulosnäyttöä varten
  const q = getQ();
  state.sessionScores.push({
    category: q.category,
    jpName: q.jpName || '',
    correct: state.correctCount,
    required: q.attempts,
    skipped,
  });

  // Jos ohitettiin ilman yhtään oikeaa, laske ohitetuksi
  if (skipped) state.totalSkipped++;

  // Siirry seuraavaan
  state.currentIndex++;

  // KORJAUS: Tyhjennetään annettujen vastausten sirulista, jotta edellisen kysymyksen sirut eivät valu seuraavaan
  state.givenAnswers = [];

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

  // Tallenna pisteet backendiin: backend laskee viralliset pisteet sessiosta
  let savedScore = null;
  try {
    const res = await api.quiz.saveScore(state.sessionId);
    if (res.ok && res.score) {
      savedScore = res.score;
    }
  } catch (error) {
    console.error('Pisteiden tallennus epäonnistui:', error);
  }

  // Siivoa sessioviite, peli on ohi
  sessionStorage.removeItem('quiz_sid');

  // Näytä tulosnäyttö (käytä backendin laskemia lukuja jos saatiin)
  showScreen('screen-results');
  renderResults(savedScore);

  // Päivitä sivupalkin listat
  loadLeaderboard();
  loadMyScores();
}

// ---- Piirrä tulosnäyttö ----
// savedScore on backendin laskema virallinen tulos { correct, wrong, total, percentage }
function renderResults(savedScore) {
  // Käytä ensisijaisesti backendin laskemia lukuja, muuten frontin näyttölukuja varalla
  const totalCorrect = savedScore ? savedScore.correct : state.totalCorrect;
  const totalWrong = savedScore ? savedScore.wrong : state.totalWrong;
  const pct = savedScore
    ? savedScore.percentage
    : (() => {
        const totalRequired = state.sessionScores.reduce((sum, s) => sum + s.required, 0);
        return totalRequired > 0 ? Math.round((state.totalCorrect / totalRequired) * 100) : 0;
      })();

  // Valitse kanji ja otsikko prosentin mukaan
  let kanji = '頑';
  let title = 'Harjoitus tekee mestarin!';
  if (pct >= 90) { kanji = '優'; title = 'Erinomainen suoritus!'; }
  else if (pct >= 70) { kanji = '良'; title = 'Hyvä suoritus!'; }
  else if (pct >= 50) { kanji = '可'; title = 'Kohtalainen suoritus!'; }

  // Aseta tulosten yläosa
  document.getElementById('results-kanji').textContent = kanji;
  document.getElementById('results-title').textContent = title;
  document.getElementById('results-points').textContent = totalCorrect;
  document.getElementById('results-pct').textContent = pct + '% oikein';

  // Aseta erittely
  document.getElementById('res-correct').textContent = totalCorrect;
  document.getElementById('res-wrong').textContent = totalWrong;
  document.getElementById('res-skipped').textContent = state.totalSkipped;

  // Piirrä tulokset kategoriakohtaisesti
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