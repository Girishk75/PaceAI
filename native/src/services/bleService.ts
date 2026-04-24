import { Device, State } from 'react-native-ble-plx';
import { Buffer } from 'buffer';
import {
  FOOT_POD_NAME, FOOT_POD_SERVICE, FOOT_POD_CHAR,
  HR_SERVICE, HR_MEASUREMENT_CHAR,
} from '../constants/ble';
import { useRunStore } from '../store/runStore';
import { loadSettings } from './storage';
import { bleManager } from './bleManager';

const SCAN_MS     = 20_000;
const RETRY_MS    = [2_000, 5_000, 15_000, 30_000];
const SCAN_GAP_MS = 5_000;   // pause between scan cycles

function log(line: string) {
  useRunStore.getState().appendLog(`[BLE] ${line}`);
}

class BLEService {
  private fp: Device | null = null;
  private hr: Device | null = null;
  private fpConnecting = false;
  private hrConnecting = false;
  private scanning     = false;
  private paused       = false;   // true while Settings screen is open
  private savedFpId    = '';
  private savedHrId    = '';
  private fpRetry      = 0;
  private hrRetry      = 0;
  private scanTimer: ReturnType<typeof setTimeout> | null = null;
  private ready        = false;

  // ── Boot ──────────────────────────────────────────────────────────────────

  async init() {
    if (this.ready) return;
    this.ready = true;

    const s = await loadSettings();
    this.savedFpId = s.fpDeviceId;
    this.savedHrId = s.hrDeviceId;

    // Persistent listener — also handles BT toggled off then back on mid-session
    bleManager.onStateChange(state => {
      if (state === State.PoweredOn) {
        this.fpRetry = 0;
        this.hrRetry = 0;
        this.startScan();
      }
    }, true);
  }

  // ── Settings handshake ────────────────────────────────────────────────────
  // Call pauseForSettings() when SettingsScreen mounts and
  // resumeAfterSettings() when it unmounts.  Pausing disconnects both devices
  // so they resume advertising and appear in the Settings BLE scan list.

  pauseForSettings() {
    this.paused = true;
    this.stopScan('settings opened');
    this.fp?.cancelConnection().catch(() => {});
    this.hr?.cancelConnection().catch(() => {});
    this.fp = null;
    this.hr = null;
    this.fpConnecting = false;
    this.hrConnecting = false;
    useRunStore.getState().setFpConnected(false);
    useRunStore.getState().setHrConnected(false);
    log('auto-connect paused — settings active');
  }

  resumeAfterSettings() {
    loadSettings().then(s => {
      this.savedFpId = s.fpDeviceId;
      this.savedHrId = s.hrDeviceId;
      this.fpRetry   = 0;
      this.hrRetry   = 0;
      this.paused    = false;
      log('auto-connect resumed after settings');
      this.startScan();
    });
  }

  // ── Scan cycle ────────────────────────────────────────────────────────────

  private startScan() {
    if (this.scanning || this.paused) return;
    if (this.fp && this.hr) return;

    this.scanning = true;
    const seen = new Set<string>();

    log(
      `scan started  fp="${this.savedFpId ? '…' + this.savedFpId.slice(-6) : 'by-name'}"` +
      `  hr="${this.savedHrId ? '…' + this.savedHrId.slice(-6) : 'not-set'}"`,
    );

    bleManager.startDeviceScan(null, { allowDuplicates: false }, (err, device) => {
      if (err) { log(`scan error: ${err.message}`); return; }
      if (!device?.name) return;

      if (!seen.has(device.id)) {
        seen.add(device.id);
        if (seen.size <= 15) log(`seen: "${device.name}"  …${device.id.slice(-6)}`);
      }

      if (!this.fp && !this.fpConnecting) {
        const match = this.savedFpId
          ? device.id === this.savedFpId
          : device.name === FOOT_POD_NAME;
        if (match) { this.fpConnecting = true; this.connectFP(device); }
      }

      if (!this.hr && !this.hrConnecting && this.savedHrId && device.id === this.savedHrId) {
        this.hrConnecting = true;
        this.connectHR(device);
      }

      if ((this.fp || this.fpConnecting) && (this.hr || this.hrConnecting)) {
        this.stopScan('both found');
      }
    });

    this.scanTimer = setTimeout(() => {
      if (!this.scanning) return;
      this.stopScan('timeout');
      if (!this.paused && !(this.fp && this.hr)) {
        setTimeout(() => { if (!this.paused) this.startScan(); }, SCAN_GAP_MS);
      }
    }, SCAN_MS);
  }

  private stopScan(reason: string) {
    bleManager.stopDeviceScan();
    this.scanning = false;
    if (this.scanTimer) { clearTimeout(this.scanTimer); this.scanTimer = null; }
    log(`scan stopped — ${reason}`);
  }

  // ── Connect via scan result ───────────────────────────────────────────────

  private async connectFP(device: Device) {
    log(`FP connecting — ${device.name ?? device.id}`);
    try {
      const d = await device.connect();
      await d.discoverAllServicesAndCharacteristics();
      this.onFPConnected(d);
    } catch (e: any) {
      log(`FP connect failed: ${e?.message ?? e}`);
      this.fpConnecting = false;
      this.scheduleFPRetry();
    }
  }

  private async connectHR(device: Device) {
    log(`HR connecting — ${device.name ?? device.id}`);
    try {
      const d = await device.connect();
      await d.discoverAllServicesAndCharacteristics();
      this.onHRConnected(d);
    } catch (e: any) {
      log(`HR connect failed: ${e?.message ?? e}`);
      this.hrConnecting = false;
      this.scheduleHRRetry();
    }
  }

  // ── Direct reconnect by saved device ID (no scan needed) ─────────────────
  // On Android, connectToDevice() by MAC address works without prior scanning.
  // This is the fast path used after a disconnect — avoids a full 20-second scan.

  private async reconnectFP() {
    if (this.fpConnecting || this.fp || this.paused) return;
    this.fpConnecting = true;
    log(`FP reconnecting directly …${this.savedFpId.slice(-6)}`);
    try {
      const d = await bleManager.connectToDevice(this.savedFpId, { timeout: 10_000 });
      await d.discoverAllServicesAndCharacteristics();
      this.onFPConnected(d);
    } catch (e: any) {
      log(`FP direct reconnect failed: ${e?.message ?? e}`);
      this.fpConnecting = false;
      this.scheduleFPRetry();
    }
  }

  private async reconnectHR() {
    if (this.hrConnecting || this.hr || this.paused) return;
    this.hrConnecting = true;
    log(`HR reconnecting directly …${this.savedHrId.slice(-6)}`);
    try {
      const d = await bleManager.connectToDevice(this.savedHrId, { timeout: 10_000 });
      await d.discoverAllServicesAndCharacteristics();
      this.onHRConnected(d);
    } catch (e: any) {
      log(`HR direct reconnect failed: ${e?.message ?? e}`);
      this.hrConnecting = false;
      this.scheduleHRRetry();
    }
  }

  // ── Connection established ────────────────────────────────────────────────

  private onFPConnected(device: Device) {
    this.fp           = device;
    this.fpConnecting = false;
    this.fpRetry      = 0;
    log(`FP connected ✓  ${device.name ?? device.id}`);
    useRunStore.getState().setFpConnected(true);

    device.monitorCharacteristicForService(FOOT_POD_SERVICE, FOOT_POD_CHAR, (err, char) => {
      if (err || !char?.value) return;
      const csv = Buffer.from(char.value, 'base64').toString('utf8');
      const [cad, imp, gct, steps] = csv.split(',');
      useRunStore.getState().updateFootPod(
        parseFloat(cad)   || 0,
        parseFloat(imp)   || 0,
        parseFloat(gct)   || 0,
        parseInt(steps, 10) || 0,
      );
    });

    device.onDisconnected(() => {
      this.fp = null;
      log('FP disconnected');
      useRunStore.getState().setFpConnected(false);
      if (!this.paused) this.scheduleFPRetry();
    });
  }

  private onHRConnected(device: Device) {
    this.hr           = device;
    this.hrConnecting = false;
    this.hrRetry      = 0;
    log(`HR connected ✓  ${device.name ?? device.id}`);
    useRunStore.getState().setHrConnected(true);

    device.monitorCharacteristicForService(HR_SERVICE, HR_MEASUREMENT_CHAR, (err, char) => {
      if (err || !char?.value) return;
      const bytes = Buffer.from(char.value, 'base64');
      const hr = (bytes[0] & 0x01) ? (bytes[2] << 8 | bytes[1]) : bytes[1];
      if (hr > 30 && hr < 230) useRunStore.getState().updateHR(hr);
    });

    device.onDisconnected(() => {
      this.hr = null;
      log('HR disconnected');
      useRunStore.getState().setHrConnected(false);
      if (!this.paused) this.scheduleHRRetry();
    });
  }

  // ── Retry scheduling (exponential backoff) ────────────────────────────────

  private scheduleFPRetry() {
    const delay = RETRY_MS[Math.min(this.fpRetry, RETRY_MS.length - 1)];
    this.fpRetry++;
    log(`FP retry in ${delay / 1000}s (attempt ${this.fpRetry})`);
    setTimeout(() => {
      if (this.paused || this.fp || this.fpConnecting) return;
      // Prefer direct reconnect (fast); fall back to scan if no saved ID
      if (this.savedFpId) this.reconnectFP();
      else this.startScan();
    }, delay);
  }

  private scheduleHRRetry() {
    const delay = RETRY_MS[Math.min(this.hrRetry, RETRY_MS.length - 1)];
    this.hrRetry++;
    log(`HR retry in ${delay / 1000}s (attempt ${this.hrRetry})`);
    setTimeout(() => {
      if (this.paused || this.hr || this.hrConnecting) return;
      if (this.savedHrId) this.reconnectHR();
      else this.startScan();
    }, delay);
  }
}

export const bleService = new BLEService();
