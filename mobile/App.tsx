import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import HomeScreen from './screens/HomeScreen';
import TutorialScreen from './screens/TutorialScreen';
import { FeedbackProvider } from './hooks/FeedbackContext';

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <FeedbackProvider>
      <SafeAreaProvider>
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
      </SafeAreaProvider>
    </FeedbackProvider>
  );
}
