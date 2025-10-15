// firebaseConfig.js

import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";

// Load Firebase configuration from environment variables to avoid committing secrets.
// For Create React App, environment variables used in the browser must be prefixed with REACT_APP_
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY || '',
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || '',
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || '',
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: process.env.REACT_APP_FIREBASE_APP_ID || '',
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID || ''
};

export const app = initializeApp(firebaseConfig);
export const analytics = typeof window !== 'undefined' && process.env.REACT_APP_FIREBASE_MEASUREMENT_ID ? getAnalytics(app) : null;
