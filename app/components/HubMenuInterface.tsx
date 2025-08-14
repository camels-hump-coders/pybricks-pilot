import { useEffect, useState } from "react";
import { pybricksHubService } from "../services/pybricksHub";
import { useAtomValue } from "jotai";
import { useJotaiFileSystem } from "../hooks/useJotaiFileSystem";
import { isConnectedAtom } from "../store/atoms/robotConnection";

interface HubMenuStatus {
  selectedProgram: number;
  totalPrograms: number;
  state: 'menu' | 'running';
  timestamp: number;
}

export function HubMenuInterface() {
  const [hubMenuStatus, setHubMenuStatus] = useState<HubMenuStatus | null>(null);
  const [lastUpdate, setLastUpdate] = useState<number>(0);
  const [pendingSelection, setPendingSelection] = useState<number | null>(null);
  const { allPrograms } = useJotaiFileSystem();
  const isConnected = useAtomValue(isConnectedAtom);

  // allPrograms already contains only numbered programs, sorted by program number
  const numberedPrograms = allPrograms.filter(p => !p.isDirectory);

  useEffect(() => {
    const handleHubMenuStatus = (event: Event) => {
      const customEvent = event as CustomEvent<HubMenuStatus>;
      const status = customEvent.detail;
      setHubMenuStatus(status);
      setLastUpdate(Date.now());
      
      // Clear pending selection when robot confirms the change
      if (pendingSelection !== null && status.selectedProgram === pendingSelection) {
        setPendingSelection(null);
      }
    };

    document.addEventListener('hubMenuStatus', handleHubMenuStatus);
    
    return () => {
      document.removeEventListener('hubMenuStatus', handleHubMenuStatus);
    };
  }, []);

  const handleSelectProgram = async (programNumber: number) => {
    if (!isConnected) return;
    
    // Set pending selection for optimistic UI
    setPendingSelection(programNumber);
    
    try {
      const command = JSON.stringify({
        action: 'select_program',
        program_number: programNumber
      });
      await pybricksHubService.sendControlCommand(command);
    } catch (error) {
      console.error('Failed to select program:', error);
      // Clear pending selection on error
      setPendingSelection(null);
    }
  };

  const handleRunSelected = async () => {
    if (!isConnected || !hubMenuStatus) return;
    
    try {
      const command = JSON.stringify({
        action: 'run_selected'
      });
      await pybricksHubService.sendControlCommand(command);
    } catch (error) {
      console.error('Failed to run selected program:', error);
    }
  };

  // Don't show if no hub menu is running or no status available
  if (!hubMenuStatus || !isConnected) {
    return null;
  }

  const isStale = Date.now() - lastUpdate > 10000; // 10 seconds
  
  // Use pending selection for optimistic UI, otherwise use robot's reported value
  const displayedSelection = pendingSelection !== null ? pendingSelection : hubMenuStatus.selectedProgram;
  const currentProgram = numberedPrograms.find(p => p.programNumber === displayedSelection);

  return (
    <div className="flex items-center gap-2">
      <select
        value={displayedSelection}
        onChange={(e) => handleSelectProgram(Number(e.target.value))}
        disabled={hubMenuStatus.state === 'running'}
        className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {numberedPrograms.map((program) => (
          <option key={program.programNumber} value={program.programNumber}>
            #{program.programNumber} {program.name} ({program.programSide})
          </option>
        ))}
      </select>
      
      <button
        onClick={handleRunSelected}
        disabled={hubMenuStatus.state === 'running'}
        className={`
          px-4 py-2 rounded text-sm font-medium transition-colors flex items-center gap-2
          ${hubMenuStatus.state === 'running'
            ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
            : 'bg-green-600 text-white hover:bg-green-700'
          }
        `}
      >
        <div className={`w-2 h-2 rounded-full ${hubMenuStatus.state === 'running' ? 'bg-red-500 animate-pulse' : 'bg-green-400'}`} />
        {hubMenuStatus.state === 'running' ? 'Running' : 'Run'}
      </button>
    </div>
  );
}