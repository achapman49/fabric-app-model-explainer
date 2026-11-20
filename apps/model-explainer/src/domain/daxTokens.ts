/** A small DAX tokenizer for syntax highlighting. Joining the token texts always gives back the input. */

export type DaxTokenKind = 'keyword' | 'function' | 'table' | 'column' | 'string' | 'number' | 'comment' | 'operator' | 'text';

export interface DaxToken {
  kind: DaxTokenKind;
  text: string;
}

const KEYWORDS = new Set(['VAR', 'RETURN', 'EVALUATE', 'DEFINE', 'MEASURE', 'COLUMN', 'TABLE', 'ORDER', 'BY', 'ASC', 'DESC', 'IN', 'NOT', 'AND', 'OR', 'TRUE', 'FALSE', 'START', 'AT']);

export function tokenizeDax(src: string): DaxToken[] {
  const out: DaxToken[] = [];
  const push = (kind: DaxTokenKind, text: string) => {
    const last = out[out.length - 1];
    if (last && last.kind === kind && (kind === 'text' || kind === 'operator')) last.text += text;
    else out.push({ kind, text });
  };
  let i = 0;
  const n = src.length;
  // Read a quoted run ('…', "…" or […]) where a doubled closing character escapes it; unterminated runs go to the end.
  const quoted = (close: string) => {
    let j = i + 1;
    while (j < n) {
      if (src[j] === close) {
        if (src[j + 1] === close) {
          j += 2;
          continue;
        }
        return j + 1;
      }
      j++;
    }
    return n;
  };
  while (i < n) {
    const c = src[i];
    const next = src[i + 1];
    if ((c === '/' && next === '/') || (c === '-' && next === '-')) {
      const end = src.indexOf('\n', i);
      const j = end < 0 ? n : end;
      push('comment', src.slice(i, j));
      i = j;
    } else if (c === '/' && next === '*') {
      const end = src.indexOf('*/', i + 2);
      const j = end < 0 ? n : end + 2;
      push('comment', src.slice(i, j));
      i = j;
    } else if (c === '"') {
      const j = quoted('"');
      push('string', src.slice(i, j));
      i = j;
    } else if (c === "'") {
      const j = quoted("'");
      push('table', src.slice(i, j));
      i = j;
    } else if (c === '[') {
      const j = quoted(']');
      push('column', src.slice(i, j));
      i = j;
    } else if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(next ?? ''))) {
      const m = /^[0-9]*\.?[0-9]+(?:[eE][+-]?[0-9]+)?/.exec(src.slice(i))!;
      push('number', m[0]);
      i += m[0].length;
    } else if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(src.slice(i))!;
      const word = m[0];
      let j = i + word.length;
      while (j < n && (src[j] === ' ' || src[j] === '\t')) j++;
      if (src[j] === '(') push('function', word);
      else if (KEYWORDS.has(word.toUpperCase())) push('keyword', word);
      else if (src[i + word.length] === '[') push('table', word);
      else push('text', word);
      i += word.length;
    } else if (/[+\-*/&|<>=^,()]/.test(c)) {
      push('operator', c);
      i++;
    } else {
      push('text', c);
      i++;
    }
  }
  return out;
}
