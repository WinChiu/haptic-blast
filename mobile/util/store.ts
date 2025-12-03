import { createStore } from 'redux';

const initialState = {
  ready: true,
  userData: {
    userProfile: {
      Uid: '',
    },
    mistakes: [] as any[]
  },
};

function reducer(state = initialState, action: any) {
  switch (action.type) {
    // Merge everything coming from Firebase into userData
    case 'UPDATE_FROM_FIREBASE': {
      const { userProfile, mistakes } = action.payload || {};

      return {
        ...state,
        userData: {
          ...state.userData,
          userProfile: {
            ...state.userData.userProfile,
            ...(userProfile || {}),
          },
          // if mistakes is provided, replace; otherwise keep old
          mistakes: Array.isArray(mistakes) ? mistakes : state.userData.mistakes,
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

    // Update mistakes only
    case 'UPDATE_MISTAKES':
      return {
        ...state,
        userData: {
          ...state.userData,
          mistakes: action.payload, // expect an array
        },
      };

    // Add a mistake
    case 'ADD_MISTAKE':
      return {
        ...state,
        userData: {
          ...state.userData,
          mistakes: [...state.userData.mistakes, action.payload],
        },
      };

    // Logout - reset to initial state
    case 'LOGOUT':
      return initialState;

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

export const updateMistakes = (mistakes: any[]) => ({
  type: 'UPDATE_MISTAKES',
  payload: mistakes,
});

export const addMistake = (mistake: any) => ({
  type: 'ADD_MISTAKE',
  payload: mistake,
});

export const logout = () => ({
  type: 'LOGOUT',
});
