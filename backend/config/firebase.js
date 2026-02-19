/*
 * ============================================================
 *  Firebase Configuration Module
 * ============================================================
 *  Initializes Firebase Admin SDK and exports the database
 *  reference for use throughout the backend.
 *
 *  Supports two modes:
 *    1. Service account JSON file (local development)
 *    2. Environment variables (Render deployment)
 * ============================================================
 */

const admin = require('firebase-admin');
const path = require('path');
require('dotenv').config();

/**
 * Initialize Firebase Admin SDK
 * Tries service account file first, then falls back to env vars.
 */
function initializeFirebase() {
  try {
    // Debugging: Print environment status (don't print secrets!)
    console.log('🔍 Firebase Init Check:');
    console.log(`   FIREBASE_SERVICE_ACCOUNT present? ${!!process.env.FIREBASE_SERVICE_ACCOUNT}`);
    console.log(`   FIREBASE_DATABASE_URL present? ${!!process.env.FIREBASE_DATABASE_URL}`);
    if (process.env.FIREBASE_DATABASE_URL) console.log(`   Target DB: ${process.env.FIREBASE_DATABASE_URL}`);

    // --- Option 1: Service account JSON string (Best for Render) ---
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      let serviceAccount;
      try {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      } catch (e) {
        console.error('❌ FIREBASE_SERVICE_ACCOUNT is not valid JSON.');
        console.error('   Did you paste the file PATH instead of the CONTENT?');
        console.error('   Parser error:', e.message);
        throw new Error('Invalid JSON in FIREBASE_SERVICE_ACCOUNT');
      }

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: process.env.FIREBASE_DATABASE_URL,
      });
      console.log('✅ Firebase initialized with FIREBASE_SERVICE_ACCOUNT env var.');
    }
    // --- Option 2: Service account JSON file (Local Dev) ---
    else if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
      console.log(`   Loading from path: ${process.env.FIREBASE_SERVICE_ACCOUNT_PATH}`);
      // Resolve path relative to the backend root (parent of config/)
      const keyPath = path.resolve(__dirname, '..', process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
      const serviceAccount = require(keyPath);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: process.env.FIREBASE_DATABASE_URL,
      });
      console.log('✅ Firebase initialized with service account file.');
    }
    // --- Option 3: Inline environment variables ---
    else if (process.env.FIREBASE_PROJECT_ID) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }),
        databaseURL: process.env.FIREBASE_DATABASE_URL,
      });
      console.log('✅ Firebase initialized with individual env vars.');
    }
    // --- No credentials found ---
    else {
      console.warn('⚠️  No Firebase credentials found. Running in mock mode.');
      console.warn('   Check Render Env Vars: FIREBASE_SERVICE_ACCOUNT (should be JSON content) and FIREBASE_DATABASE_URL');
      return null;
    }

    return { db: admin.database(), error: null };
  } catch (error) {
    console.error('❌ Firebase initialization failed:', error.message);
    console.warn('   Running in mock mode (data will not persist).');
    return { db: null, error: error.message };
  }
}

const { db, error: initError } = initializeFirebase() || { db: null, error: 'Unknown validation error' };

module.exports = { admin, db, initError };
