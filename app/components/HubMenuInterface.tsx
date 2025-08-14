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
  const { allPrograms } = useJotaiFileSystem();
  const isConnected = useAtomValue(isConnectedAtom);

  // Filter numbered programs from all programs
  const numberedPrograms = allPrograms.filter(p => p.programNumber && !p.isDirectory)
    .sort((a, b) => (a.programNumber || 0) - (b.programNumber || 0));

  useEffect(() => {
    const handleHubMenuStatus = (event: Event) => {
      const customEvent = event as CustomEvent<HubMenuStatus>;
      const status = customEvent.detail;
      setHubMenuStatus(status);
      setLastUpdate(Date.now());
    };

    document.addEventListener('hubMenuStatus', handleHubMenuStatus);
    
    return () => {
      document.removeEventListener('hubMenuStatus', handleHubMenuStatus);
    };
  }, []);

  const handleSelectProgram = async (programNumber: number) => {
    if (!isConnected) return;
    
    try {
      const command = JSON.stringify({
        action: 'select_program',
        program_number: programNumber
      });
      await pybricksHubService.sendControlCommand(command);
    } catch (error) {
      console.error('Failed to select program:', error);
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
  const currentProgram = numberedPrograms.find(p => p.programNumber === hubMenuStatus.selectedProgram);

  return (
    <div className="border border-gray-300 rounded-lg p-4 bg-gray-50">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-gray-800">
          Hub Menu Control
        </h3>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isStale ? 'bg-red-500' : hubMenuStatus.state === 'running' ? 'bg-red-500' : 'bg-green-500'}`} />
          <span className="text-sm text-gray-600">
            {isStale ? 'Stale' : hubMenuStatus.state === 'running' ? 'Running' : 'Menu'}
          </span>
        </div>
      </div>

      <div className="mb-4">
        <div className="text-sm text-gray-600 mb-2">
          Currently Selected: Program {hubMenuStatus.selectedProgram}
        </div>
        {currentProgram && (
          <div className="text-sm font-medium text-gray-800">
            {currentProgram.name} 
            <span className="text-gray-500 ml-2">({currentProgram.programSide} side)</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 mb-4">
        {numberedPrograms.map((program) => {
          const isSelected = program.programNumber === hubMenuStatus.selectedProgram;
          return (
            <button
              key={program.programNumber}
              onClick={() => handleSelectProgram(program.programNumber!)}
              disabled={hubMenuStatus.state === 'running'}
              className={`
                px-3 py-2 rounded text-sm font-medium transition-colors
                ${isSelected 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                }
                ${hubMenuStatus.state === 'running' ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
              `}
            >
              #{program.programNumber} {program.name}
            </button>
          );
        })}
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleRunSelected}
          disabled={hubMenuStatus.state === 'running'}
          className={`
            flex-1 px-4 py-2 rounded font-medium transition-colors
            ${hubMenuStatus.state === 'running'
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-green-600 text-white hover:bg-green-700'
            }
          `}
        >
          {hubMenuStatus.state === 'running' ? 'Program Running...' : 'Run Selected Program'}
        </button>
      </div>

      <div className="mt-3 text-xs text-gray-500">
        Hub reports {hubMenuStatus.totalPrograms} programs available
        {isStale && ' (connection may be lost)'}
      </div>
    </div>
  );
}