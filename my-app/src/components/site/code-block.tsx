"use client";

import { useState } from "react";
import Prism from "prismjs";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-tsx";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-json";

export interface CodeFile {
  name: string;
  code: string;
  language?: string;
}

function highlight(code: string, language: string): string {
  const lang = Prism.languages[language] ? language : "tsx";
  return Prism.highlight(code, Prism.languages[lang], lang);
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <button
      type="button"
      onClick={copy}
      className="flex items-center gap-1.5 rounded-md border border-white/10 px-2 py-1 font-mono text-[11px] text-zinc-400 transition-colors duration-150 ease-out hover:text-zinc-200"
      aria-label="Copy code"
    >
      {copied ? (
        <>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3 w-3" aria-hidden="true">
            <path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Copied
        </>
      ) : (
        <>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-3 w-3" aria-hidden="true">
            <rect x="9" y="9" width="12" height="12" rx="2" />
            <path d="M5 15V5a2 2 0 0 1 2-2h10" strokeLinecap="round" />
          </svg>
          Copy
        </>
      )}
    </button>
  );
}

export function CodeBlock({ code, language = "tsx", filename }: { code: string; language?: string; filename?: string }) {
  return (
    <div className="code-theme overflow-hidden rounded-xl border border-border">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="flex gap-1.5" aria-hidden="true">
            <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
            <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
            <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
          </span>
          {filename && <span className="ml-2 font-mono text-xs text-zinc-400">{filename}</span>}
        </div>
        <CopyButton text={code} />
      </div>
      <pre className="overflow-x-auto p-4 text-[13px] leading-relaxed">
        <code className="language-tsx" dangerouslySetInnerHTML={{ __html: highlight(code, language) }} />
      </pre>
    </div>
  );
}

export function CodeTabs({ files }: { files: CodeFile[] }) {
  const [active, setActive] = useState(0);
  const file = files[active];

  return (
    <div className="code-theme overflow-hidden rounded-xl border border-border">
      <div className="flex items-center justify-between border-b border-white/10 pr-2">
        <div className="flex overflow-x-auto">
          {files.map((f, i) => (
            <button
              key={f.name}
              type="button"
              onClick={() => setActive(i)}
              className={`border-r border-white/10 px-4 py-2.5 font-mono text-xs transition-colors duration-150 ease-out ${
                i === active ? "bg-white/5 text-zinc-200" : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {f.name}
            </button>
          ))}
        </div>
        <CopyButton text={file.code} />
      </div>
      <pre className="overflow-x-auto p-4 text-[13px] leading-relaxed">
        <code
          className={`language-${file.language ?? "tsx"}`}
          dangerouslySetInnerHTML={{ __html: highlight(file.code, file.language ?? "tsx") }}
        />
      </pre>
    </div>
  );
}
