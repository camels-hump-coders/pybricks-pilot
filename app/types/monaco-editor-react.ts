import type { ComponentType } from "react";

export interface EditorProps {
  value?: string;
  language?: string;
  theme?: string;
  height?: string | number;
  options?: Record<string, unknown>;
  onChange?: (value?: string) => void;
}

const Editor: ComponentType<EditorProps> = () => null;
export default Editor;
