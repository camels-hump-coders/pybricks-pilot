declare module "monaco-editor/esm/vs/language/python/monaco.contribution";
declare module "monaco-editor/esm/vs/basic-languages/python/python.contribution";
declare module "monaco-editor/esm/vs/editor/editor.worker?worker";
declare module "monaco-editor/esm/vs/language/python/pyright.worker?worker";

declare global {
  interface Window {
    MonacoEnvironment?: {
      getWorker: (id: string, label: string) => Worker;
    };
  }
}

export {};
