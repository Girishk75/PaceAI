import { useEffect, useRef, useCallback } from 'react';
import { Device, State } from 'react-native-ble-plx';
import { Buffer } from 'buffer';
import { FOOT_POD_NAME, FOOT_POD_SERVICE, FOOT_POD_CHAR, HR_SERVICE, HR_MEASUREMENT_CHAR } from '../constants/ble';
import { useRunStore } from '../store/runStore';
import { bleManager } from '../services/bleManager';
import { loadSettings } from '../services/storage';

function bleLog(appendLog: (l: string) => void, line: string) {
  appendLog(`[BLE] ${line}`);
}

export function useBLE() {
  const fpDevice      = useRef<Device | null>(null);
  const hrDevice      = useRef<Device | null>(null);
  const scanning      = useRef(false);
  const savedFpId     = useRef('');
  const savedHrId     = useRef('');
  const seenThisScan  = useRef(new Set<string>());  // dedup device-seen log per scan

  const updateFootPod  = useRunStore(s => s.updateFootPod);
  const updateHR       = useRunStore(s => s.updateHR);
  const setFpConnected = useRunStore(s => s.setFpConnected);
  const setHrConnected = useRunStore(s => s.setHrConnected);
  const appendLog      = useRunStore(s => s.appendLog);

  const connectFootPod = useCallback(async (device: Device) => {
    bleLog(appendLog, `FP connecting — ${device.name ?? device.id}`);
    try {
      const connected = await device.connect();
      await connected.discoverAllServicesAndCharacteristics();
      fpDevice.current = connected;
      setFpConnected(true);
      bleLog(appendLog, `FP connected — ${device.name ?? device.id}`);

      connected.monitorCharacteristicForService(
        FOOT_POD_SERVICE,
        FOOT_POD_CHAR,
        (err, char) => {
          if (err) { bleLog(appendLog, `FP monitor error: ${err.message}`); return; }
          if (!char?.value) return;
          const csv = Buffer.from(char.value, 'base64').toString('utf8');
          const [cadStr, impStr, gctStr, stepsStr] = csv.split(',');
          updateFootPod(
            parseFloat(cadStr)     || 0,
            parseFloat(impStr)     || 0,
            parseFloat(gctStr)     || 0,
            parseInt(stepsStr, 10) || 0,
          );
        },
      );

      connected.onDisconnected(() => {
        bleLog(appendLog, `FP disconnected — retrying in 1s`);
        fpDevice.current = null;
        setFpConnected(false);
        scanning.current = false;
        setTimeout(startScan, 1000);
      });
    } catch (e: any) {
      bleLog(appendLog, `FP connect failed: ${e?.message ?? e}`);
      setFpConnected(false);
    }
  }, [updateFootPod, setFpConnected, appendLog]);

  const connectHR = useCallback(async (device: Device) => {
    bleLog(appendLog, `HR connecting — ${device.name ?? device.id}`);
    try {
      const connected = await device.connect();
      await connected.discoverAllServicesAndCharacteristics();
      hrDevice.current = connected;
      setHrConnected(true);
      bleLog(appendLog, `HR connected — ${device.name ?? device.id}`);

      connected.monitorCharacteristicForService(
        HR_SERVICE,
        HR_MEASUREMENT_CHAR,
        (err, char) => {
          if (err) { bleLog(appendLog, `HR monitor error: ${err.message}`); return; }
          if (!char?.value) return;
          const bytes = Buffer.from(char.value, 'base64');
          const hr = (bytes[0] & 0x01) ? (bytes[2] << 8 | bytes[1]) : bytes[1];
          if (hr > 30 && hr < 230) updateHR(hr);
        },
      );

      connected.onDisconnected(() => {
        bleLog(appendLog, `HR disconnected — retrying in 1s`);
        hrDevice.current = null;
        setHrConnected(false);
        scanning.current = false;
        setTimeout(startScan, 1000);
      });
    } catch (e: any) {
      bleLog(appendLog, `HR connect failed: ${e?.message ?? e}`);
      setHrConnected(false);
    }
  }, [updateHR, setHrConnected, appendLog]);

  const startScan = useCallback(() => {
    if (scanning.current) return;
    scanning.current = true;
    seenThisScan.current.clear();
    bleLog(appendLog,
      `scan started  fp="${savedFpId.current ? '...' + savedFpId.current.slice(-6) : 'by-name'}"` +
      `  hr="${savedHrId.current ? '...' + savedHrId.current.slice(-6) : 'not-set'}"`);

    bleManager.startDeviceScan(null, { allowDuplicates: false }, (err, device) => {
      if (err) { bleLog(appendLog, `scan error: ${err.message}`); return; }
      if (!device) return;
      const id   = device.id;
      const name = device.name ?? '';

      // Log every unique named device seen this scan (first 15 to avoid log flood)
      if (name && !seenThisScan.current.has(id)) {
        seenThisScan.current.add(id);
        if (seenThisScan.current.size <= 15) {
          bleLog(appendLog, `seen: "${name}"  ...${id.slice(-6)}`);
        }
      }

      // Foot pod: match by saved ID, fall back to name
      if (!fpDevice.current) {
        const match = savedFpId.current ? id === savedFpId.current : name === FOOT_POD_NAME;
        if (match) connectFootPod(device);
      }

      // HR: match by saved ID only
      if (!hrDevice.current && savedHrId.current && id === savedHrId.current) {
        connectHR(device);
      }

      if (fpDevice.current && hrDevice.current) {
        bleLog(appendLog, `both devices found — scan stopped`);
        bleManager.stopDeviceScan();
        scanning.current = false;
      }
    });

    setTimeout(() => {
      if (scanning.current) {
        bleLog(appendLog, `scan timeout — ${seenThisScan.current.size} named device(s) seen, restarting`);
        bleManager.stopDeviceScan();
        scanning.current = false;
        startScan();
      }
    }, 30000);
  }, [connectFootPod, connectHR, appendLog]);

  // Load settings THEN register BLE state listener.
  // Fixes race condition where startScan() fired before loadSettings() resolved,
  // leaving savedHrId empty so the Garmin was never matched.
  useEffect(() => {
    let sub: { remove: () => void } | null = null;
    let mounted = true;

    loadSettings().then(s => {
      if (!mounted) return;
      savedFpId.current = s.fpDeviceId;
      savedHrId.current = s.hrDeviceId;

      // immediate=true fires synchronously if BT is already powered on
      sub = bleManager.onStateChange((state) => {
        if (state === State.PoweredOn) {
          startScan();
          sub?.remove();
          sub = null;
        }
      }, true);
    });

    return () => {
      mounted = false;
      sub?.remove();
      bleManager.stopDeviceScan();
      scanning.current = false;
    };
  }, [startScan]);

  return { startScan };
}
