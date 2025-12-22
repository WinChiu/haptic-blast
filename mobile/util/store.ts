import { createStore } from 'redux';

const initialState = {
  ready: true,
  userData: {
    userProfile: {
      Uid: '',
    },
    round: [] as Array<{
      timeSpent: {
        start: number;
        finish: number;
        duration: number;
        stop: number;
        hapticEnabled: boolean;
        soundEnabled: boolean;
      };
      mistake: Array<{
        start: number;
        finish: number;
        duration: number;
      }>;
    }>,
  },
  appSettings: {
    debugMode: false,
  },
};

function reducer(state = initialState, action: any) {
  switch (action.type) {
    // Merge everything coming from Firebase into userData
    case 'UPDATE_FROM_FIREBASE': {
      const { userProfile, round } = action.payload || {};

      // Get rounds that exist in Redux but not in Firebase
      // These are rounds added while Firebase was loading
      const firebaseRounds = Array.isArray(round) ? round : [];
      const existingRounds = state.userData.round;

      // Merge: Start with Firebase rounds, then append any new rounds added during loading
      // Filter out rounds from existingRounds that were added AFTER Firebase data was loaded
      // We identify this by checking if the existing round count is less than Firebase count
      let mergedRounds;
      if (firebaseRounds.length === 0) {
        // No Firebase data, keep existing rounds
        mergedRounds = existingRounds;
      } else if (existingRounds.length > firebaseRounds.length) {
        // User added rounds while Firebase was loading
        // Keep Firebase rounds + append the new ones
        mergedRounds = [
          ...firebaseRounds,
          ...existingRounds.slice(firebaseRounds.length),
        ];
      } else {
        // Normal case: use Firebase data
        mergedRounds = firebaseRounds;
      }

      return {
        ...state,
        userData: {
          ...state.userData,
          userProfile: {
            ...state.userData.userProfile,
            ...(userProfile || {}),
          },
          round: mergedRounds,
        },
      };
    }

    // Update user profile
    case 'UPDATE_USER_PROFILE':
      return {
        ...state,
        userData: {
          ...state.userData,
          userProfile: {
            ...state.userData.userProfile,
            ...action.payload, // expect an object with profile fields
          },
        },
      };

    // Update rounds
    case 'UPDATE_ROUNDS':
      return {
        ...state,
        userData: {
          ...state.userData,
          round: [...state.userData.round, ...action.payload], // append new rounds
        },
      };

    // Add a round
    case 'ADD_ROUND':
      return {
        ...state,
        userData: {
          ...state.userData,
          round: [...state.userData.round, action.payload],
        },
      };

    // Add mistake to current round
    case 'ADD_MISTAKE_TO_ROUND':
      return {
        ...state,
        userData: {
          ...state.userData,
          round: state.userData.round.map((r, idx) =>
            idx === action.payload.roundIndex
              ? { ...r, mistake: [...r.mistake, action.payload.mistake] }
              : r
          ),
        },
      };

    // Update round timing
    case 'UPDATE_ROUND_TIMING':
      return {
        ...state,
        userData: {
          ...state.userData,
          round: state.userData.round.map((r, idx) =>
            idx === action.payload.roundIndex
              ? {
                  ...r,
                  timeSpent: { ...r.timeSpent, ...action.payload.timeSpent },
                }
              : r
          ),
        },
      };

    // Logout - reset to initial state
    case 'LOGOUT':
      return initialState;

    case 'SET_DEBUG_MODE':
      return {
        ...state,
        appSettings: {
          ...state.appSettings,
          debugMode: action.payload,
        },
      };

    default:
      return state;
  }
}

const store = createStore(reducer);

export default store;

export const updateFromFirebase = (data: any) => ({
  type: 'UPDATE_FROM_FIREBASE',
  payload: data,
});

export const updateUserProfile = (profileData: any) => ({
  type: 'UPDATE_USER_PROFILE',
  payload: profileData,
});

export const updateRounds = (rounds: any[]) => ({
  type: 'UPDATE_ROUNDS',
  payload: rounds,
});

export const addRound = (round: any) => ({
  type: 'ADD_ROUND',
  payload: round,
});

export const addMistakeToRound = (roundIndex: number, mistake: any) => ({
  type: 'ADD_MISTAKE_TO_ROUND',
  payload: { roundIndex, mistake },
});

export const updateRoundTiming = (roundIndex: number, timeSpent: any) => ({
  type: 'UPDATE_ROUND_TIMING',
  payload: { roundIndex, timeSpent },
});

export const logout = () => ({
  type: 'LOGOUT',
});

export const setDebugMode = (enabled: boolean) => ({
  type: 'SET_DEBUG_MODE',
  payload: enabled,
});
