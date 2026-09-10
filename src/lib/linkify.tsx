import { Fragment } from 'react';

const URL_RE = /(https?:\/\/[^\s]+)/g;

/** Splits text on URLs and renders them as clickable links; everything else stays plain text. */
export function linkify(text: string): React.ReactNode {
  const parts = text.split(URL_RE);
  return parts.map((part, i) => {
    if (part.match(URL_RE)) {
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          className="underline break-all"
        >
          {part}
        </a>
      );
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}
