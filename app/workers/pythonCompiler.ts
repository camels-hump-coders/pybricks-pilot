export interface CompilationRequest {
  id: string;
  code: string;
  options?: {
    optimize?: boolean;
    target?: 'pybricks' | 'micropython';
  };
}

export interface CompilationResult {
  id: string;
  success: boolean;
  bytecode?: Uint8Array;
  error?: string;
  warnings?: string[];
}

export interface CompilerWorker {
  compile(request: CompilationRequest): Promise<CompilationResult>;
  terminate(): void;
}

export class PythonCompilerWorker implements CompilerWorker {
  private worker: Worker;
  private pendingRequests = new Map<string, {
    resolve: (result: CompilationResult) => void;
    reject: (error: Error) => void;
  }>();

  constructor() {
    this.worker = new Worker(
      new URL('./pythonCompilerWorker.ts', import.meta.url),
      { type: 'module' }
    );
    
    this.worker.onmessage = (event) => {
      const result: CompilationResult = event.data;
      const pending = this.pendingRequests.get(result.id);
      
      if (pending) {
        this.pendingRequests.delete(result.id);
        if (result.success) {
          pending.resolve(result);
        } else {
          pending.reject(new Error(result.error || 'Compilation failed'));
        }
      }
    };

    this.worker.onerror = (error) => {
      console.error('Worker error:', error);
      this.pendingRequests.forEach(({ reject }) => {
        reject(new Error('Worker error: ' + error.message));
      });
      this.pendingRequests.clear();
    };
  }

  async compile(request: CompilationRequest): Promise<CompilationResult> {
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(request.id, { resolve, reject });
      this.worker.postMessage(request);
    });
  }

  terminate() {
    this.worker.terminate();
    this.pendingRequests.clear();
  }
}

let compilerWorkerInstance: PythonCompilerWorker | null = null;

export function getPythonCompilerWorker(): PythonCompilerWorker {
  if (!compilerWorkerInstance) {
    compilerWorkerInstance = new PythonCompilerWorker();
  }
  return compilerWorkerInstance;
}

export function terminatePythonCompilerWorker() {
  if (compilerWorkerInstance) {
    compilerWorkerInstance.terminate();
    compilerWorkerInstance = null;
  }
}