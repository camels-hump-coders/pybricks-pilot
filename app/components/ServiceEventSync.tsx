import { useSyncFileSystem } from "../store/syncServiceEvents";

export function ServiceEventSync({ children }: { children: React.ReactNode }) {
  // Sync service events with Jotai atoms
  useSyncFileSystem();

  return <>{children}</>;
}
