// ─────────────────────────────────────────────────────────────────────────────
// TVT-Style Diff Engine
//
// Design principles (from Schlafender Hase TVT):
//  1. Compare text char-by-char at the Unicode *code-point* level.
//  2. Normalization must NEVER touch the display values – it only produces a
//     parallel "comparison key" for each character.  The user always sees the
//     exact bytes from their original/copy document.
//  3. Detect style/formatting deviations (font, size, weight, color, etc.)
//     alongside text deviations – they are separate deviation types.
//  4. Track page numbers so the analysis panel can show where each deviation
//     lives.
// ─────────────────────────────────────────────────────────────────────────────

// ── Public types ─────────────────────────────────────────────────────────────

export interface StyleInfo {
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string;
  fontStyle?: string;
  color?: string;
  backgroundColor?: string;
  textDecoration?: string;
  letterSpacing?: number;
  lineHeight?: number;
}

export interface DiffResult {
  /** The display value (always the original bytes – never normalised). */
  value: string;
  /** Original-side display text (present for equal & removed). */
  originalValue?: string;
  /** Copy-side display text (present for equal & added). */
  copyValue?: string;
  added?: boolean;
  removed?: boolean;
  deviationId?: string;
  /** Page number in the original document. */
  originalPage?: number;
  /** Page number in the copy document. */
  copyPage?: number;
}

export interface StyleDeviation {
  id: string;
  type: 'Style';
  category: string;          // e.g. "Font Family", "Font Size", "Font Weight"
  originalValue: string;     // e.g. "Arial"
  copyValue: string;         // e.g. "Helvetica"
  affectedText: string;      // the text span that has the style diff
  originalPage: number;
  copyPage: number;
  comment: string;
  status: 'pending' | 'accepted' | 'rejected';
}

// ── Internal token representation ────────────────────────────────────────────

interface DiffToken {
  /** Exact character as it appears in the source document. */
  value: string;
  /** Comparison key – used only for matching; never displayed. */
  key: string;
  isWhitespace: boolean;
  page: number;
}

type Edit =
  | { type: 'equal'; original: DiffToken; copy: DiffToken }
  | { type: 'removed'; original: DiffToken }
  | { type: 'added'; copy: DiffToken };

// ── Comparison-key normalisation ─────────────────────────────────────────────
// This function creates a *comparison key* from a character.  It NEVER modifies
// what the user sees – it only determines whether two characters are considered
// "the same" for diff purposes.
//
// Rules (TVT-inspired):
//  • NFKC-normalise so precomposed/decomposed forms match.
//  • Collapse all whitespace into a single space key.
//  • Treat typographic quotes/dashes as their ASCII equivalents.
//  • Strip zero-width and soft-hyphen codepoints (they are invisible).

function comparisonKey(char: string): string {
  // Invisible / zero-width → empty key (will be attached to adjacent token)
  if (/^[\u00AD\u200B-\u200F\u2028-\u202F\uFEFF]$/.test(char)) return '';

  let k = char.normalize('NFKC');

  const symbolKey = semanticSymbolKey(k);
  if (symbolKey) return symbolKey;

  // Typographic quotes → ASCII
  k = k.replace(/[\u201C\u201D\u00AB\u00BB]/g, '"');
  k = k.replace(/[\u2018\u2019\u201A\u201B]/g, "'");

  // Typographic dashes → hyphen-minus
  k = k.replace(/[\u2010-\u2015\u2212]/g, '-');

  // Non-breaking space → normal space
  k = k.replace(/\u00A0/g, ' ');

  return k;
}

function semanticSymbolKey(value: string): string {
  const codePoint = value.codePointAt(0);
  if (!codePoint) return '';

  const symbolGroups: Array<{ key: string; codePoints: number[] }> = [
    {
      key: '<symbol:phone>',
      codePoints: [
        0x260E, 0x260F, 0x2706, 0x1F4DE, 0x1F4F1, 0x1F4F2,
        0xF095, 0xF098, 0xF2A0, 0xF3CD, 0xF879,
      ],
    },
    {
      key: '<symbol:email>',
      codePoints: [
        0x2709, 0x1F4E7, 0x1F4E8, 0x1F4E9, 0xF003, 0xF0E0, 0xF199, 0xF2B6, 0xF2B7,
      ],
    },
    {
      key: '<symbol:bullet>',
      codePoints: [0x2022, 0x2023, 0x2043, 0x2219, 0x25AA, 0x25CF, 0x25E6, 0xF0B7],
    },
    {
      key: '<symbol:check>',
      codePoints: [0x2713, 0x2714, 0x2611, 0x2705, 0xF00C, 0xF058],
    },
    {
      key: '<symbol:cross>',
      codePoints: [0x2715, 0x2716, 0x2717, 0x2718, 0x274C, 0xF00D, 0xF057],
    },
    {
      key: '<symbol:location>',
      codePoints: [0x2316, 0x25CE, 0x1F4CD, 0x1F4CC, 0xF041, 0xF3C5],
    },
  ];

  for (const group of symbolGroups) {
    if (group.codePoints.includes(codePoint)) return group.key;
  }

  return '';
}

// ── Tokeniser ────────────────────────────────────────────────────────────────
// Produces one token per *visible character* (grapheme cluster) and collapses
// runs of whitespace into a single whitespace token.  Each token remembers
// which page it came from.

function tokenize(text: string, pageBreaks?: number[]): DiffToken[] {
  const tokens: DiffToken[] = [];
  let pendingWsValue = '';
  let currentPage = 1;
  let charIndex = 0;

  const breakSet = new Set(pageBreaks ?? []);

  const flushWhitespace = () => {
    if (!pendingWsValue) return;
    tokens.push({
      value: pendingWsValue.includes('\n\n') ? '\n\n' : ' ',
      key: ' ',
      isWhitespace: true,
      page: currentPage,
    });
    pendingWsValue = '';
  };

  // Iterate code-points (handles surrogate pairs correctly)
  for (const char of text) {
    if (breakSet.has(charIndex)) {
      currentPage++;
    }
    charIndex += char.length;

    const k = comparisonKey(char);

    // Invisible chars → skip entirely (don't even produce a token)
    if (k === '') continue;

    if (/^\s$/.test(k)) {
      pendingWsValue += char;
      continue;
    }

    flushWhitespace();
    tokens.push({
      value: char,     // EXACT character from the source document
      key: k,          // normalised for comparison only
      isWhitespace: false,
      page: currentPage,
    });
  }

  flushWhitespace();
  return tokens;
}

// ── Token equality ───────────────────────────────────────────────────────────

function tokensEqual(a: DiffToken, b: DiffToken): boolean {
  return a.key === b.key;
}

// ── Myers diff with common-edge trimming ─────────────────────────────────────

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
        originalPage: edit.original.page,
        copyPage: edit.copy.page,
      };
    }
    if (edit.type === 'removed') {
      return {
        value: edit.original.value,
        originalValue: edit.original.value,
        removed: true,
        originalPage: edit.original.page,
      };
    }
    return {
      value: edit.copy.value,
      copyValue: edit.copy.value,
      added: true,
      copyPage: edit.copy.page,
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

  // Fallback: treat everything as changed
  return [
    ...originalTokens.map((t) => ({ value: t.value, originalValue: t.value, removed: true, originalPage: t.page } as DiffResult)),
    ...copyTokens.map((t) => ({ value: t.value, copyValue: t.value, added: true, copyPage: t.page } as DiffResult)),
  ];
}

// ── Public: run the diff ─────────────────────────────────────────────────────

export function simpleDiff(
  original: string,
  copy: string,
  originalPageBreaks?: number[],
  copyPageBreaks?: number[],
): DiffResult[] {
  const originalTokens = tokenize(original, originalPageBreaks);
  const copyTokens = tokenize(copy, copyPageBreaks);
  const { prefix, originalMiddle, copyMiddle, suffix } = trimCommonEdges(originalTokens, copyTokens);

  return [
    ...toDiffResults(prefix),
    ...diffMiddle(originalMiddle, copyMiddle),
    ...toDiffResults(suffix),
  ];
}

// ── HTML generation ──────────────────────────────────────────────────────────

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
    const idAttr = part.deviationId ? `id="dev-${mode}-${part.deviationId}" data-dev-id="${part.deviationId}" data-dev-side="${mode}"` : '';

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

// ── Deviation extraction ─────────────────────────────────────────────────────

function visibleText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function hasContent(value: string): boolean {
  return visibleText(value).length > 0;
}

/** Categorise a text deviation based on what changed. */
function categoriseDeviation(origText: string, copyText: string): string {
  if (!origText && copyText) return 'Insertion';
  if (origText && !copyText) return 'Deletion';

  // Check if it's a capitalisation-only change
  if (origText.toLowerCase() === copyText.toLowerCase()) return 'Capitalisation';

  // Check for whitespace/hyphenation difference
  const origNoWs = origText.replace(/[\s-]/g, '');
  const copyNoWs = copyText.replace(/[\s-]/g, '');
  if (origNoWs === copyNoWs) return 'Spacing / Hyphenation';

  // Check for punctuation-only difference
  const origAlpha = origText.replace(/[^\p{L}\p{N}]/gu, '');
  const copyAlpha = copyText.replace(/[^\p{L}\p{N}]/gu, '');
  if (origAlpha === copyAlpha) return 'Punctuation';

  return 'Deviation';
}

/** Describe the Unicode difference between two strings at the code-point level. */
function describeUnicodeDiff(origText: string, copyText: string): string {
  if (!origText || !copyText) return '';

  const origCodes = [...origText].map(c => `U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`);
  const copyCodes = [...copyText].map(c => `U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`);

  const diffs: string[] = [];
  const maxLen = Math.max(origCodes.length, copyCodes.length);
  for (let i = 0; i < maxLen; i++) {
    const o = origCodes[i] ?? '(missing)';
    const c = copyCodes[i] ?? '(missing)';
    if (o !== c) {
      diffs.push(`pos ${i}: ${o} → ${c}`);
    }
  }

  if (diffs.length === 0) return '';
  return `Unicode: ${diffs.slice(0, 5).join(', ')}${diffs.length > 5 ? ` … +${diffs.length - 5} more` : ''}`;
}

export function extractDeviations(diffs: DiffResult[]) {
  const deviations: {
    id: string;
    type: string;
    originalText: string;
    copyText: string;
    page: number;
    comment: string;
    status: 'pending' | 'accepted' | 'rejected';
    unicodeDetail: string;
  }[] = [];
  let currentDeviationId = 1;

  for (let i = 0; i < diffs.length; i++) {
    if (!diffs[i].removed && !diffs[i].added) continue;

    const originalParts: string[] = [];
    const copyParts: string[] = [];
    const changedParts: DiffResult[] = [];
    let pageNum = diffs[i].originalPage ?? diffs[i].copyPage ?? 1;

    while (i < diffs.length) {
      const part = diffs[i];
      const isChanged = Boolean(part.removed || part.added);
      const isWhitespaceOnlyEqual = !isChanged && !hasContent(textForMode(part, 'original')) && !hasContent(textForMode(part, 'copy'));

      if (!isChanged && !isWhitespaceOnlyEqual) break;

      if (part.removed) {
        originalParts.push(part.originalValue ?? part.value);
        changedParts.push(part);
        if (part.originalPage) pageNum = part.originalPage;
      } else if (part.added) {
        copyParts.push(part.copyValue ?? part.value);
        changedParts.push(part);
        if (part.copyPage) pageNum = part.copyPage;
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

    const type = categoriseDeviation(originalText, copyText);
    const unicodeDetail = describeUnicodeDiff(originalText, copyText);

    deviations.push({
      id: devId,
      type,
      originalText,
      copyText,
      page: pageNum,
      comment: unicodeDetail,
      status: 'pending' as const,
      unicodeDetail,
    });
  }

  return deviations;
}

// ── Style comparison ─────────────────────────────────────────────────────────
// Compare two arrays of style info (one per text run) and produce style
// deviation records.
//
// IMPORTANT: We only compare properties where BOTH sides have a defined value.
// PDF extraction only gives us fontSize reliably; font family/weight/style
// cannot be reliably extracted from PDF font names (e.g. "g_d0_f3").

export function compareStyles(
  originalStyles: { text: string; style: StyleInfo; page: number }[],
  copyStyles: { text: string; style: StyleInfo; page: number }[],
): StyleDeviation[] {
  const deviations: StyleDeviation[] = [];
  let devId = 1;

  // Build a lookup of runs by their text content for matching
  const copyMap = new Map<string, typeof copyStyles>();
  for (const run of copyStyles) {
    const key = run.text.trim();
    if (!key) continue;
    const existing = copyMap.get(key) ?? [];
    existing.push(run);
    copyMap.set(key, existing);
  }

  const consumedCopyIndices = new Set<number>();

  for (const origRun of originalStyles) {
    const key = origRun.text.trim();
    if (!key) continue;

    const candidates = copyMap.get(key);
    if (!candidates || candidates.length === 0) continue;

    // Find the first unconsumed candidate
    let matchIdx = -1;
    for (let j = 0; j < candidates.length; j++) {
      const globalIdx = copyStyles.indexOf(candidates[j]);
      if (!consumedCopyIndices.has(globalIdx)) {
        matchIdx = j;
        consumedCopyIndices.add(globalIdx);
        break;
      }
    }
    if (matchIdx === -1) continue;

    const copyRun = candidates[matchIdx];
    const origS = origRun.style;
    const copyS = copyRun.style;

    // Compare each style property – only when BOTH sides have a real value
    const checks: { category: string; origVal?: string | number; copyVal?: string | number }[] = [
      { category: 'Font Family', origVal: origS.fontFamily, copyVal: copyS.fontFamily },
      { category: 'Font Size', origVal: origS.fontSize, copyVal: copyS.fontSize },
      { category: 'Font Weight', origVal: origS.fontWeight, copyVal: copyS.fontWeight },
      { category: 'Font Style', origVal: origS.fontStyle, copyVal: copyS.fontStyle },
      { category: 'Color', origVal: origS.color, copyVal: copyS.color },
      { category: 'Text Decoration', origVal: origS.textDecoration, copyVal: copyS.textDecoration },
    ];

    for (const check of checks) {
      // Skip if EITHER side is missing/undefined – we can't make a valid comparison
      if (check.origVal == null || check.copyVal == null) continue;
      if (check.origVal === '' || check.copyVal === '') continue;
      if (String(check.origVal) === 'undefined' || String(check.copyVal) === 'undefined') continue;

      const oStr = normaliseStyleValue(check.category, String(check.origVal));
      const cStr = normaliseStyleValue(check.category, String(check.copyVal));

      // Skip if normalisation produced empty strings
      if (!oStr || !cStr) continue;

      // Font size tolerance: ±1pt (PDF text extraction has slight imprecision)
      if (check.category === 'Font Size') {
        const oNum = parseFloat(oStr);
        const cNum = parseFloat(cStr);
        if (!isNaN(oNum) && !isNaN(cNum) && Math.abs(oNum - cNum) <= 1.0) continue;
      }

      if (oStr !== cStr) {
        deviations.push({
          id: `s${devId++}`,
          type: 'Style',
          category: check.category,
          originalValue: oStr,
          copyValue: cStr,
          affectedText: key.length > 60 ? key.slice(0, 57) + '…' : key,
          originalPage: origRun.page,
          copyPage: copyRun.page,
          comment: '',
          status: 'pending',
        });
      }
    }
  }

  return deviations;
}

function normaliseStyleValue(category: string, val: string): string {
  if (!val || val === 'undefined' || val === 'null') return '';

  if (category === 'Font Size') {
    const n = parseFloat(val);
    return isNaN(n) ? '' : `${Math.round(n * 10) / 10}pt`;
  }

  if (category === 'Color') {
    const rgbMatch = val.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (rgbMatch) {
      const hex = '#' + [rgbMatch[1], rgbMatch[2], rgbMatch[3]]
        .map(n => parseInt(n).toString(16).padStart(2, '0'))
        .join('');
      return hex.toUpperCase();
    }
    return val.toUpperCase();
  }

  if (category === 'Font Family') {
    return val.replace(/['"]/g, '').trim().toLowerCase();
  }

  return val.trim().toLowerCase();
}
