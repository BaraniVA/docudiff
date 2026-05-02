export interface DiffResult {
  value: string;
  originalValue?: string;
  copyValue?: string;
  added?: boolean;
  removed?: boolean;
  deviationId?: string;
}

interface DiffToken {
  value: string;
  key: string;
  isWhitespace: boolean;
}

type Edit =
  | { type: 'equal'; original: DiffToken; copy: DiffToken }
  | { type: 'removed'; original: DiffToken }
  | { type: 'added'; copy: DiffToken };

function normalizeComparableText(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/\u00AD/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/[\u200B-\u200F\u2028-\u202F\uFEFF]/g, '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[‐‑‒–—―]/g, '-')
    .replace(/(\p{L})-\s*\n\s*(\p{L})/gu, '$1$2')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
}

function displayWhitespace(value: string): string {
  return /\n\s*\n/.test(value) ? '\n\n' : ' ';
}

function tokenize(text: string): DiffToken[] {
  const preparedText = normalizeComparableText(text);
  const tokens: DiffToken[] = [];
  let pendingWhitespace = '';

  const flushWhitespace = () => {
    if (!pendingWhitespace) return;

    tokens.push({
      value: displayWhitespace(pendingWhitespace),
      key: ' ',
      isWhitespace: true,
    });

    pendingWhitespace = '';
  };

  for (const character of Array.from(preparedText)) {
    if (/\s/u.test(character)) {
      pendingWhitespace += character;
      continue;
    }

    flushWhitespace();
    tokens.push({
      value: character,
      key: character,
      isWhitespace: false,
    });
  }

  flushWhitespace();
  return tokens;
}

function tokensEqual(original: DiffToken, copy: DiffToken): boolean {
  return original.key === copy.key;
}

function getFrontierValue(frontier: Map<number, number>, diagonal: number): number {
  return frontier.get(diagonal) ?? Number.NEGATIVE_INFINITY;
}

function toDiffResults(edits: Edit[]): DiffResult[] {
  return edits.map((edit) => {
    if (edit.type === 'equal') {
      return {
        value: edit.original.value,
        originalValue: edit.original.value,
        copyValue: edit.copy.value,
      };
    }

    if (edit.type === 'removed') {
      return {
        value: edit.original.value,
        originalValue: edit.original.value,
        removed: true,
      };
    }

    return {
      value: edit.copy.value,
      copyValue: edit.copy.value,
      added: true,
    };
  });
}

function backtrackMyersDiff(
  trace: Map<number, number>[],
  originalTokens: DiffToken[],
  copyTokens: DiffToken[],
): DiffResult[] {
  const edits: Edit[] = [];
  let x = originalTokens.length;
  let y = copyTokens.length;

  for (let depth = trace.length - 1; depth >= 0; depth--) {
    const frontier = trace[depth];
    const diagonal = x - y;
    const previousDiagonal = diagonal === -depth
      || (diagonal !== depth && getFrontierValue(frontier, diagonal - 1) < getFrontierValue(frontier, diagonal + 1))
      ? diagonal + 1
      : diagonal - 1;

    const previousX = frontier.get(previousDiagonal) ?? 0;
    const previousY = previousX - previousDiagonal;

    while (x > previousX && y > previousY) {
      edits.push({
        type: 'equal',
        original: originalTokens[x - 1],
        copy: copyTokens[y - 1],
      });
      x--;
      y--;
    }

    if (depth === 0) break;

    if (x === previousX) {
      edits.push({ type: 'added', copy: copyTokens[y - 1] });
      y--;
    } else {
      edits.push({ type: 'removed', original: originalTokens[x - 1] });
      x--;
    }
  }

  return toDiffResults(edits.reverse());
}

function trimCommonEdges(originalTokens: DiffToken[], copyTokens: DiffToken[]) {
  let prefixLength = 0;
  while (
    prefixLength < originalTokens.length
    && prefixLength < copyTokens.length
    && tokensEqual(originalTokens[prefixLength], copyTokens[prefixLength])
  ) {
    prefixLength++;
  }

  let originalSuffixStart = originalTokens.length;
  let copySuffixStart = copyTokens.length;
  while (
    originalSuffixStart > prefixLength
    && copySuffixStart > prefixLength
    && tokensEqual(originalTokens[originalSuffixStart - 1], copyTokens[copySuffixStart - 1])
  ) {
    originalSuffixStart--;
    copySuffixStart--;
  }

  return {
    prefix: originalTokens.slice(0, prefixLength).map((original, index) => ({
      type: 'equal' as const,
      original,
      copy: copyTokens[index],
    })),
    originalMiddle: originalTokens.slice(prefixLength, originalSuffixStart),
    copyMiddle: copyTokens.slice(prefixLength, copySuffixStart),
    suffix: originalTokens.slice(originalSuffixStart).map((original, index) => ({
      type: 'equal' as const,
      original,
      copy: copyTokens[copySuffixStart + index],
    })),
  };
}

function diffMiddle(originalTokens: DiffToken[], copyTokens: DiffToken[]): DiffResult[] {
  const trace: Map<number, number>[] = [];
  const frontier = new Map<number, number>([[1, 0]]);
  const maxDepth = originalTokens.length + copyTokens.length;

  for (let depth = 0; depth <= maxDepth; depth++) {
    trace.push(new Map(frontier));

    for (let diagonal = -depth; diagonal <= depth; diagonal += 2) {
      const shouldMoveDown = diagonal === -depth
        || (diagonal !== depth && getFrontierValue(frontier, diagonal - 1) < getFrontierValue(frontier, diagonal + 1));
      let x = shouldMoveDown
        ? getFrontierValue(frontier, diagonal + 1)
        : getFrontierValue(frontier, diagonal - 1) + 1;

      if (!Number.isFinite(x)) x = 0;

      let y = x - diagonal;

      while (
        x < originalTokens.length
        && y < copyTokens.length
        && tokensEqual(originalTokens[x], copyTokens[y])
      ) {
        x++;
        y++;
      }

      frontier.set(diagonal, x);

      if (x >= originalTokens.length && y >= copyTokens.length) {
        return backtrackMyersDiff(trace, originalTokens, copyTokens);
      }
    }
  }

  return [
    ...originalTokens.map((token) => ({ value: token.value, originalValue: token.value, removed: true })),
    ...copyTokens.map((token) => ({ value: token.value, copyValue: token.value, added: true })),
  ];
}

// TVT-style deterministic comparison: normalize layout noise, then compare Unicode
// code points exactly so punctuation, case, accents, symbols, and digits surface.
export function simpleDiff(original: string, copy: string): DiffResult[] {
  const originalTokens = tokenize(original);
  const copyTokens = tokenize(copy);
  const { prefix, originalMiddle, copyMiddle, suffix } = trimCommonEdges(originalTokens, copyTokens);

  return [
    ...toDiffResults(prefix),
    ...diffMiddle(originalMiddle, copyMiddle),
    ...toDiffResults(suffix),
  ];
}

function escapeHtml(unsafe: string) {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function textForMode(part: DiffResult, mode: 'original' | 'copy'): string {
  if (mode === 'original') return part.originalValue ?? part.value;
  return part.copyValue ?? part.value;
}

export function generateHighlightedHtml(diffs: DiffResult[], mode: 'original' | 'copy'): string {
  let html = '';

  diffs.forEach((part) => {
    const value = textForMode(part, mode);
    const escapedValue = escapeHtml(value);
    const idAttr = part.deviationId ? `id="dev-${mode}-${part.deviationId}" data-dev-id="${part.deviationId}"` : '';

    if (part.added && mode === 'copy') {
      html += `<span ${idAttr} class="diff-highlight cursor-pointer transition-all duration-300" style="background-color: rgba(255, 165, 0, 0.4); padding: 0 2px; border-radius: 2px;">${escapedValue}</span>`;
    } else if (part.removed && mode === 'original') {
      html += `<span ${idAttr} class="diff-highlight cursor-pointer transition-all duration-300" style="background-color: rgba(255, 165, 0, 0.4); padding: 0 2px; border-radius: 2px;">${escapedValue}</span>`;
    } else if (!part.added && !part.removed) {
      html += escapedValue;
    }
  });

  return html;
}

function visibleText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function hasContent(value: string): boolean {
  return visibleText(value).length > 0;
}

export function extractDeviations(diffs: DiffResult[]) {
  const deviations = [];
  let currentDeviationId = 1;

  for (let i = 0; i < diffs.length; i++) {
    if (!diffs[i].removed && !diffs[i].added) continue;

    const originalParts: string[] = [];
    const copyParts: string[] = [];
    const changedParts: DiffResult[] = [];

    while (i < diffs.length) {
      const part = diffs[i];
      const isChanged = Boolean(part.removed || part.added);
      const isWhitespaceOnlyEqual = !isChanged && !hasContent(textForMode(part, 'original')) && !hasContent(textForMode(part, 'copy'));

      if (!isChanged && !isWhitespaceOnlyEqual) break;

      if (part.removed) {
        originalParts.push(part.originalValue ?? part.value);
        changedParts.push(part);
      } else if (part.added) {
        copyParts.push(part.copyValue ?? part.value);
        changedParts.push(part);
      } else {
        originalParts.push(part.originalValue ?? part.value);
        copyParts.push(part.copyValue ?? part.value);
      }

      i++;
    }

    i--;

    const originalText = visibleText(originalParts.join(''));
    const copyText = visibleText(copyParts.join(''));

    if (!hasContent(originalText) && !hasContent(copyText)) continue;

    const devId = String(currentDeviationId++);
    changedParts.forEach((part) => {
      part.deviationId = devId;
    });

    let type = 'Deviation';
    if (!hasContent(originalText)) type = 'Insertion';
    if (!hasContent(copyText)) type = 'Deletion';

    deviations.push({
      id: devId,
      type,
      originalText,
      copyText,
      page: 1,
      comment: '',
      status: 'pending' as const,
    });
  }

  return deviations;
}
