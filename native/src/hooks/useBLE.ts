import { useEffect } from 'react';
import { bleService } from '../services/bleService';

// Thin hook — boots the singleton BLE service once for the app lifetime.
// All connection logic lives in bleService.ts (class-based, no React deps).
export function useBLE() {
  useEffect(() => {
    bleService.init();
  }, []);
}
