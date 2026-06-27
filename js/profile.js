// js/profile.js
// Profiilisivun logiikka: käyttäjän tunnistus, välilehtien vaihto ja profiilitoiminnot

// Tallenna kirjautunut käyttäjä myöhempää käyttöä varten
let currentUser = null;

// ============================================================
// KÄYTTÄJÄ JA YLÄPALKKI (Täsmälleen sama logiikka kuin game.js)
// ============================================================

async function initProfile() {
  // Hae kirjautuneen käyttäjän tiedot
  const res = await api.auth.me();

  // Jos ei kirjautunut, ohjaa etusivulle
  if (!res.ok || !res.success) {
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

  // Asetetaan nykyinen tunnus valmiiksi muokkauskenttään
  document.getElementById('edit-username').value = res.user.displayName || '';

  // Näytä admin-painike vain admineille (Käyttöliittymän ohjaus, backend suojaa oikeat reitit)
  if (res.user.role === 'admin') {
    document.getElementById('btn-admin').style.display = '';
  }
}

// ============================================================
// VÄLILEHTIEN VAIHTO
// ============================================================

const profileTabs = document.querySelectorAll('.profile-tabs .tab-btn');

profileTabs.forEach((btn) => {
  btn.addEventListener('click', () => {
    const targetTab = btn.dataset.ptab;

    // Päivitetään aktiivinen välilehtipainike
    profileTabs.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');

    // Piilotetaan kaikki lomakkeet ja näytetään valittu
    document.querySelectorAll('.profile-form').forEach((form) => {
      form.classList.remove('active');
    });

    if (targetTab === 'edit') {
      document.getElementById('form-profile-edit').classList.add('active');
    } else if (targetTab === 'password') {
      document.getElementById('form-change-password').classList.add('active');
    } else if (targetTab === 'delete') {
      document.getElementById('form-delete-account').classList.add('active');
    }

    // Tyhjennetään mahdolliset vanhat palauteviestit vaihdon yhteydessä
    clearMessages();
  });
});

function clearMessages() {
  document.getElementById('profile-edit-message').textContent = '';
  document.getElementById('profile-pw-message').textContent = '';
  document.getElementById('profile-delete-message').textContent = '';
}

function showProfileMessage(elementId, text, type) {
  const el = document.getElementById(elementId);
  el.textContent = text;
  el.className = 'auth-message ' + type;
}

// ============================================================
// SALASANAN NÄYTTÖ / PIILOTUS
// ============================================================

window.togglePassword = function(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  
  if (input.type === 'password') {
    input.type = 'text';
  } else {
    input.type = 'password';
  }
};

// ============================================================
// PROFIILITOIMINNOT (Lomakkeiden lähetykset)
// ============================================================

// 1. Tunnuksen muokkaus
document.getElementById('form-profile-edit').addEventListener('submit', async (e) => {
  e.preventDefault();
  const newUsername = document.getElementById('edit-username').value.trim();

  if (!newUsername) {
    showProfileMessage('profile-edit-message', 'Käyttäjätunnus ei voi olla tyhjä', 'error');
    return;
  }

  // TODO: Toteuta API-kutsu backend-reitin valmistuessa (esim. api.profile.updateUsername)
  showProfileMessage('profile-edit-message', 'Tiedot tallennettu! (Vaatii backend-reitin)', 'success');
});

// 2. Salasanan vaihto
document.getElementById('form-change-password').addEventListener('submit', async (e) => {
  e.preventDefault();
  const currentPw = document.getElementById('pw-current').value;
  const newPw = document.getElementById('pw-new').value;
  const newPw2 = document.getElementById('pw-new2').value;

  if (!currentPw || !newPw || !newPw2) {
    showProfileMessage('profile-pw-message', 'Täytä kaikki kentät', 'error');
    return;
  }

  if (newPw.length < 8) {
    showProfileMessage('profile-pw-message', 'Uuden salasanan on oltava vähintään 8 merkkiä', 'error');
    return;
  }

  if (newPw !== newPw2) {
    showProfileMessage('profile-pw-message', 'Uudet salasanat eivät täsmää', 'error');
    return;
  }

  // TODO: Toteuta API-kutsu backend-reitin valmistuessa (esim. api.profile.changePassword)
  showProfileMessage('profile-pw-message', 'Salasana vaihdettu! (Vaatii backend-reitin)', 'success');
});

// 3. Tilin poistaminen
document.getElementById('btn-confirm-delete').addEventListener('click', async () => {
  const password = document.getElementById('delete-confirm-pw').value;

  if (!password) {
    showProfileMessage('profile-delete-message', 'Syötä salasanasi vahvistaaksesi poiston', 'error');
    return;
  }

  const varmistus = confirm('Oletko aivan varma? Tätä ei voi peruuttaa ja kaikki pelituloksesi pyyhitään.');
  if (!varmistus) return;

  // TODO: Toteuta API-kutsu backend-reitin valmistuessa (esim. api.profile.deleteAccount)
  alert('Tili poistettu! (Toteuta backend-kutsu tässä)');
  
  sessionStorage.removeItem('quiz_state');
  await api.auth.logout();
  window.location.href = 'index.html';
});

// ============================================================
// NAVIGOINTI YLÄPALKKI
// ============================================================

// Pelisivulle
document.getElementById('btn-game').addEventListener('click', () => {
  window.location.href = 'game.html';
});

// Admin-sivulle
document.getElementById('btn-admin').addEventListener('click', () => {
  window.location.href = 'admin.html';
});

// Uloskirjautuminen
document.getElementById('btn-logout').addEventListener('click', async () => {
  sessionStorage.removeItem('quiz_state');
  await api.auth.logout();
  window.location.href = 'index.html';
});

// Käynnistä sivun alustus
initProfile();
