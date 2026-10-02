package expo.modules.vibratorinfo

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Reports what the device's vibrator can do, to explain how haptics feel on
// it: without amplitude control or composition primitives, Pulsar can only
// simulate strength by pulsing on and off.
class VibratorInfoModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("VibratorInfo")

    Function("getCapabilities") {
      val context = appContext.reactContext ?: return@Function null
      val vibrator = getVibrator(context)
      val sdk = Build.VERSION.SDK_INT

      val (clickPrimitive, tickPrimitive) =
        if (sdk >= Build.VERSION_CODES.R) {
          val supported = vibrator.arePrimitivesSupported(
            VibrationEffect.Composition.PRIMITIVE_CLICK,
            VibrationEffect.Composition.PRIMITIVE_TICK
          )
          supported[0] to supported[1]
        } else {
          false to false
        }

      mapOf(
        "apiLevel" to sdk,
        "hasVibrator" to vibrator.hasVibrator(),
        "hasAmplitudeControl" to (sdk >= Build.VERSION_CODES.O && vibrator.hasAmplitudeControl()),
        "clickPrimitive" to clickPrimitive,
        "tickPrimitive" to tickPrimitive
      )
    }
  }

  private fun getVibrator(context: Context): Vibrator =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      (context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
    } else {
      @Suppress("DEPRECATION")
      context.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
    }
}
