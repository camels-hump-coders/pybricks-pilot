import { useSyncFileSystem } from "../store/syncServiceEvents";

export function ServiceEventSync({ children }: { children: React.ReactNode }) {
  // Sync service events with Jotai atoms
  // NOTE: Removed useSyncRobotConnectionEvents as robot connection events 
  // are now handled directly in the Jotai hooks (useJotaiPybricksHub, useJotaiVirtualHub)
  useSyncFileSystem();
  
  return <>{children}</>;
}