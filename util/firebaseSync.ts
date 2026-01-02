import { doc, setDoc, getDoc } from 'firebase/firestore';

import { db } from './firebaseConfig';
import type { Store } from '@reduxjs/toolkit';

/**
 * Connect Redux store to Firebase - syncs Redux changes to Firebase only
 * @param store - Redux store instance
 * @param userId - Firebase user ID
 * @returns Unsubscribe function to stop syncing
 */
export const connectToReduxPersistence = async (
  store: Store,
  updateFromFirebase: (data: any) => { type: string; payload: any },
  userId: string
): Promise<(() => void) | undefined> => {
  try {
    // Reference to user's document in Firestore
    const userDocRef = doc(db, 'users', userId);

    // Check if document exists, if not create it
    const docSnapshot = await getDoc(userDocRef);
    if (!docSnapshot.exists()) {
      console.log('📄 No user document found in Firebase');
      
      const state = store.getState();
      const initialToSave = {
        ready: (state as any).ready ?? true,
        userData: {
          userProfile: {
            Uid: userId,
          },
          round: [],
        },
      };

      await setDoc(userDocRef, initialToSave);
      console.log('✅ Created initial document for:', userId, initialToSave);
    } else {
      // Load existing Firebase data into Redux
      const data = docSnapshot.data();
      console.log('📥 Loading existing data from Firebase:', data);
      
      // Load Firebase data with userId - single dispatch to avoid race conditions
      const dataToLoad = {
        userProfile: {
          ...(data?.userData?.userProfile || {}),
          Uid: userId,
        },
        round: Array.isArray(data?.userData?.round) ? data.userData.round : [],
      };
      store.dispatch(updateFromFirebase(dataToLoad));
    }

    // Subscribe to Redux store changes and sync to Firebase
    let previousState = store.getState();
    
    const unsubscribe = store.subscribe(async () => {
      const currentState = store.getState();
      
      // Don't sync if Uid is empty (logout scenario)
      const currentUid = (currentState as any).userData?.userProfile?.Uid;
      if (!currentUid) {
        previousState = currentState;
        return;
      }
      
      // Only sync if userData has changed
      if (previousState.userData !== currentState.userData) {
        try {
          await setDoc(userDocRef, {
            ready: (currentState as any).ready,
            userData: (currentState as any).userData,
          }, { merge: true });
          
          console.log('📤 Synced to Firebase:', (currentState as any).userData);
        } catch (error) {
          console.error('❌ Error syncing to Firebase:', error);
        }
      }
      
      previousState = currentState;
    });

    return unsubscribe;
  } catch (error) {
    console.error('❌ Error connecting to Firebase persistence:', error);
    return undefined;
  }
};

/**
 * Sign in anonymously as a guest user
 */
