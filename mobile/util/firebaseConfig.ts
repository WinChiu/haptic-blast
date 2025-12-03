import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Your Firebase configuration
// Replace with your actual Firebase project credentials from Firebase Console
const firebaseConfig = {
  apiKey: "AIzaSyAn-CThr5FDq2byxv3wYqEP69wjTE5aJ0k",
  authDomain: "mtm-hatic.firebaseapp.com",
  projectId: "mtm-hatic",
  storageBucket: "mtm-hatic.firebasestorage.app",
  messagingSenderId: "95443028302",
  appId: "1:95443028302:web:dcba7b1d3bfce09d21361f",
  measurementId: "G-H48W0B9GFQ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication and Firestore
export const auth = getAuth(app);
export const db = getFirestore(app);
