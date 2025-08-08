import { useMutation } from "@tanstack/react-query";
import { useCallback, useMemo, useRef } from "react";
import { mpyCrossCompiler } from "../services/mpyCrossCompiler";
import {
  analyzePybricksCode,
  type PybricksAnalysis,
} from "../utils/pybricksAnalyzer";
import {
  getPythonCompilerWorker,
  type CompilationRequest,
  type CompilationResult,
} from "../workers/pythonCompiler";

export interface ExtendedCompilationResult extends CompilationResult {
  analysis?: PybricksAnalysis;
}

export function usePythonCompiler() {
  const workerRef = useRef(getPythonCompilerWorker());
  const requestIdRef = useRef(0);

  const compileMutation = useMutation({
    mutationFn: async ({
      code,
      options,
    }: {
      code: string;
      options?: CompilationRequest["options"];
    }): Promise<ExtendedCompilationResult> => {
      const id = String(++requestIdRef.current);

      // Perform Pybricks analysis
      const analysis = analyzePybricksCode(code);

      try {
        // Use the real mpyCross compiler instead of the worker
        // This will show debug events in the debug panel
        const result = await mpyCrossCompiler.compileToBytecode(
          "test.py",
          code
        );

        if (!result.success) {
          throw new Error(result.error || "Compilation failed");
        }

        // Convert blob to Uint8Array for compatibility with the CompilationResult interface
        const arrayBuffer = await result.file.arrayBuffer();
        const bytecode = new Uint8Array(arrayBuffer);

        // Merge analysis warnings
        const allWarnings = [
          ...analysis.warnings,
          ...analysis.suggestions.map((s) => `Suggestion: ${s}`),
        ];

        return {
          id,
          success: true,
          bytecode,
          warnings: allWarnings.length > 0 ? allWarnings : undefined,
          analysis,
        };
      } catch (error) {
        // Even if compilation fails, return the analysis
        const errorObj =
          error instanceof Error ? error : new Error(String(error));
        throw Object.assign(errorObj, { analysis });
      }
    },
  });

  const compileCode = useCallback(
    async (code: string, options?: CompilationRequest["options"]) => {
      return await compileMutation.mutateAsync({ code, options });
    },
    [compileMutation]
  );

  const analyzeCode = useCallback((code: string) => {
    return analyzePybricksCode(code);
  }, []);

  // Get the latest analysis result
  const latestAnalysis = useMemo(() => {
    return (
      (compileMutation.data as ExtendedCompilationResult)?.analysis || null
    );
  }, [compileMutation.data]);

  return {
    compileCode,
    analyzeCode,
    isCompiling: compileMutation.isPending,
    compilationError: compileMutation.error,
    lastCompilationResult: compileMutation.data as ExtendedCompilationResult,
    latestAnalysis,

    reset: compileMutation.reset,
  };
}
