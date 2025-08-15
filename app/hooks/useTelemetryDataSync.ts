import { useSetAtom } from "jotai";
import { useEffect } from "react";
import { telemetryHistory } from "../services/telemetryHistory";
import { updateTelemetryDataAtom } from "../store/atoms/telemetryPoints";

/**
 * Hook to sync telemetry data from the service to Jotai atoms
 * This should be called once at the app level to keep data in sync
 */
export function useTelemetryDataSync() {
  const updateTelemetryData = useSetAtom(updateTelemetryDataAtom);
  
  useEffect(() => {
    const loadTelemetryData = () => {
      const paths = telemetryHistory.getAllPaths();
      const currentPath = telemetryHistory.getCurrentPath();
      
      updateTelemetryData({ paths, currentPath });
    };
    
    // Load data initially
    loadTelemetryData();
    
    // Set up periodic refresh to sync with the service
    const interval = setInterval(loadTelemetryData, 500);
    
    return () => clearInterval(interval);
  }, [updateTelemetryData]);
}