import Editor from "@monaco-editor/react";
import { useEffect } from "react";
import "monaco-editor/esm/vs/basic-languages/python/python.contribution";
import "monaco-editor/esm/vs/language/python/monaco.contribution";

interface PythonEditorProps {
  value: string;
  onChange: (value: string) => void;
}

export function PythonEditor({ value, onChange }: PythonEditorProps) {
  useEffect(() => {
    let cancelled = false;
    async function setup() {
      const [editorWorker, pyWorker] = await Promise.all([
        import("monaco-editor/esm/vs/editor/editor.worker?worker"),
        import("monaco-editor/esm/vs/language/python/pyright.worker?worker"),
      ]);
      if (!cancelled) {
        self.MonacoEnvironment = {
          getWorker(_id: string, label: string) {
            if (label === "python") {
              return new pyWorker.default();
            }
            return new editorWorker.default();
          },
        };
      }
    }
    setup();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Editor
      language="python"
      theme="vs-dark"
      value={value}
      onChange={(v) => onChange(v ?? "")}
      options={{ automaticLayout: true }}
      height="100%"
    />
  );
}
