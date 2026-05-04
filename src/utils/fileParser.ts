import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import JSZip from 'jszip';
import type { StyleInfo } from './diffEngine';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export interface StyleRun {
  text: string;
  style: StyleInfo;
  page: number;
}

export interface ParseResult {
  /** Raw text extracted from the document – NEVER normalised beyond line endings. */
  rawText: string;
  /** Content for the native-view pane (blob URL for PDF, raw text for TXT). */
  displayContent: string;
  displayType: 'pdf' | 'docx' | 'text';
  fileName: string;
  rawFileData?: ArrayBuffer;
  sourceFileData?: ArrayBuffer;
  sourceFileBytes?: Uint8Array;
  sourceFileBlob?: Blob;
  /** Character indices where page breaks occur (for page tracking in diffs). */
  pageBreaks: number[];
  /** Per-run style information extracted from the source document. */
  styleRuns: StyleRun[];
  /** Source format – PDF style data is unreliable for font family/weight/style */
  sourceFormat: 'pdf' | 'docx' | 'txt';
}

// ── Minimal line-ending normalisation ────────────────────────────────────────
// We ONLY normalise \r\n → \n.  Nothing else is touched.  The diff engine's
// comparison-key logic handles the rest (soft hyphens, typographic quotes, etc.)
// so that the display value remains faithful to the source.

function normaliseLineEndings(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

// ── Public entry point ───────────────────────────────────────────────────────

export async function parseFile(file: File): Promise<ParseResult> {
  const extension = file.name.split('.').pop()?.toLowerCase();

  switch (extension) {
    case 'txt': {
      const text = await file.text();
      return {
        rawText: normaliseLineEndings(text),
        displayContent: text,
        displayType: 'text',
        fileName: file.name,
        sourceFileData: await file.arrayBuffer(),
        sourceFileBytes: new TextEncoder().encode(text),
        sourceFileBlob: file.slice(0, file.size, file.type || 'text/plain'),
        pageBreaks: [],
        styleRuns: [],
        sourceFormat: 'txt',
      };
    }

    case 'pdf': {
      const arrayBuffer = await file.arrayBuffer();
      const sourceBytes = new Uint8Array(arrayBuffer.slice(0));
      const parserBytes = new Uint8Array(arrayBuffer.slice(0));
      const displayBytes = new Uint8Array(arrayBuffer.slice(0));
      const blob = new Blob([displayBytes], { type: 'application/pdf' });
      const blobUrl = URL.createObjectURL(blob);
      const extraction = await extractFromPdf(parserBytes);

      return {
        rawText: normaliseLineEndings(extraction.text),
        displayContent: blobUrl,
        displayType: 'pdf',
        fileName: file.name,
        rawFileData: displayBytes.buffer,
        sourceFileData: sourceBytes.buffer.slice(0),
        sourceFileBytes: sourceBytes,
        sourceFileBlob: file.slice(0, file.size, file.type || 'application/pdf'),
        pageBreaks: extraction.pageBreaks,
        styleRuns: extraction.styleRuns,
        sourceFormat: 'pdf',
      };
    }

    case 'docx': {
      const arrayBuffer = await file.arrayBuffer();
      const sourceBytes = new Uint8Array(arrayBuffer.slice(0));
      const extraction = await extractFromDocx(arrayBuffer);
      const convertedPdf = await convertDocxToPdfForDisplay(file, arrayBuffer);

      if (convertedPdf) {
        const blob = new Blob([convertedPdf], { type: 'application/pdf' });
        const blobUrl = URL.createObjectURL(blob);

        return {
          rawText: normaliseLineEndings(extraction.text),
          displayContent: blobUrl,
          displayType: 'pdf',
          fileName: file.name,
          rawFileData: convertedPdf,
          sourceFileData: sourceBytes.buffer.slice(0),
          sourceFileBytes: sourceBytes,
          sourceFileBlob: file.slice(0, file.size, file.type || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
          pageBreaks: extraction.pageBreaks,
          styleRuns: extraction.styleRuns,
          sourceFormat: 'docx',
        };
      }

      return {
        rawText: normaliseLineEndings(extraction.text),
        displayContent: '',
        displayType: 'docx',
        fileName: file.name,
        rawFileData: arrayBuffer,
        sourceFileData: sourceBytes.buffer.slice(0),
        sourceFileBytes: sourceBytes,
        sourceFileBlob: file.slice(0, file.size, file.type || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
        pageBreaks: extraction.pageBreaks,
        styleRuns: extraction.styleRuns,
        sourceFormat: 'docx',
      };
    }

    default:
      throw new Error(`Unsupported file type: ${extension}`);
  }
}

// ── DOCX → PDF server-side conversion (unchanged) ───────────────────────────

async function convertDocxToPdfForDisplay(file: File, arrayBuffer: ArrayBuffer): Promise<ArrayBuffer | null> {
  try {
    const response = await fetch('/api/convert/docx-to-pdf', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'X-File-Name': file.name,
      },
      body: arrayBuffer.slice(0),
    });

    if (!response.ok) {
      const detail = await response.text();
      console.warn('DOCX to PDF conversion unavailable:', detail);
      return null;
    }

    return await response.arrayBuffer();
  } catch (error) {
    console.warn('DOCX to PDF conversion unavailable:', error);
    return null;
  }
}

// ── PDF text + style extraction ──────────────────────────────────────────────

interface PdfTextItem {
  str: string;
  transform: number[];
  width?: number;
  height?: number;
  hasEOL?: boolean;
  fontName?: string;
}

function pdfItemX(item: PdfTextItem): number {
  return item.transform[4] ?? 0;
}

function pdfItemY(item: PdfTextItem): number {
  return item.transform[5] ?? 0;
}

function pdfFontSize(item: PdfTextItem): number {
  return Math.abs(item.transform[3] || item.transform[0] || item.height || 10);
}

function pdfItemEndX(item: PdfTextItem): number {
  const estimatedWidth = item.width ?? item.str.length * pdfFontSize(item) * 0.45;
  return pdfItemX(item) + Math.max(0, estimatedWidth);
}

function hasEdgeWhitespace(previous: string, current: string): boolean {
  return /\s$/.test(previous) || /^\s/.test(current);
}

function shouldInsertPdfSpace(previous: PdfTextItem, current: PdfTextItem): boolean {
  if (hasEdgeWhitespace(previous.str, current.str)) return false;

  const fontSize = Math.max(pdfFontSize(previous), pdfFontSize(current), 1);
  const gap = pdfItemX(current) - pdfItemEndX(previous);

  return gap > Math.max(fontSize * 0.18, 1.5);
}

function shouldInsertPdfLineBreak(previous: PdfTextItem, current: PdfTextItem): boolean {
  if (previous.hasEOL) return true;

  const fontSize = Math.max(pdfFontSize(previous), pdfFontSize(current), 1);
  return Math.abs(pdfItemY(current) - pdfItemY(previous)) > Math.max(fontSize * 0.55, 4);
}

function sortPdfTextItems(items: PdfTextItem[]): PdfTextItem[] {
  return items
    .filter((item) => Boolean(item.str))
    .sort((a, b) => {
      const fontSize = Math.max(pdfFontSize(a), pdfFontSize(b), 1);
      const yDelta = pdfItemY(b) - pdfItemY(a);

      if (Math.abs(yDelta) > Math.max(fontSize * 0.6, 4)) {
        return yDelta;
      }

      return pdfItemX(a) - pdfItemX(b);
    });
}

// NOTE: PDF font names (e.g. "g_d0_f3", "BCDEEE+TimesNewRomanPSMT") are
// opaque subset identifiers.  Different PDF generators encode the SAME font
// completely differently, so deriving font-family/weight/style from the name
// is inherently unreliable and produces massive false positives.
//
// The ONLY reliable style property from a PDF is fontSize, which comes from
// the text transform matrix – not the font name.

async function extractFromPdf(data: Uint8Array): Promise<{
  text: string;
  pageBreaks: number[];
  styleRuns: StyleRun[];
}> {
  const loadingTask = pdfjsLib.getDocument(data);
  const pdf = await loadingTask.promise;

  let fullText = '';
  const pageBreaks: number[] = [];
  const styleRuns: StyleRun[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    if (i > 1) {
      pageBreaks.push(fullText.length);
    }

    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    let previousItem: PdfTextItem | null = null;
    const items = sortPdfTextItems(textContent.items as PdfTextItem[]);

    for (const item of items) {
      if (previousItem) {
        if (shouldInsertPdfLineBreak(previousItem, item)) {
          fullText = fullText.trimEnd() + '\n';
        } else if (shouldInsertPdfSpace(previousItem, item)) {
          fullText += ' ';
        }
      }

      // Only extract fontSize – it's the only reliable metric from PDF
      styleRuns.push({
        text: item.str,
        style: {
          fontSize: pdfFontSize(item),
        },
        page: i,
      });

      fullText += item.str;
      previousItem = item;
    }

    fullText += '\n\n';
  }

  return { text: fullText, pageBreaks, styleRuns };
}

// ── DOCX text + style extraction ─────────────────────────────────────────────

interface DocxExtraction {
  text: string;
  pageBreaks: number[];
  styleRuns: StyleRun[];
}

async function extractFromDocx(arrayBuffer: ArrayBuffer): Promise<DocxExtraction> {
  const zip = await JSZip.loadAsync(arrayBuffer);

  // Try to read styles.xml to resolve style IDs → properties
  const styleMap = await buildDocxStyleMap(zip);

  const ctx: DocxWalkContext = {
    segments: [],
    styleRuns: [],
    pageBreaks: [],
    currentPage: 1,
    charCount: 0,
    styleMap,
  };

  await appendXmlBody(zip, 'word/document.xml', ctx);
  await appendMatchingXml(zip, /^word\/header\d+\.xml$/, ctx);
  await appendMatchingXml(zip, /^word\/footer\d+\.xml$/, ctx);

  const rawText = collapseDocxText(ctx.segments.join(''));

  return {
    text: rawText,
    pageBreaks: ctx.pageBreaks,
    styleRuns: ctx.styleRuns,
  };
}

// Map from style ID → style properties
interface DocxStyleProps {
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string;
  fontStyle?: string;
  color?: string;
  textDecoration?: string;
}

async function buildDocxStyleMap(zip: JSZip): Promise<Map<string, DocxStyleProps>> {
  const map = new Map<string, DocxStyleProps>();
  const file = zip.file('word/styles.xml');
  if (!file) return map;

  try {
    const xml = await file.async('string');
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const styles = doc.getElementsByTagNameNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'style');

    for (let i = 0; i < styles.length; i++) {
      const style = styles[i];
      const styleId = style.getAttribute('w:styleId');
      if (!styleId) continue;

      const rPr = style.getElementsByTagNameNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'rPr')[0];
      if (!rPr) continue;

      map.set(styleId, extractRunProps(rPr));
    }
  } catch {
    // If styles.xml is malformed, proceed without styles
  }

  return map;
}

function extractRunProps(rPr: Element): DocxStyleProps {
  const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const props: DocxStyleProps = {};

  // Font family
  const rFonts = rPr.getElementsByTagNameNS(ns, 'rFonts')[0];
  if (rFonts) {
    props.fontFamily = rFonts.getAttribute('w:ascii')
      ?? rFonts.getAttribute('w:hAnsi')
      ?? rFonts.getAttribute('w:cs')
      ?? undefined;
  }

  // Font size (in half-points → convert to points)
  const sz = rPr.getElementsByTagNameNS(ns, 'sz')[0];
  if (sz) {
    const val = sz.getAttribute('w:val');
    if (val) props.fontSize = parseInt(val) / 2;
  }

  // Bold
  const b = rPr.getElementsByTagNameNS(ns, 'b')[0];
  if (b) {
    const val = b.getAttribute('w:val');
    props.fontWeight = (val === '0' || val === 'false') ? 'normal' : 'bold';
  }

  // Italic
  const iEl = rPr.getElementsByTagNameNS(ns, 'i')[0];
  if (iEl) {
    const val = iEl.getAttribute('w:val');
    props.fontStyle = (val === '0' || val === 'false') ? 'normal' : 'italic';
  }

  // Color
  const color = rPr.getElementsByTagNameNS(ns, 'color')[0];
  if (color) {
    const val = color.getAttribute('w:val');
    if (val && val !== 'auto') props.color = `#${val}`;
  }

  // Underline
  const u = rPr.getElementsByTagNameNS(ns, 'u')[0];
  if (u) {
    const val = u.getAttribute('w:val');
    if (val && val !== 'none') props.textDecoration = 'underline';
  }

  // Strikethrough
  const strike = rPr.getElementsByTagNameNS(ns, 'strike')[0];
  if (strike) {
    const val = strike.getAttribute('w:val');
    if (val !== '0' && val !== 'false') {
      props.textDecoration = props.textDecoration ? `${props.textDecoration} line-through` : 'line-through';
    }
  }

  return props;
}

interface DocxWalkContext {
  segments: string[];
  styleRuns: StyleRun[];
  pageBreaks: number[];
  currentPage: number;
  charCount: number;
  styleMap: Map<string, DocxStyleProps>;
}

function appendDocxTextSegment(ctx: DocxWalkContext, text: string, style: DocxStyleProps): void {
  if (!text) return;

  ctx.segments.push(text);
  ctx.styleRuns.push({
    text,
    style: {
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      fontStyle: style.fontStyle,
      color: style.color,
      textDecoration: style.textDecoration,
    },
    page: ctx.currentPage,
  });
  ctx.charCount += text.length;
}

function docxSymbolToUnicode(font: string, charHex: string): string {
  const codePoint = parseInt(charHex, 16);
  if (!Number.isFinite(codePoint)) return '';

  const normalizedFont = font.toLowerCase();
  const symbolKey = `${normalizedFont}:${charHex.toUpperCase().padStart(4, '0')}`;
  const symbolMap: Record<string, string> = {
    'wingdings:0028': '\u260E',
    'wingdings:F028': '\u260E',
    'wingdings:002A': '\u2709',
    'wingdings:F02A': '\u2709',
    'wingdings:006C': '\u2022',
    'wingdings:F06C': '\u2022',
    'wingdings:00FC': '\u2713',
    'wingdings:F0FC': '\u2713',
    'fontawesome:F095': '\u260E',
    'font awesome 5 free:F095': '\u260E',
    'font awesome 6 free:F095': '\u260E',
    'fontawesome:F0E0': '\u2709',
    'font awesome 5 free:F0E0': '\u2709',
    'font awesome 6 free:F0E0': '\u2709',
  };

  const mapped = symbolMap[symbolKey];
  if (mapped) return mapped;

  try {
    return String.fromCodePoint(codePoint);
  } catch {
    return '';
  }
}

async function appendXmlBody(zip: JSZip, path: string, ctx: DocxWalkContext): Promise<void> {
  const file = zip.file(path);
  if (!file) return;

  const xml = await file.async('string');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const body = doc.documentElement;
  if (!body) return;

  walkDocxNode(body, ctx, {});
}

async function appendMatchingXml(zip: JSZip, pattern: RegExp, ctx: DocxWalkContext): Promise<void> {
  const matches = Object.keys(zip.files)
    .filter((p) => pattern.test(p))
    .sort();

  for (const p of matches) {
    await appendXmlBody(zip, p, ctx);
  }
}

function walkDocxNode(node: Node, ctx: DocxWalkContext, inheritedStyle: DocxStyleProps): void {
  if (node.nodeType !== Node.ELEMENT_NODE) return;

  const element = node as Element;
  const name = element.localName;
  const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

  // Page break detection
  if (name === 'lastRenderedPageBreak' || name === 'pageBreakBefore') {
    ctx.pageBreaks.push(ctx.charCount);
    ctx.currentPage++;
  }

  if (name === 'br') {
    const type = element.getAttribute('w:type');
    if (type === 'page') {
      ctx.pageBreaks.push(ctx.charCount);
      ctx.currentPage++;
    }
    ctx.segments.push('\n');
    ctx.charCount += 1;
    return;
  }

  if (name === 'cr') {
    ctx.segments.push('\n');
    ctx.charCount += 1;
    return;
  }

  // Text run (<w:r>)
  if (name === 'r') {
    // Extract run-level style properties
    const rPr = element.getElementsByTagNameNS(ns, 'rPr')[0];
    let runStyle: DocxStyleProps = { ...inheritedStyle };

    if (rPr) {
      const extracted = extractRunProps(rPr);
      runStyle = { ...runStyle, ...extracted };
    }

    // Check for style reference
    const rStyle = rPr?.getElementsByTagNameNS(ns, 'rStyle')[0];
    if (rStyle) {
      const styleId = rStyle.getAttribute('w:val');
      if (styleId && ctx.styleMap.has(styleId)) {
        const mapped = ctx.styleMap.get(styleId)!;
        runStyle = { ...mapped, ...runStyle };
      }
    }

    // Now walk children with this style
    element.childNodes.forEach((child) => walkDocxNode(child, ctx, runStyle));
    return;
  }

  // Paragraph (<w:p>)
  if (name === 'p') {
    // Check paragraph style for inherited run properties
    const pPr = element.getElementsByTagNameNS(ns, 'pPr')[0];
    let paraStyle: DocxStyleProps = { ...inheritedStyle };

    if (pPr) {
      // Check for paragraph-level run properties
      const rPr = pPr.getElementsByTagNameNS(ns, 'rPr')[0];
      if (rPr) {
        const extracted = extractRunProps(rPr);
        paraStyle = { ...paraStyle, ...extracted };
      }

      // Check for style reference
      const pStyle = pPr.getElementsByTagNameNS(ns, 'pStyle')[0];
      if (pStyle) {
        const styleId = pStyle.getAttribute('w:val');
        if (styleId && ctx.styleMap.has(styleId)) {
          const mapped = ctx.styleMap.get(styleId)!;
          paraStyle = { ...mapped, ...paraStyle };
        }
      }

      // Check for page break before
      const pageBreakBefore = pPr.getElementsByTagNameNS(ns, 'pageBreakBefore')[0];
      if (pageBreakBefore) {
        const val = pageBreakBefore.getAttribute('w:val');
        if (val !== '0' && val !== 'false') {
          ctx.pageBreaks.push(ctx.charCount);
          ctx.currentPage++;
        }
      }
    }

    element.childNodes.forEach((child) => walkDocxNode(child, ctx, paraStyle));
    ctx.segments.push('\n');
    ctx.charCount += 1;
    return;
  }

  // Text node (<w:t>)
  if (name === 't') {
    const text = element.textContent ?? '';
    appendDocxTextSegment(ctx, text, inheritedStyle);
    return;
  }

  if (name === 'sym') {
    const font = element.getAttribute('w:font') ?? element.getAttribute('font') ?? inheritedStyle.fontFamily ?? '';
    const charHex = element.getAttribute('w:char') ?? element.getAttribute('char') ?? '';
    const symbol = docxSymbolToUnicode(font, charHex);
    appendDocxTextSegment(ctx, symbol, { ...inheritedStyle, fontFamily: inheritedStyle.fontFamily ?? font });
    return;
  }

  if (name === 'tab') {
    ctx.segments.push('\t');
    ctx.charCount += 1;
    return;
  }

  if (name === 'tc') {
    element.childNodes.forEach((child) => walkDocxNode(child, ctx, inheritedStyle));
    ctx.segments.push('\t');
    ctx.charCount += 1;
    return;
  }

  if (name === 'tr') {
    element.childNodes.forEach((child) => walkDocxNode(child, ctx, inheritedStyle));
    ctx.segments.push('\n');
    ctx.charCount += 1;
    return;
  }

  element.childNodes.forEach((child) => walkDocxNode(child, ctx, inheritedStyle));
}

function collapseDocxText(text: string): string {
  return text
    .replace(/\t+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
