
const firebaseAdmin = require('firebase-admin');
try {
  const serviceAccount = require('./serviceAccountKey.json');
  firebaseAdmin.initializeApp({
    credential: firebaseAdmin.cert(serviceAccount)
  });
} catch (err) {
  console.log("Note: Firebase serviceAccountKey.json not present. Continuing without Firebase Admin.");
}

module.exports = firebaseAdmin;