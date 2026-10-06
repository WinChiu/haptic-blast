/// <reference types="node" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join } from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { patchAppDelegate, patchInfoPlist } = require('../plugins/withIosSceneLifecycle');

// The AppDelegate.swift that Expo SDK 57 generates (saved from a real project)
const sdk57 = readFileSync(join(__dirname, 'fixtures', 'AppDelegate-sdk57.swift'), 'utf8');

test('AppDelegate: no longer creates the window or starts React Native', () => {
  const out: string = patchAppDelegate(sdk57);
  assert.ok(!out.includes('UIWindow(frame: UIScreen.main.bounds)'));
  assert.ok(!out.includes('startReactNative'));
});

test('AppDelegate: conforms to ExpoReactNativeFactoryProvider and keeps its other code', () => {
  const out: string = patchAppDelegate(sdk57);
  assert.ok(out.includes('class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {'));
  assert.ok(out.includes('var window: UIWindow?'));
  assert.ok(out.includes('reactNativeFactory = factory'));
  assert.ok(out.includes('class ReactNativeDelegate: ExpoReactNativeFactoryDelegate'));
  assert.ok(out.includes('return super.application(application, didFinishLaunchingWithOptions: launchOptions)'));
});

test('AppDelegate: declares the scene delegate once', () => {
  const out: string = patchAppDelegate(sdk57);
  assert.equal((out.match(/class SceneDelegate: ExpoAppSceneDelegate/g) ?? []).length, 1);
  assert.ok(out.includes('@objc(SceneDelegate)'));
});

test('AppDelegate: patching twice changes nothing more', () => {
  const once: string = patchAppDelegate(sdk57);
  assert.equal(patchAppDelegate(once), once);
});

test('AppDelegate: an unexpected file is refused with a clear error', () => {
  assert.throws(() => patchAppDelegate('class Something {}'), /does not match the expected SDK 57 template/);
  assert.throws(
    () => patchAppDelegate('class AppDelegate: ExpoAppDelegate {\n}\n'),
    /could not find the window\/startReactNative block/
  );
});

test('Info.plist: adds the scene manifest pointing at SceneDelegate, once', () => {
  const plist = patchInfoPlist({ CFBundleName: 'x' });
  const role = plist.UIApplicationSceneManifest.UISceneConfigurations.UIWindowSceneSessionRoleApplication[0];
  assert.equal(role.UISceneDelegateClassName, '$(PRODUCT_MODULE_NAME).SceneDelegate');
  assert.equal(plist.UIApplicationSceneManifest.UIApplicationSupportsMultipleScenes, false);
  assert.equal(plist.CFBundleName, 'x');
  const again = patchInfoPlist(plist);
  assert.equal(again, plist); // untouched when already present
});
