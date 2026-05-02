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
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
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

async function extractTextFromPdf(data: Uint8Array): Promise<string> {
  const loadingTask = pdfjsLib.getDocument(data);
  const pdf = await loadingTask.promise;

  let fullText = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    let pageText = '';
    let lastY = -1;

    for (const item of textContent.items as Array<{ str: string; transform: number[] }>) {
      if (lastY !== -1 && Math.abs(item.transform[5] - lastY) > 5) {
        pageText += '\n';
      }
      pageText += item.str;
      lastY = item.transform[5];
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
