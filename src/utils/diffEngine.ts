export interface DiffResult {
  value: string;
  added?: boolean;
  removed?: boolean;
  deviationId?: string;
}

// A simple word-level diff implementation
export function simpleDiff(original: string, copy: string): DiffResult[] {
  const originalWords = original.split(/(\s+)/);
  const copyWords = copy.split(/(\s+)/);

  const results: DiffResult[] = [];
  let i = 0;
  let j = 0;

  // Extremely basic diffing for demonstration.
  // For a real diff, Longest Common Subsequence (LCS) algorithm should be used.
  while (i < originalWords.length || j < copyWords.length) {
    if (i < originalWords.length && j < copyWords.length && originalWords[i] === copyWords[j]) {
      results.push({ value: originalWords[i] });
      i++;
      j++;
    } else {
      // Find a lookahead match
      let lookaheadOriginal = -1;
      let lookaheadCopy = -1;

      for (let offset = 1; offset < 5; offset++) {
        if (i + offset < originalWords.length && originalWords[i + offset] === copyWords[j]) {
          lookaheadOriginal = offset;
          break;
        }
        if (j + offset < copyWords.length && copyWords[j + offset] === originalWords[i]) {
          lookaheadCopy = offset;
          break;
        }
      }

      if (lookaheadOriginal !== -1) {
        for (let k = 0; k < lookaheadOriginal; k++) {
          results.push({ value: originalWords[i], removed: true });
          i++;
        }
      } else if (lookaheadCopy !== -1) {
        for (let k = 0; k < lookaheadCopy; k++) {
          results.push({ value: copyWords[j], added: true });
          j++;
        }
      } else {
        if (i < originalWords.length) {
          results.push({ value: originalWords[i], removed: true });
          i++;
        }
        if (j < copyWords.length) {
          results.push({ value: copyWords[j], added: true });
          j++;
        }
      }
    }
  }

  return results;
}

function escapeHtml(unsafe: string) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function generateHighlightedHtml(diffs: DiffResult[], mode: 'original' | 'copy'): string {
  let html = '';
  
  diffs.forEach(part => {
    const escapedValue = escapeHtml(part.value);
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

export function extractDeviations(diffs: DiffResult[]) {
  const deviations = [];
  let currentDeviationId = 1;

  for (let i = 0; i < diffs.length; i++) {
    if (diffs[i].removed || diffs[i].added) {
      const isWhitespace = /^\s+$/.test(diffs[i].value);
      if (isWhitespace) continue;

      let type = 'Deviation';
      let originalText = diffs[i].removed ? diffs[i].value : '';
      let copyText = diffs[i].added ? diffs[i].value : '';
      const devId = String(currentDeviationId++);

      diffs[i].deviationId = devId;

      if (diffs[i].removed && i + 1 < diffs.length && diffs[i + 1].added) {
        copyText = diffs[i + 1].value;
        diffs[i + 1].deviationId = devId;
        i++;
      } else if (diffs[i].added) {
        type = 'Insertion';
      } else if (diffs[i].removed) {
        type = 'Deletion';
      }

      deviations.push({
        id: devId,
        type,
        originalText,
        copyText,
        page: 1,
        comment: '',
        status: 'pending' as const
      });
    }
  }

  return deviations;
}
