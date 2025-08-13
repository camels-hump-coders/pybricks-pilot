import { useMutation } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { pybricksHubService } from "../services/pybricksHub";
import {
  analyzePybricksCode,
  type PybricksAnalysis,
} from "../utils/pybricksAnalyzer";
import {
  type CompilationRequest,
  type CompilationResult,
} from "../workers/pythonCompiler";

interface ExtendedCompilationResult extends CompilationResult {
  analysis?: PybricksAnalysis;
}

export function usePythonCompiler() {
  const compileMutation = useMutation({
    mutationFn: async ({
      code,
    }: {
      code: string;
      options?: CompilationRequest["options"];
    }): Promise<ExtendedCompilationResult> => {
      // Perform Pybricks analysis
      const analysis = analyzePybricksCode(code);

      try {
        // Use the unified compilation from PybricksHubService
        // This will handle instrumentation (if enabled) and show debug events
        const compiledBlob = await pybricksHubService.compileProgram(code);

        // Convert blob to Uint8Array for compatibility with the CompilationResult interface
        const arrayBuffer = await compiledBlob.arrayBuffer();
        const bytecode = new Uint8Array(arrayBuffer);

        // Merge analysis warnings
        const allWarnings = [
          ...analysis.warnings,
          ...analysis.suggestions.map((s) => `Suggestion: ${s}`),
        ];

        return {
          id: Date.now().toString(), // Simple ID generation
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
