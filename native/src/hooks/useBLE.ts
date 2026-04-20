import { useEffect, useRef, useCallback } from 'react';
import { BleManager, Device, State } from 'react-native-ble-plx';
import { Buffer } from 'buffer';
import { FOOT_POD_NAME, FOOT_POD_SERVICE, FOOT_POD_CHAR, HR_SERVICE, HR_MEASUREMENT_CHAR } from '../constants/ble';
import { useRunStore } from '../store/runStore';

const manager = new BleManager();

export function useBLE() {
  const fpDevice   = useRef<Device | null>(null);
  const hrDevice   = useRef<Device | null>(null);
  const scanning   = useRef(false);

  const updateFootPod  = useRunStore(s => s.updateFootPod);
  const updateHR       = useRunStore(s => s.updateHR);
  const setFpConnected = useRunStore(s => s.setFpConnected);
  const setHrConnected = useRunStore(s => s.setHrConnected);

  const connectFootPod = useCallback(async (device: Device) => {
    try {
      const connected = await device.connect();
      await connected.discoverAllServicesAndCharacteristics();
      fpDevice.current = connected;
      setFpConnected(true);

      connected.monitorCharacteristicForService(
        FOOT_POD_SERVICE,
        FOOT_POD_CHAR,
        (err, char) => {
          if (err || !char?.value) return;
          const csv = Buffer.from(char.value, 'base64').toString('utf8');
          const [cadStr, impStr, gctStr, stepsStr] = csv.split(',');
          const cad   = parseFloat(cadStr)   || 0;
          const imp   = parseFloat(impStr)   || 0;
          const gct   = parseFloat(gctStr)   || 0;
          const steps = parseInt(stepsStr, 10) || 0;
          updateFootPod(cad, imp, gct, steps);
        },
      );

      connected.onDisconnected(() => {
        fpDevice.current = null;
        setFpConnected(false);
        startScan(); // auto-reconnect
      });
    } catch {
      setFpConnected(false);
    }
  }, [updateFootPod, setFpConnected]);

  const connectHR = useCallback(async (device: Device) => {
    try {
      const connected = await device.connect();
      await connected.discoverAllServicesAndCharacteristics();
      hrDevice.current = connected;
      setHrConnected(true);

      connected.monitorCharacteristicForService(
        HR_SERVICE,
        HR_MEASUREMENT_CHAR,
        (err, char) => {
          if (err || !char?.value) return;
          const bytes = Buffer.from(char.value, 'base64');
          // Byte 0: flags. Bit 0 = 0 → HR is uint8 at byte 1
          const hr = (bytes[0] & 0x01) ? (bytes[2] << 8 | bytes[1]) : bytes[1];
          if (hr > 30 && hr < 230) updateHR(hr);
        },
      );

      connected.onDisconnected(() => {
        hrDevice.current = null;
        setHrConnected(false);
        startScan();
      });
    } catch {
      setHrConnected(false);
    }
  }, [updateHR, setHrConnected]);

  const startScan = useCallback(() => {
    if (scanning.current) return;
    scanning.current = true;

    manager.startDeviceScan(null, { allowDuplicates: false }, (err, device) => {
      if (err || !device) return;

      const name = device.name ?? '';
      if (name === FOOT_POD_NAME && !fpDevice.current) {
        connectFootPod(device);
      }
      // Garmin HR: no fixed name, identify by service UUID
      if (!hrDevice.current) {
        const uuids = device.serviceUUIDs ?? [];
        if (uuids.some(u => u.toLowerCase().includes('180d'))) {
          connectHR(device);
        }
      }

      // Stop scan once both found
      if (fpDevice.current && hrDevice.current) {
        manager.stopDeviceScan();
        scanning.current = false;
      }
    });

    // Restart scan every 30s if still looking
    setTimeout(() => {
      if (scanning.current) {
        manager.stopDeviceScan();
        scanning.current = false;
        startScan();
      }
    }, 30000);
  }, [connectFootPod, connectHR]);

  useEffect(() => {
    const sub = manager.onStateChange((state) => {
      if (state === State.PoweredOn) {
        startScan();
        sub.remove();
      }
    }, true);

    return () => {
      manager.stopDeviceScan();
      scanning.current = false;
    };
  }, [startScan]);

  return { startScan };
}
