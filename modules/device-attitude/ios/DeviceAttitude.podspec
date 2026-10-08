Pod::Spec.new do |s|
  s.name           = 'DeviceAttitude'
  s.version        = '0.1.0'
  s.summary        = 'Core Motion device attitude for iOS'
  s.description    = 'Core Motion device attitude for iOS, referenced to north'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '16.4'
  }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES'
  }

  s.source_files = "**/*.{h,m,swift}"
end
