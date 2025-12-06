import { doc, onSnapshot, setDoc } from 'firebase/firestore';

import { db } from './firebaseConfig';
import type { Store } from '@reduxjs/toolkit';

/**
 * Connect to Firebase Firestore and sync user data with Redux store
 * @param store - Redux store instance
 * @param updateFromFirebase - Action creator to update Redux state
 * @param userId - Firebase user ID
 * @returns Unsubscribe function to stop listening to Firestore changes
 */
export const connectToReduxPersistence = async (
  store: Store,
  updateFromFirebase: (data: any) => { type: string; payload: any },
  userId: string
): Promise<(() => void) | undefined> => {
  try {
    // Reference to user's document in Firestore
    const userDocRef = doc(db, 'users', userId);

    // Listen to real-time updates from Firestore
    const unsubscribe = onSnapshot(
      userDocRef,
      async (docSnapshot) => {
        if (docSnapshot.exists()) {
          const data = docSnapshot.data();
          console.log('📥 Syncing data from Firebase:', data);

          // Dispatch the data to Redux store
          store.dispatch(updateFromFirebase(data));
        } else {
          console.log('📄 No user document found in Firebase');

          // Get current Redux state
          const state = store.getState();

          const initialToSave = {
            ready: (state as any).ready ?? true,
            userData: {
              userProfile: {
                // use existing Uid if any, otherwise userId
                ...((state as any).userData?.userProfile || {}),
                Uid: (state as any).userData?.userProfile?.Uid || userId,
              },
              mistakes: (state as any).userData?.mistakes ?? [],
            },
          };

          await setDoc(userDocRef, initialToSave, { merge: true });
          console.log(
            '✅ Created initial document for:',
            userId,
            initialToSave
          );
        }
      },
      (error) => {
        console.error('❌ Error listening to Firestore:', error);
      }
    );

    return unsubscribe;
  } catch (error) {
    console.error('❌ Error connecting to Firebase persistence:', error);
    return undefined;
  }
};

/**
 * Sign in anonymously as a guest user
 */
