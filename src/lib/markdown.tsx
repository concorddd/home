import React from "react";

/**
 * Parser de Markdown customizado estilo Discord/WhatsApp
 * Suporta: **negrito**, *itálico*, ~~tachado~~, `código`, ```bloco```, > citação
 */
export function parseMarkdown(text: string): React.ReactNode[] {
  if (!text) return [];

  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBlockContent: string[] = [];
  let codeBlockLang = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";

    // Bloco de código
    if (line.startsWith("```")) {
      if (inCodeBlock) {
        // Fechar bloco de código
        elements.push(
          <pre key={`code-${i}`} className="my-1 rounded bg-[#1e1f22] p-3 overflow-x-auto">
            <code className="text-sm text-gray-200 font-mono">{codeBlockContent.join("\n")}</code>
          </pre>
        );
        codeBlockContent = [];
        codeBlockLang = "";
        inCodeBlock = false;
      } else {
        // Abrir bloco de código
        codeBlockLang = line.slice(3).trim();
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockContent.push(line);
      continue;
    }

    // Citação
    if (line.startsWith("> ")) {
      elements.push(
        <blockquote key={`quote-${i}`} className="my-1 border-l-4 border-[#4f545c] pl-3 text-gray-300 italic">
          {parseInlineMarkdown(line.slice(2))}
        </blockquote>
      );
      continue;
    }

    // Linha normal com formatação inline
    elements.push(
      <p key={`line-${i}`} className="break-words">
        {parseInlineMarkdown(line)}
      </p>
    );
  }

  // Fechar bloco de código se ainda estiver aberto
  if (inCodeBlock) {
    elements.push(
      <pre key="code-end" className="my-1 rounded bg-[#1e1f22] p-3 overflow-x-auto">
        <code className="text-sm text-gray-200 font-mono">{codeBlockContent.join("\n")}</code>
      </pre>
    );
  }

  return elements;
}

/**
 * Parser de formatação inline
 */
function parseInlineMarkdown(text: string): React.ReactNode[] {
  const elements: React.ReactNode[] = [];
  // Regex para: **negrito**, *itálico*, _itálico_, ~~tachado~~, `código`
  const regex = /(\*\*([^*]+)\*\*|\*([^*]+)\*_([^_]+)_|~~([^~]+)~~|`([^`]+)`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyIndex = 0;

  while ((match = regex.exec(text)) !== null) {
    // Texto antes do match
    if (match.index > lastIndex) {
      elements.push(text.slice(lastIndex, match.index));
    }

    const [fullMatch, , bold, italic1, italic2, strikethrough, code] = match;

    if (bold) {
      elements.push(
        <strong key={`b-${keyIndex++}`} className="font-bold text-white">
          {bold}
        </strong>
      );
    } else if (italic1) {
      elements.push(
        <em key={`i-${keyIndex++}`} className="italic text-gray-200">
          {italic1}
        </em>
      );
    } else if (italic2) {
      elements.push(
        <em key={`i-${keyIndex++}`} className="italic text-gray-200">
          {italic2}
        </em>
      );
    } else if (strikethrough) {
      elements.push(
        <del key={`s-${keyIndex++}`} className="line-through text-gray-400">
          {strikethrough}
        </del>
      );
    } else if (code) {
      elements.push(
        <code key={`c-${keyIndex++}`} className="rounded bg-[#1e1f22] px-1.5 py-0.5 text-sm font-mono text-[#e8912d]">
          {code}
        </code>
      );
    }

    lastIndex = match.index + fullMatch.length;
  }

  // Texto restante
  if (lastIndex < text.length) {
    elements.push(text.slice(lastIndex));
  }

  return elements.length > 0 ? elements : [text];
}
