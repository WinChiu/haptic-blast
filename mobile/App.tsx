import { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Provider, useSelector } from 'react-redux';
import AsyncStorage from '@react-native-async-storage/async-storage';

import HomeScreen from './screens/HomeScreen';
import TutorialScreen from './screens/SettingScreen';
import { connectToReduxPersistence } from './util/firebaseSync';
import store, { updateFromFirebase } from './util/store';
import { FeedbackProvider } from './hooks/FeedbackContext';

const Stack = createNativeStackNavigator();

function AppNavigator() {
  const [isReady, setIsReady] = useState(false);
  const currentUid = useSelector((state: any) => state.userData.userProfile.Uid);

  // Initial load
  useEffect(() => {
    setIsReady(true);
  }, []);

  // Connect to Firebase when Uid changes
  useEffect(() => {
    if (!currentUid) return;

    (async () => {
      // Save to AsyncStorage for persistence
      await AsyncStorage.setItem('profileId', currentUid);

      // Connect to Firebase Firestore and sync with Redux
      const unsubscribe = await connectToReduxPersistence(
        store,
        updateFromFirebase,
        currentUid,
      );



      // Cleanup function
      return () => {
        if (unsubscribe) unsubscribe();
      };
    })();
  }, [currentUid]);

  if (!isReady) {
    return null; // Or a loading screen
  }

  return (
    <SafeAreaProvider>
      <FeedbackProvider>
        <NavigationContainer>
          <StatusBar style="light" />
          <Stack.Navigator
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: '#000' },
            }}
          >
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen name="Tutorial" component={TutorialScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </FeedbackProvider>
    </SafeAreaProvider>
  );
}

export default function App() {
  return (
    <Provider store={store}>
      <AppNavigator />
    </Provider>
  );
}
