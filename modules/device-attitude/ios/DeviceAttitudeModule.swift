import CoreMotion
import ExpoModulesCore

// Streams Core Motion's fused device attitude to JS, referenced to true north
// when iOS can provide it (magnetic north otherwise). Emits the same quaternion
// convention as the Android FusedOrientation module (device frame ->
// east-north-up, scalar last), so JS shares the axis maths for both platforms.
public final class DeviceAttitudeModule: Module {
  private lazy var motionManager = CMMotionManager()
  private lazy var operationQueue = OperationQueue()

  public func definition() -> ModuleDefinition {
    Name("DeviceAttitude")

    Events("onAttitude")

    Function("isAvailable") { () -> Bool in
      return self.motionManager.isDeviceMotionAvailable
        && CMMotionManager.availableAttitudeReferenceFrames().contains(.xMagneticNorthZVertical)
    }

    OnStartObserving {
      self.start(trueNorth: CMMotionManager.availableAttitudeReferenceFrames().contains(.xTrueNorthZVertical))
    }

    OnStopObserving {
      self.motionManager.stopDeviceMotionUpdates()
    }

    OnDestroy {
      self.motionManager.stopDeviceMotionUpdates()
    }
  }

  private func start(trueNorth: Bool) {
    if motionManager.isDeviceMotionActive {
      return
    }
    motionManager.deviceMotionUpdateInterval = 1.0 / 50.0
    let frame: CMAttitudeReferenceFrame = trueNorth ? .xTrueNorthZVertical : .xMagneticNorthZVertical

    motionManager.startDeviceMotionUpdates(using: frame, to: operationQueue) { [weak self] data, error in
      guard let self else {
        return
      }
      if error != nil && trueNorth {
        // True north needs a known location; fall back to magnetic north
        self.motionManager.stopDeviceMotionUpdates()
        self.start(trueNorth: false)
        return
      }
      guard let data else {
        return
      }
      var q = data.attitude.quaternion
      if self.isInverted(q, gravity: data.gravity) {
        q = CMQuaternion(x: -q.x, y: -q.y, z: -q.z, w: q.w)
      }
      // Core Motion's reference frame is x = north, y = west, z = up. Rotating
      // it +90° about z gives east-north-up (east = -y, north = x):
      // q_enu = (0, 0, sin 45°, cos 45°) * q
      let s = 0.5.squareRoot()
      self.sendEvent("onAttitude", [
        "qx": s * (q.x - q.y),
        "qy": s * (q.y + q.x),
        "qz": s * (q.z + q.w),
        "qw": s * (q.w - q.z),
        "trueNorth": trueNorth
      ])
    }
  }

  // The quaternion is expected to rotate device coordinates into the reference
  // frame. Gravity (device coordinates, pointing down) tells whether it is the
  // inverse instead: the two readings predict different gravity once the phone
  // is tilted. Flat, both agree, so the last decision is kept.
  private var invertedQuaternion = false

  private func isInverted(_ q: CMQuaternion, gravity g: CMAcceleration) -> Bool {
    // Device-frame gravity if q is device -> reference ...
    let ax = -2 * (q.x * q.z - q.y * q.w)
    let ay = -2 * (q.y * q.z + q.x * q.w)
    // ... and if q is reference -> device (z is the same for both)
    let bx = -2 * (q.x * q.z + q.y * q.w)
    let by = -2 * (q.y * q.z - q.x * q.w)
    let errorA = (ax - g.x) * (ax - g.x) + (ay - g.y) * (ay - g.y)
    let errorB = (bx - g.x) * (bx - g.x) + (by - g.y) * (by - g.y)
    if abs(errorA - errorB) > 0.1 {
      invertedQuaternion = errorB < errorA
    }
    return invertedQuaternion
  }
}
