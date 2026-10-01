package expo.modules.fusedorientation

import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
import com.google.android.gms.location.DeviceOrientationListener
import com.google.android.gms.location.DeviceOrientationRequest
import com.google.android.gms.location.FusedOrientationProviderClient
import com.google.android.gms.location.LocationServices
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

// Streams Google Play services' Fused Orientation Provider (the orientation
// Google Maps uses) to JS. Emits the attitude quaternion so JS can pick the
// heading axis itself (top edge when flat, back camera when upright).
class FusedOrientationModule : Module() {
  private var client: FusedOrientationProviderClient? = null
  private var listener: DeviceOrientationListener? = null
  private var executor: ExecutorService? = null

  override fun definition() = ModuleDefinition {
    Name("FusedOrientation")

    Events("onOrientation")

    Function("isAvailable") {
      val context = appContext.reactContext ?: return@Function false
      GoogleApiAvailability.getInstance()
        .isGooglePlayServicesAvailable(context) == ConnectionResult.SUCCESS
    }

    OnStartObserving {
      start()
    }

    OnStopObserving {
      stop()
    }

    OnActivityEntersForeground {
      if (listener != null) {
        stop()
        start()
      }
    }

    OnActivityEntersBackground {
      // Keep the listener object so foregrounding restarts it
      listener?.let { client?.removeOrientationUpdates(it) }
    }

    OnDestroy {
      stop()
      executor?.shutdown()
      executor = null
    }
  }

  private fun start() {
    if (listener != null) return
    val context = appContext.reactContext ?: return

    val orientationClient =
      client ?: LocationServices.getFusedOrientationProviderClient(context).also { client = it }
    val callbackExecutor =
      executor ?: Executors.newSingleThreadExecutor().also { executor = it }

    val orientationListener = DeviceOrientationListener { orientation ->
      // [qx, qy, qz, qw], device frame -> east-north-up world frame
      val attitude = orientation.attitude
      sendEvent(
        "onOrientation",
        mapOf(
          "qx" to attitude[0].toDouble(),
          "qy" to attitude[1].toDouble(),
          "qz" to attitude[2].toDouble(),
          "qw" to attitude[3].toDouble(),
          "headingDegrees" to orientation.headingDegrees.toDouble(),
          "headingErrorDegrees" to orientation.headingErrorDegrees.toDouble()
        )
      )
    }

    val request =
      DeviceOrientationRequest.Builder(DeviceOrientationRequest.OUTPUT_PERIOD_DEFAULT).build()
    orientationClient.requestOrientationUpdates(request, callbackExecutor, orientationListener)
    listener = orientationListener
  }

  private fun stop() {
    listener?.let { client?.removeOrientationUpdates(it) }
    listener = null
  }
}
