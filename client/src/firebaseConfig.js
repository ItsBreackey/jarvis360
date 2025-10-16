// firebaseConfig.js

import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyCUFXozQ9bxm2JDCCqx31qJHaYPGqnf3pw",
  authDomain: "jarvis360-ec58b.firebaseapp.com",
  projectId: "jarvis360-ec58b",
  storageBucket: "jarvis360-ec58b.firebasestorage.app",
  messagingSenderId: "347274014553",
  appId: "1:347274014553:web:f9c0581cd24ccac2a7a648",
  measurementId: "G-G88Y143V80"
};

export const app = initializeApp(firebaseConfig);
export const analytics = getAnalytics(app);
