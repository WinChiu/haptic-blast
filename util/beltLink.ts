// The Bluetooth link to the belt (an Arduino advertising as "HapticBelt").
// The phone writes three bytes (left, front, right motor, 0 to 255) to one
// characteristic. The belt switches all motors off if it hears nothing for a
// short while, so frames are sent steadily and a zero frame is sent on stop.
import { useSyncExternalStore } from 'react';
import { BeltFrame, ZERO_FRAME } from './beltPattern';

export const BELT_NAME = 'HapticBelt';
export const BELT_SERVICE = '19B10000-E8F2-537E-4F6C-D104768A1214';
export const BELT_CHARACTERISTIC = '19B10001-E8F2-537E-4F6C-D104768A1214';
const SCAN_TIMEOUT_MS = 15000;
const RESEND_SAME_MS = 250; // an unchanged frame is repeated this often, as a heartbeat

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

// Bytes to base64 (the Bluetooth library takes base64). Pure, so it is tested.
export function bytesToBase64(bytes: number[]): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i] & 255;
    const b1 = i + 1 < bytes.length ? bytes[i + 1] & 255 : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] & 255 : 0;
    out += B64[b0 >> 2];
    out += B64[((b0 & 3) << 4) | (b1 >> 4)];
    out += i + 1 < bytes.length ? B64[((b1 & 15) << 2) | (b2 >> 6)] : '=';
    out += i + 2 < bytes.length ? B64[b2 & 63] : '=';
  }
  return out;
}

export type LinkStatus =
  | 'unavailable' // this build has no Bluetooth module
  | 'disconnected'
  | 'scanning'
  | 'connecting'
  | 'connected';
export type LinkState = { status: LinkStatus; error: string | null };

let state: LinkState = { status: 'disconnected', error: null };
const listeners = new Set<() => void>();
function setState(next: LinkState) {
  state = next;
  listeners.forEach((l) => l());
}
export const getLinkState = () => state;

// The Bluetooth module is native code: a build without it must still run
let manager: any = null;
let managerTried = false;
let device: any = null;
let disconnectSub: { remove: () => void } | null = null;
let scanTimer: ReturnType<typeof setTimeout> | null = null;

function getManager(): any {
  if (managerTried) return manager;
  managerTried = true;
  try {
    const { BleManager } = require('react-native-ble-plx');
    manager = new BleManager();
  } catch {
    manager = null;
    setState({ status: 'unavailable', error: 'This build has no Bluetooth module' });
  }
  return manager;
}

export async function connectBelt(): Promise<void> {
  const m = getManager();
  if (!m) return;
  if (state.status === 'scanning' || state.status === 'connecting' || state.status === 'connected') return;
  setState({ status: 'scanning', error: null });

  const finish = (error: string | null) => {
    if (scanTimer) clearTimeout(scanTimer);
    scanTimer = null;
    m.stopDeviceScan();
    if (error) setState({ status: 'disconnected', error });
  };
  scanTimer = setTimeout(() => finish(`"${BELT_NAME}" was not found. Is the belt powered?`), SCAN_TIMEOUT_MS);

  try {
    await m.startDeviceScan([BELT_SERVICE], null, async (error: any, found: any) => {
      if (error) return finish(error.message ?? 'Bluetooth error');
      if (!found || state.status !== 'scanning') return;
      if (found.name !== BELT_NAME && found.localName !== BELT_NAME) return;
      finish(null);
      setState({ status: 'connecting', error: null });
      try {
        const d = await m.connectToDevice(found.id);
        await d.discoverAllServicesAndCharacteristics();
        device = d;
        disconnectSub?.remove();
        disconnectSub = m.onDeviceDisconnected(d.id, () => {
          device = null;
          setState({ status: 'disconnected', error: 'The belt disconnected' });
        });
        setState({ status: 'connected', error: null });
      } catch (e: any) {
        device = null;
        setState({ status: 'disconnected', error: e?.message ?? 'Could not connect' });
      }
    });
  } catch (e: any) {
    finish(e?.message ?? 'Bluetooth error');
  }
}

export async function disconnectBelt(): Promise<void> {
  const m = getManager();
  if (scanTimer) clearTimeout(scanTimer);
  scanTimer = null;
  try {
    m?.stopDeviceScan();
    if (device) {
      sendBeltFrame(ZERO_FRAME, true);
      await m.cancelDeviceConnection(device.id);
    }
  } catch {
    /* already gone */
  }
  device = null;
  if (state.status !== 'unavailable') setState({ status: 'disconnected', error: null });
}

let lastKey = '';
let lastSentAt = 0;
let writing = false;

// Send one frame. Repeats of the same frame are sent as a heartbeat only.
export function sendBeltFrame(frame: BeltFrame, force = false): void {
  if (state.status !== 'connected' || !device) return;
  const now = Date.now();
  const key = frame.join(',');
  if (!force && key === lastKey && now - lastSentAt < RESEND_SAME_MS) return;
  if (writing && !force) return;
  writing = true;
  lastKey = key;
  lastSentAt = now;
  device
    .writeCharacteristicWithoutResponseForService(BELT_SERVICE, BELT_CHARACTERISTIC, bytesToBase64(frame))
    .catch(() => {})
    .finally(() => {
      writing = false;
    });
}

// Buzz one motor for a moment, to check the wiring from the Settings screen
export function testMotor(which: 'left' | 'front' | 'right'): void {
  const frame: BeltFrame = which === 'left' ? [255, 0, 0] : which === 'front' ? [0, 255, 0] : [0, 0, 255];
  sendBeltFrame(frame, true);
  setTimeout(() => sendBeltFrame(ZERO_FRAME, true), 800);
}

export function useBeltLink(): LinkState {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    getLinkState,
    getLinkState
  );
}
