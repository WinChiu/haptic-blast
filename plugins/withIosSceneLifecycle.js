// Makes the Expo SDK 57 iOS project work on iOS 27.
//
// iOS 27 refuses to launch an app built with its SDK unless the app uses the
// scene-based life cycle ("UIScene lifecycle is required for apps built with
// this SDK"). The SDK 57 iOS template still creates its window in the app
// delegate. Expo SDK 58's template uses the scene delegate that is already in
// the installed `expo` package (ExpoAppSceneDelegate), so this plugin makes the
// SDK 57 project do the same:
//   1. Info.plist gets a UIApplicationSceneManifest pointing at SceneDelegate.
//   2. AppDelegate.swift conforms to ExpoReactNativeFactoryProvider, no longer
//      creates the window or starts React Native, and declares SceneDelegate.
// Both changes are idempotent. Remove this plugin after upgrading to SDK 58,
// whose template already contains them.
const { withInfoPlist, withAppDelegate } = require('expo/config-plugins');

const SCENE_DELEGATE_CLASS = `
@objc(SceneDelegate)
class SceneDelegate: ExpoAppSceneDelegate {
  // The window is created and React Native is started here, as iOS 27 requires.
}
`;

// Rewrites the SDK 57 AppDelegate.swift. Returns the source unchanged if it was
// already patched; throws if it does not look like the expected template.
function patchAppDelegate(source) {
  if (source.includes('ExpoReactNativeFactoryProvider')) return source;

  const classLine = 'class AppDelegate: ExpoAppDelegate {';
  if (!source.includes(classLine)) {
    throw new Error(
      'withIosSceneLifecycle: AppDelegate.swift does not match the expected SDK 57 template (class declaration not found).'
    );
  }

  const startBlock =
    /#if os\(iOS\) \|\| os\(tvOS\)\s*\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\s*\n\s*factory\.startReactNative\(\s*\n\s*withModuleName: "main",\s*\n\s*in: window,\s*\n\s*launchOptions: launchOptions\)\s*\n#endif\s*\n/;
  if (!startBlock.test(source)) {
    throw new Error(
      'withIosSceneLifecycle: could not find the window/startReactNative block in AppDelegate.swift.'
    );
  }

  let patched = source.replace(
    classLine,
    'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {'
  );
  patched = patched.replace(
    startBlock,
    '    // The window is created and React Native is started by `SceneDelegate` under the\n' +
      '    // scene-based life cycle (required by the iOS 27 SDK).\n'
  );
  if (!patched.includes('class SceneDelegate')) {
    patched = patched.trimEnd() + '\n' + SCENE_DELEGATE_CLASS;
  }
  return patched;
}

// Adds the scene manifest to an Info.plist object (idempotent)
function patchInfoPlist(plist) {
  if (plist.UIApplicationSceneManifest) return plist;
  plist.UIApplicationSceneManifest = {
    UIApplicationSupportsMultipleScenes: false,
    UISceneConfigurations: {
      UIWindowSceneSessionRoleApplication: [
        {
          UISceneConfigurationName: 'Default Configuration',
          UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate',
        },
      ],
    },
  };
  return plist;
}

function withIosSceneLifecycle(config) {
  config = withInfoPlist(config, (c) => {
    c.modResults = patchInfoPlist(c.modResults);
    return c;
  });
  config = withAppDelegate(config, (c) => {
    if (c.modResults.language !== 'swift') {
      throw new Error('withIosSceneLifecycle: expected a Swift AppDelegate.');
    }
    c.modResults.contents = patchAppDelegate(c.modResults.contents);
    return c;
  });
  return config;
}

module.exports = withIosSceneLifecycle;
module.exports.patchAppDelegate = patchAppDelegate;
module.exports.patchInfoPlist = patchInfoPlist;
