const Store = require('electron-store');
const CryptoJS = require('crypto-js');

const ENCRYPTION_KEY = 'secret-key-for-aes-256';
let store;

function init() {
  store = new Store({
    name: 'pet-data',
    defaults: {
      settings: {
        autoStart: 'true',
        breakInterval: '60',
        petStyle: 'default',
        customPetPath: '',
        weatherCity: ''
      },
      todos: []
    }
  });
}

function encrypt(text) {
  return CryptoJS.AES.encrypt(text, ENCRYPTION_KEY).toString();
}

function decrypt(ciphertext) {
  if (!ciphertext) return '';
  const bytes = CryptoJS.AES.decrypt(ciphertext, ENCRYPTION_KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
}

function setSetting(key, value) {
  const settings = store.get('settings');
  settings[key] = encrypt(value);
  store.set('settings', settings);
}

function getSettings() {
  return new Promise((resolve) => {
    const rawSettings = store.get('settings');
    const settings = {};
    for (const key in rawSettings) {
      try {
        // Try to decrypt, if it fails, it might be unencrypted default data
        const decrypted = decrypt(rawSettings[key]);
        settings[key] = decrypted || rawSettings[key];
      } catch (e) {
        settings[key] = rawSettings[key];
      }
    }
    resolve(settings);
  });
}

// Add basic todo operations for later use
function getTodos() {
  return store.get('todos');
}

function saveTodos(todos) {
  store.set('todos', todos);
}

module.exports = {
  init,
  setSetting,
  getSettings,
  encrypt,
  decrypt,
  getTodos,
  saveTodos
};
