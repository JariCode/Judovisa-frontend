// js/game.js
// Pelisivun logiikka
// Tässä vaiheessa: käyttäjän tunnistus ja uloskirjautuminen
// Visan toiminta lisätään myöhemmin

// ---- Tarkista kirjautuminen ja näytä käyttäjätiedot ----
async function initUser() {
  // Hae kirjautuneen käyttäjän tiedot
  const res = await api.auth.me();

  // Jos ei kirjautunut, ohjaa etusivulle
  if (!res.ok || !res.success) {
    window.location.href = 'index.html';
    return;
  }

  // Näytä käyttäjänimi yläpalkissa
  document.getElementById('header-username').textContent = res.user.username;

  // Näytä rooli merkkinä (pelaaja tai admin)
  const roleBadge = document.getElementById('header-role');
  roleBadge.textContent = res.user.role === 'admin' ? 'Admin' : 'Pelaaja';
  roleBadge.classList.add(res.user.role);

  // Näytä admin-painike vain admineille
  if (res.user.role === 'admin') {
    document.getElementById('btn-admin').style.display = '';
  }
}

// ---- Uloskirjautuminen ----
document.getElementById('btn-logout').addEventListener('click', async () => {
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

// ---- Käynnistä sivun logiikka ----
initUser();