import { Device, State } from 'react-native-ble-plx';
import { Buffer } from 'buffer';
import {
  FOOT_POD_NAME, FOOT_POD_SERVICE, FOOT_POD_CHAR,
  HR_SERVICE, HR_MEASUREMENT_CHAR,
} from '../constants/ble';
import { useRunStore } from '../store/runStore';
import { loadSettings } from './storage';
import { bleManager } from './bleManager';

const SCAN_MS        = 20_000;   // max scan duration per cycle
const SCAN_GAP_MS    =  5_000;   // pause between scan cycles
const CONNECT_TIMEOUT = 10_000;  // max time to establish GATT connection
const FP_STALE_MS    =  6_000;   // foot pod sends at 1 Hz — >6 s with no packet = silent failure
const RETRY_MS       = [2_000, 5_000, 15_000, 30_000];

function log(line: string) {
  useRunStore.getState().appendLog(`[BLE] ${line}`);
}

class BLEService {
  private fp: Device | null = null;
  private hr: Device | null = null;
  private fpConnecting = false;
  private hrConnecting = false;
  private scanning     = false;
  private paused       = false;
  private savedFpId    = '';
  private savedHrId    = '';
  private fpRetry      = 0;
  private hrRetry      = 0;
  private scanTimer:    ReturnType<typeof setTimeout>   | null = null;
  private fpWatchdog:   ReturnType<typeof setInterval>  | null = null;
  private ready        = false;

  // ── Boot ──────────────────────────────────────────────────────────────────

  async init() {
    if (this.ready) return;
    this.ready = true;

    const s = await loadSettings();
    this.savedFpId = s.fpDeviceId;
    this.savedHrId = s.hrDeviceId;

    // Persistent listener — restarts if BT is toggled off then on mid-session
    bleManager.onStateChange(state => {
      if (state === State.PoweredOn) {
        this.fpRetry = 0;
        this.hrRetry = 0;
        this.startScan();
      }
    }, true);
  }

  // ── Settings handshake ────────────────────────────────────────────────────
  // Pause disconnects both devices so they resume advertising and appear in
  // the Settings scan list.  Resume reloads saved IDs and restarts auto-connect.

  pauseForSettings() {
    this.paused = true;
    this.stopScan('settings opened');
    this.clearFPWatchdog();
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
      const d = await device.connect({ timeout: CONNECT_TIMEOUT });
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
      const d = await device.connect({ timeout: CONNECT_TIMEOUT });
      await d.discoverAllServicesAndCharacteristics();
      this.onHRConnected(d);
    } catch (e: any) {
      log(`HR connect failed: ${e?.message ?? e}`);
      this.hrConnecting = false;
      this.scheduleHRRetry();
    }
  }

  // ── Direct reconnect by saved device ID (no scan needed) ─────────────────

  private async reconnectFP() {
    if (this.fpConnecting || this.fp || this.paused) return;
    this.fpConnecting = true;
    log(`FP reconnecting directly …${this.savedFpId.slice(-6)}`);
    try {
      const d = await bleManager.connectToDevice(this.savedFpId, { timeout: CONNECT_TIMEOUT });
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
      const d = await bleManager.connectToDevice(this.savedHrId, { timeout: CONNECT_TIMEOUT });
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

    // Data watchdog — foot pod sends at 1 Hz.  If >6 s pass with no packet
    // while the GATT link appears up, the subscription has silently died;
    // force a disconnect so the normal retry cycle re-establishes it.
    this.startFPWatchdog(device);

    device.monitorCharacteristicForService(FOOT_POD_SERVICE, FOOT_POD_CHAR, (err, char) => {
      if (err) {
        // Monitor errors that aren't caused by a normal disconnect (which
        // already fires onDisconnected) need an explicit recovery kick.
        log(`FP monitor error: ${err.message}`);
        device.cancelConnection().catch(() => {});
        return;
      }
      if (!char?.value) return;
      const csv = Buffer.from(char.value, 'base64').toString('utf8');
      const [cad, imp, gct, steps] = csv.split(',');
      useRunStore.getState().updateFootPod(
        parseFloat(cad)     || 0,
        parseFloat(imp)     || 0,
        parseFloat(gct)     || 0,
        parseInt(steps, 10) || 0,
      );
    });

    device.onDisconnected(() => {
      this.clearFPWatchdog();
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
      if (err) {
        log(`HR monitor error: ${err.message}`);
        device.cancelConnection().catch(() => {});
        return;
      }
      if (!char?.value) return;
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

  // ── Foot pod data watchdog ────────────────────────────────────────────────
  // The ESP32 sends a BLE notification every ~1 s.  If lastFpPacketTs goes
  // stale while fpConnected=true, the GATT subscription has silently died.
  // Force a cancelConnection so onDisconnected fires and the retry cycle runs.

  private startFPWatchdog(device: Device) {
    this.clearFPWatchdog();
    this.fpWatchdog = setInterval(() => {
      if (this.fp !== device) { this.clearFPWatchdog(); return; }
      const { lastFpPacketTs, fpConnected } = useRunStore.getState();
      if (!fpConnected || lastFpPacketTs === 0) return;  // not yet streaming
      const age = Date.now() - lastFpPacketTs;
      if (age > FP_STALE_MS) {
        log(`FP data stale ${(age / 1000).toFixed(0)}s — forcing reconnect`);
        this.clearFPWatchdog();
        device.cancelConnection().catch(() => {});
      }
    }, 3_000);
  }

  private clearFPWatchdog() {
    if (this.fpWatchdog) { clearInterval(this.fpWatchdog); this.fpWatchdog = null; }
  }

  // ── Retry scheduling (exponential backoff) ────────────────────────────────

  private scheduleFPRetry() {
    const delay = RETRY_MS[Math.min(this.fpRetry, RETRY_MS.length - 1)];
    this.fpRetry++;
    log(`FP retry in ${delay / 1000}s (attempt ${this.fpRetry})`);
    setTimeout(() => {
      if (this.paused || this.fp || this.fpConnecting) return;
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
