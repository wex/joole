export interface MapToken {
  text: string;
  line: number;
  col: number;
}

/**
 * A tokenizer matching qbsp3's common/scriplib.c: whitespace is any
 * character <= 32, comments are ; or # or // to end of line and the
 * block comment form, and double quotes group a token. Newlines inside
 * block comments count towards the line number.
 */
export function tokenizeMap(text: string): MapToken[] {
  const tokens: MapToken[] = [];
  let pos = 0;
  let line = 1;
  let lineStart = 0;
  const len = text.length;

  function advance(n: number): void {
    for (let i = 0; i < n; i++) {
      if (text[pos] === '\n') {
        line++;
        lineStart = pos + 1;
      }
      pos++;
    }
  }

  while (pos < len) {
    const c = text[pos]!;
    // whitespace
    if (c <= ' ') {
      advance(1);
      continue;
    }
    // ; # // line comments
    if (c === ';' || c === '#' || (c === '/' && text[pos + 1] === '/')) {
      while (pos < len && text[pos] !== '\n') {
        pos++;
      }
      continue;
    }
    // block comments
    if (c === '/' && text[pos + 1] === '*') {
      advance(2);
      while (pos < len && !(text[pos] === '*' && text[pos + 1] === '/')) {
        advance(1);
      }
      advance(2);
      continue;
    }
    const tokenLine = line;
    const tokenCol = pos - lineStart + 1;
    if (c === '"') {
      // quoted token
      pos++;
      let end = pos;
      while (end < len && text[end] !== '"') {
        end++;
      }
      tokens.push({ text: text.slice(pos, end), line: tokenLine, col: tokenCol });
      advance(end - pos + 1);
      continue;
    }
    // plain token
    let end = pos;
    while (end < len && text[end]! > ' ' && text[end] !== '(' && text[end] !== ')') {
      end++;
    }
    // parentheses are single-character tokens outside quotes
    if (end === pos && (c === '(' || c === ')')) {
      end = pos + 1;
    }
    tokens.push({ text: text.slice(pos, end), line: tokenLine, col: tokenCol });
    advance(end - pos);
  }
  return tokens;
}
