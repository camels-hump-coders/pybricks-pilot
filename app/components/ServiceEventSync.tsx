import { usePybricksHubEventManager } from "../hooks/usePybricksHubEventManager";
import { useSyncFileSystem } from "../store/syncServiceEvents";

export function ServiceEventSync({ children }: { children: React.ReactNode }) {
  // Sync service events with Jotai atoms
  useSyncFileSystem();
  
  // Centrally manage Pybricks hub events to prevent duplicate handling
  usePybricksHubEventManager();

  return <>{children}</>;
}
