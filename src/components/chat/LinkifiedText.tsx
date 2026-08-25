import type { ReactNode } from 'react';

// One combined pass over the text: URLs (http(s):// or bare www.),
// email addresses, and phone-number-looking digit runs, in that priority
// order left-to-right through the string. Each match becomes a real <a>
// tag (opens the browser / dialer / mail app on tap), everything else
// stays as plain text — this is what WhatsApp does with message text.
const COMBINED_REGEX = /(https?:\/\/\S+|www\.\S+|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}|\+?\d[\d\s\-().]{7,}\d)/g;

// Trailing punctuation (a period ending the sentence, a closing paren from
// "(see https://example.com)", etc.) shouldn't get swept into the link.
function splitTrailingPunctuation(match: string): [string, string] {
  const trailing = match.match(/[.,;:!?)\]]+$/);
  if (!trailing) return [match, ''];
  return [match.slice(0, match.length - trailing[0].length), trailing[0]];
}

function classify(match: string): 'url' | 'email' | 'phone' {
  if (match.includes('@')) return 'email';
  if (/^(https?:\/\/|www\.)/i.test(match)) return 'url';
  return 'phone';
}

export function LinkifiedText({ text }: { text: string }) {
  if (!text) return null;

  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  const regex = new RegExp(COMBINED_REGEX);
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const [core, trailingPunct] = splitTrailingPunctuation(match[0]);
    if (!core) continue;

    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const type = classify(core);
    // Plain-prose numbers ("call me at 9" or a stray "123") shouldn't turn
    // into tel: links — require a realistic phone-number digit count.
    const digitCount = type === 'phone' ? (core.match(/\d/g) || []).length : 0;

    if (type === 'phone' && digitCount < 7) {
      nodes.push(core);
    } else if (type === 'url') {
      const href = core.startsWith('www.') ? `https://${core}` : core;
      nodes.push(
        <a
          key={key++}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="underline break-all"
          onClick={(e) => e.stopPropagation()}
        >
          {core}
        </a>
      );
    } else if (type === 'email') {
      nodes.push(
        <a key={key++} href={`mailto:${core}`} className="underline break-all" onClick={(e) => e.stopPropagation()}>
          {core}
        </a>
      );
    } else {
      nodes.push(
        <a
          key={key++}
          href={`tel:${core.replace(/[\s().-]/g, '')}`}
          className="underline"
          onClick={(e) => e.stopPropagation()}
        >
          {core}
        </a>
      );
    }

    if (trailingPunct) nodes.push(trailingPunct);
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return <>{nodes}</>;
}
