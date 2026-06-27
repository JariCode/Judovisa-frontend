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
// PROFIILITOIMINNOT (Aidot API-kutsut tietokantaan)
// ============================================================

// 1. Tunnuksen muokkaus
document.getElementById('form-profile-edit').addEventListener('submit', async (e) => {
  e.preventDefault();
  const newUsername = document.getElementById('edit-username').value.trim();

  if (!newUsername) {
    showProfileMessage('profile-edit-message', 'Käyttäjätunnus ei voi olla tyhjä', 'error');
    return;
  }

  // Kutsutaan uutta api.js-reittiä
  const res = await api.profile.updateUsername(newUsername);

  if (res.success) {
    showProfileMessage('profile-edit-message', 'Käyttäjätunnus päivitetty onnistuneesti!', 'success');
    // Päivitetään heti uusi nimi yläpalkkiin lennosta
    document.getElementById('header-username').textContent = res.user.displayName;
  } else {
    showProfileMessage('profile-edit-message', res.message || 'Tunnuksen vaihto epäonnistui', 'error');
  }
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

  // Kutsutaan uutta api.js-reittiä
  const res = await api.profile.changePassword(currentPw, newPw);

  if (res.success) {
    showProfileMessage('profile-pw-message', 'Salasana vaihdettu onnistuneesti!', 'success');
    // Tyhjennetään syötekentät
    document.getElementById('pw-current').value = '';
    document.getElementById('pw-new').value = '';
    document.getElementById('pw-new2').value = '';
  } else {
    showProfileMessage('profile-pw-message', res.message || 'Salasanan vaihto epäonnistui', 'error');
  }
});

// ============================================================
// 3. TILIN POISTAMINEN (Kaksivaiheinen tekstivarmistus)
// ============================================================

// Muuttuja, joka muistaa onko varoitusta vielä näytetty
let deleteConfirmedOnce = false;

document.getElementById('btn-confirm-delete').addEventListener('click', async () => {
  const password = document.getElementById('delete-confirm-pw').value;
  const deleteBtn = document.getElementById('btn-confirm-delete');

  // 1. Tarkistetaan ensin, että salasana on kirjoitettu kenttään
  if (!password) {
    showProfileMessage('profile-delete-message', 'Syötä salasanasi vahvistaaksesi poiston', 'error');
    deleteConfirmedOnce = false;
    deleteBtn.textContent = 'Poista tili pysyvästi';
    return;
  }

  // 2. ENSIMMÄINEN KLIKKAUS: Näytetään varoitusteksti ja muutetaan napin sisältö
  if (!deleteConfirmedOnce) {
    showProfileMessage(
      'profile-delete-message', 
      'Oletko varma? Tämä toiminto poistaa tilisi ja kaikki pelituloksesi pysyvästi.', 
      'error'
    );
    deleteConfirmedOnce = true;
    deleteBtn.textContent = '⚠ Olen varma, poista tili';
    return;
  }

  // 3. TOINEN KLIKKAUS: Suoritetaan varsinainen poisto backendissä
  const res = await api.profile.deleteAccount(password);

  if (res.success) {
    // Näytetään onnistumisteksti suoraan viestikentässä
    showProfileMessage('profile-delete-message', 'Tili poistettu onnistuneesti. Ohjataan aloitussivulle...', 'success');
    
    // Tyhjennetään pelin tila istunnosta
    sessionStorage.removeItem('quiz_state');
    
    // Ohjataan käyttäjä ulos pienen viiveen jälkeen
    setTimeout(() => {
      window.location.href = 'index.html';
    }, 1500);
  } else {
    // Jos salasana oli väärin, näytetään virhe ja nollataan napin tila
    showProfileMessage('profile-delete-message', res.message || 'Tilin poisto epäonnistui', 'error');
    deleteConfirmedOnce = false;
    deleteBtn.textContent = 'Poista tili pysyvästi';
  }
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

// ============================================================
// ENTER-NÄPPÄIMEN KUUNTELIJAT LOMAKKEISSA
// ============================================================

// 1. Tunnuksen muokkauskenttä
document.getElementById('edit-username').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault(); // Estetään selaimen oletuskäyttäytyminen
    // Laukaisemalla 'submit'-tapahtuma, lomakkeen oma addEventListener hoitaa loput
    document.getElementById('form-profile-edit').requestSubmit();
  }
});

// 2. Salasananvaihto-kentät (kaikki kolme kenttää)
const passwordInputs = ['pw-current', 'pw-new', 'pw-new2'];
passwordInputs.forEach(id => {
  const input = document.getElementById(id);
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('form-change-password').requestSubmit();
      }
    });
  }
});

// 3. Tilin poiston salasanakenttä
document.getElementById('delete-confirm-pw').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    // Koska tilin poisto ei käytä submit-painiketta, klikataan poistonappia ohjelmallisesti
    document.getElementById('btn-confirm-delete').click();
  }
});

// Käynnistä sivun alustus
initProfile();