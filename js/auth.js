// js/auth.js
// Etusivun logiikka: välilehtien vaihto, salasanan näyttö, lomakkeiden lähetys

// ---- Välilehtien vaihto kirjautumisen ja rekisteröinnin välillä ----
// Hae kaikki välilehtipainikkeet
const tabButtons = document.querySelectorAll('.tab-btn');

// Lisää jokaiselle painikkeelle klikkauskäsittelijä
tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    // Mikä välilehti valittiin (login tai register)
    const tab = btn.dataset.tab;

    // Päivitä painikkeiden aktiivisuus
    tabButtons.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');

    // Näytä oikea lomake ja piilota toinen
    document.getElementById('form-login').classList.toggle('active', tab === 'login');
    document.getElementById('form-register').classList.toggle('active', tab === 'register');

    // Tyhjennä viestit vaihdettaessa
    document.getElementById('login-message').textContent = '';
    document.getElementById('register-message').textContent = '';
  });
});

// ---- Salasanan näyttö/piilotus ----
// Hae kaikki silmäpainikkeet
const pwToggles = document.querySelectorAll('.pw-toggle');

// Lisää jokaiselle painikkeelle vaihtokäsittelijä
pwToggles.forEach((btn) => {
  btn.addEventListener('click', () => {
    // Mihin kenttään painike liittyy
    const input = document.getElementById(btn.dataset.target);
    // Vaihda tyyppiä password <-> text
    if (input.type === 'password') {
      input.type = 'text';
    } else {
      input.type = 'password';
    }
  });
});

// ---- Apufunktio viestin näyttämiseen ----
// elementId = viestialueen id, text = teksti, type = 'error' tai 'success'
function showMessage(elementId, text, type) {
  const el = document.getElementById(elementId);
  el.textContent = text;
  // Aseta luokka väriä varten
  el.className = 'auth-message ' + type;
}

// ---- Kirjautumislomakkeen lähetys ----
document.getElementById('form-login').addEventListener('submit', async (e) => {
  // Estä sivun uudelleenlataus
  e.preventDefault();

  // Lue kenttien arvot
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;

  // Yksinkertainen etutarkistus ettei lähetetä tyhjää
  if (!username || !password) {
    showMessage('login-message', 'Täytä molemmat kentät', 'error');
    return;
  }

  // Kutsu backendiä
  const res = await api.auth.login(username, password);

  // Onnistuiko kirjautuminen
  if (res.ok && res.success) {
    showMessage('login-message', 'Kirjautuminen onnistui', 'success');
    // Siirry pelisivulle
    window.location.href = 'game.html';
  } else {
    // Näytä backendin geneerinen virheviesti
    showMessage('login-message', res.message || 'Kirjautuminen epäonnistui', 'error');
  }
});

// ---- Rekisteröintilomakkeen lähetys ----
document.getElementById('form-register').addEventListener('submit', async (e) => {
  // Estä sivun uudelleenlataus
  e.preventDefault();

  // Lue kenttien arvot
  const username = document.getElementById('reg-username').value.trim();
  const password = document.getElementById('reg-password').value;

  // Etutarkistus: salasana vähintään 8 merkkiä
  if (password.length < 8) {
    showMessage('register-message', 'Salasana vähintään 8 merkkiä', 'error');
    return;
  }

  // Kutsu backendiä
  const res = await api.auth.register(username, password);

  // Onnistuiko rekisteröinti
  if (res.ok && res.success) {
    showMessage('register-message', 'Tili luotu', 'success');
    // Siirry pelisivulle
    window.location.href = 'game.html';
  } else {
    // Näytä backendin virheviesti
    showMessage('register-message', res.message || 'Rekisteröinti epäonnistui', 'error');
  }
});