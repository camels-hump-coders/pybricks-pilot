import React from "react";
import hljs from "highlight.js/lib/core";
import jsonLang from "highlight.js/lib/languages/json";
import type { DebugEvent } from "../services/pybricksHub";

// Register JSON language once (idempotent)
try {
  hljs.registerLanguage("json", jsonLang);
} catch {
  // ignore if already registered
}

function renderJsonHighlighted(data: unknown) {
  try {
    const code =
      typeof data === "string"
        ? JSON.stringify(JSON.parse(data), null, 2)
        : JSON.stringify(data, null, 2);
    const html = hljs.highlight(code, { language: "json" }).value;
    return (
      <pre className="mt-1 bg-black/5 dark:bg-black/20 p-1 rounded whitespace-pre-wrap break-words">
        {React.createElement("code", {
          className: "hljs language-json",
          dangerouslySetInnerHTML: { __html: html },
        })}
      </pre>
    );
  } catch {
    return (
      <pre className="mt-1 bg-black/5 dark:bg-black/20 p-1 rounded whitespace-pre-wrap break-words">
        <code>{String(data)}</code>
      </pre>
    );
  }
}

export function DebugEventEntry({ event }: { event: DebugEvent }) {
  return (
    <div className="p-2 rounded bg-gray-50 dark:bg-gray-700/50">
      <div className="flex items-center justify-between">
        <span className="font-medium">[{event.type}]</span>
        <span className="text-[11px] text-gray-500">
          {new Date(event.timestamp).toLocaleTimeString()}
        </span>
      </div>
      {/* Try to render message as JSON; fallback to wrapped text */}
      {(() => {
        try {
          JSON.parse(event.message);
          return renderJsonHighlighted(event.message);
        } catch {
          return (
            <div className="mt-1 whitespace-pre-wrap break-words">
              {event.message}
            </div>
          );
        }
      })()}
      {event.details && renderJsonHighlighted(event.details)}
    </div>
  );
}

