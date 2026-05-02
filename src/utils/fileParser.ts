import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import JSZip from 'jszip';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export interface ParseResult {
  rawText: string;
  displayContent: string;
  displayType: 'pdf' | 'docx' | 'text';
  fileName: string;
  rawFileData?: ArrayBuffer;
}

function normalizeTextForDiff(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/(\p{L})-\s*\n\s*(\p{L})/gu, '$1$2')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/\u00AD/g, '')
    .replace(/[\uE000-\uF8FF]/g, '')
    .replace(/[\u2700-\u27BF]/g, '')
    .replace(/[\u2600-\u26FF]/g, '')
    .replace(/[\u2300-\u23FF]/g, '')
    .replace(/[\u2190-\u21FF]/g, '')
    .replace(/[\uFE00-\uFE0F]/g, '')
    .replace(/[\u200B-\u200F\u2028-\u202F\uFEFF]/g, '')
    .replace(/\u00A0/g, ' ');
}

export async function parseFile(file: File): Promise<ParseResult> {
  const extension = file.name.split('.').pop()?.toLowerCase();

  switch (extension) {
    case 'txt': {
      const text = await file.text();
      return {
        rawText: text,
        displayContent: text,
        displayType: 'text',
        fileName: file.name
      };
    }

    case 'pdf': {
      const arrayBuffer = await file.arrayBuffer();
      const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
      const blobUrl = URL.createObjectURL(blob);
      const rawText = await extractTextFromPdf(new Uint8Array(arrayBuffer));

      return {
        rawText: normalizeTextForDiff(rawText),
        displayContent: blobUrl,
        displayType: 'pdf',
        fileName: file.name
      };
    }

    case 'docx': {
      const arrayBuffer = await file.arrayBuffer();
      const rawText = await extractTextFromDocx(arrayBuffer);
      const convertedPdf = await convertDocxToPdfForDisplay(file, arrayBuffer);

      if (convertedPdf) {
        const blob = new Blob([convertedPdf], { type: 'application/pdf' });
        const blobUrl = URL.createObjectURL(blob);

        return {
          rawText: normalizeTextForDiff(rawText),
          displayContent: blobUrl,
          displayType: 'pdf',
          fileName: file.name
        };
      }

      return {
        rawText: normalizeTextForDiff(rawText),
        displayContent: '',
        displayType: 'docx',
        fileName: file.name,
        rawFileData: arrayBuffer
      };
    }

    default:
      throw new Error(`Unsupported file type: ${extension}`);
  }
}

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

interface PdfTextItem {
  str: string;
  transform: number[];
  width?: number;
  height?: number;
  hasEOL?: boolean;
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

async function extractTextFromPdf(data: Uint8Array): Promise<string> {
  const loadingTask = pdfjsLib.getDocument(data);
  const pdf = await loadingTask.promise;

  let fullText = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    let pageText = '';
    let previousItem: PdfTextItem | null = null;

    for (const item of textContent.items as PdfTextItem[]) {
      if (!item.str) continue;

      if (previousItem) {
        if (shouldInsertPdfLineBreak(previousItem, item)) {
          pageText = pageText.trimEnd() + '\n';
        } else if (shouldInsertPdfSpace(previousItem, item)) {
          pageText += ' ';
        }
      }

      pageText += item.str;
      previousItem = item;
    }

    fullText += pageText + '\n\n';
  }

  return fullText;
}

async function extractTextFromDocx(arrayBuffer: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(arrayBuffer);
  const segments: string[] = [];

  await appendXmlText(zip, 'word/document.xml', segments);
  await appendMatchingXmlText(zip, /^word\/header\d+\.xml$/, segments);
  await appendMatchingXmlText(zip, /^word\/footer\d+\.xml$/, segments);

  return collapseDocxText(segments.join(''));
}

async function appendXmlText(zip: JSZip, path: string, segments: string[]): Promise<void> {
  const file = zip.file(path);
  if (!file) return;

  const xml = await file.async('string');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const body = doc.documentElement;
  if (!body) return;

  walkDocxNode(body, segments);
}

async function appendMatchingXmlText(zip: JSZip, pattern: RegExp, segments: string[]): Promise<void> {
  const matches = Object.keys(zip.files)
    .filter((path) => pattern.test(path))
    .sort();

  for (const path of matches) {
    await appendXmlText(zip, path, segments);
  }
}

function walkDocxNode(node: Node, segments: string[]): void {
  if (node.nodeType !== Node.ELEMENT_NODE) return;

  const element = node as Element;
  const name = element.localName;

  if (name === 't') {
    segments.push(element.textContent ?? '');
    return;
  }

  if (name === 'tab') {
    segments.push('\t');
    return;
  }

  if (name === 'br' || name === 'cr') {
    segments.push('\n');
    return;
  }

  if (name === 'tc') {
    element.childNodes.forEach((child) => walkDocxNode(child, segments));
    segments.push('\t');
    return;
  }

  if (name === 'tr') {
    element.childNodes.forEach((child) => walkDocxNode(child, segments));
    segments.push('\n');
    return;
  }

  if (name === 'p') {
    element.childNodes.forEach((child) => walkDocxNode(child, segments));
    segments.push('\n');
    return;
  }

  element.childNodes.forEach((child) => walkDocxNode(child, segments));
}

function collapseDocxText(text: string): string {
  return text
    .replace(/\t+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
