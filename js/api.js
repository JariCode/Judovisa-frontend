// js/api.js
// Apuri backend-kutsuihin - keskittää osoitteen ja fetch-asetukset

// Backendin perusosoite paikallisessa kehityksessä
const API_BASE = 'http://127.0.0.1:5000/api';

// Yleinen pyyntöfunktio - hoitaa JSON-otsikot ja evästeet
async function apiRequest(path, options = {}) {
  // Yhdistä oletusasetukset ja kutsukohtaiset asetukset
  const config = {
    method: options.method || 'GET',     // oletuksena GET
    headers: { 'Content-Type': 'application/json' }, // lähetä JSONia
    credentials: 'include',              // evästeet mukaan (kirjautuminen)
  };

  // Jos mukana runko, muunna se JSON-merkkijonoksi
  if (options.body) {
    // KORJAUS: Jos body on jo valmiiksi merkkijonona (string), käytetään sitä. 
    // Jos se on objekti (kuten kirjautumisessa), muutetaan se JSON-tekstiksi.
    config.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
  }

  try {
    // Tee varsinainen pyyntö
    const res = await fetch(`${API_BASE}${path}`, config);
    // Lue vastaus JSONina
    const data = await res.json();
    // Palauta sekä onnistuminen että data
    return { ok: res.ok, status: res.status, ...data };
  } catch (error) {
    // Verkkovirhe - backend ei vastaa
    console.error('API-virhe:', error);
    return { ok: false, message: 'Yhteysvirhe palvelimeen' };
  }
}

// Kootut auth-kutsut yhteen objektiin
const api = {
  auth: {
    // Rekisteröi uusi käyttäjä
    register: (username, password) =>
      apiRequest('/auth/register', { method: 'POST', body: { username, password } }),
    // Kirjaudu sisään
    login: (username, password) =>
      apiRequest('/auth/login', { method: 'POST', body: { username, password } }),
    // Kirjaudu ulos
    logout: () =>
      apiRequest('/auth/logout', { method: 'POST' }),
    // Hae kirjautuneen käyttäjän tiedot
    me: () =>
      apiRequest('/auth/me', { method: 'GET' }),
  },
  // Kootut visa-kutsut
  quiz: {
    // Hae kysymykset (ilman vastauksia)
    getQuestions: () =>
      apiRequest('/quiz/questions', { method: 'GET' }),
    // Tarkista yksittäinen vastaus
    checkAnswer: (questionId, given) =>
      apiRequest('/quiz/check', { method: 'POST', body: { questionId, given } }),
    // Tallenna pelin pisteet
    saveScore: (correct, wrong, totalQuestions) =>
      apiRequest('/quiz/score', { method: 'POST', body: { correct, wrong, totalQuestions } }),
    // Hae Top 10
    getTop10: () =>
      apiRequest('/quiz/top10', { method: 'GET' }),
    // Hae omat tulokset
    getMyScores: () =>
      apiRequest('/quiz/my-scores', { method: 'GET' }),
  },
  //Profiilin muokkaus kutsut
  profile: {
    // Päivitä käyttäjätunnus
    updateUsername: (newUsername) =>
      apiRequest('/profile/update-username', { method: 'PUT', body: { newUsername } }),
    // Vaihda salasana
    changePassword: (currentPassword, newPassword) =>
      apiRequest('/profile/change-password', { method: 'PUT', body: { currentPassword, newPassword } }),
    // Poista tili
    deleteAccount: (password) =>
      apiRequest('/profile/delete-account', { method: 'DELETE', body: { password } }),
  },
  //Admin kutsut
  admin: {
    // Hae kaikki dojon käyttäjät järjestelmään
    getUsers: () =>
      apiRequest('/admin/users', { method: 'GET' }),
    // Vaihda valitun käyttäjän roolia (player <-> admin)
    toggleRole: (userId) =>
      apiRequest(`/admin/users/${userId}/toggle-role`, { method: 'PUT' }),
    // Poista valitun käyttäjän tili ja tulokset pysyvästi
    deleteUser: (userId) =>
      apiRequest(`/admin/users/${userId}`, { method: 'DELETE' }),
    // Hae kaikki järjestelmälokit kannasta
    getLogs: () =>
      apiRequest('/admin/logs', { method: 'GET' }),
    // LISÄTTY: Lähetä uusi kysymys backendille suojatusti
    addQuestion: (payload) =>
      apiRequest('/admin/questions', { method: 'POST', body: payload })
  }
};

// Tuo api globaaliksi muille skripteille
window.api = api;