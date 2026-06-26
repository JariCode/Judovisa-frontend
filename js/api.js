// js/api.js
// Apuri backend-kutsuihin - keskittää osoitteen ja fetch-asetukset

// Backendin perusosoite paikallisessa kehityksessä
const API_BASE = 'http://localhost:5000/api';

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
    config.body = JSON.stringify(options.body);
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
  },
};

// Tuo api globaaliksi muille skripteille
window.api = api;