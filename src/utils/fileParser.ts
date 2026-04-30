import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

import mammoth from 'mammoth';

export async function parseFile(file: File): Promise<string> {
  const extension = file.name.split('.').pop()?.toLowerCase();

  switch (extension) {
    case 'txt':
      return await file.text();
      
    case 'pdf':
      return await extractTextFromPdf(file);
      
    case 'docx':
      return await extractTextFromDocx(file);
      
    default:
      throw new Error(`Unsupported file type: ${extension}`);
  }
}

async function extractTextFromPdf(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument(new Uint8Array(arrayBuffer));
  const pdf = await loadingTask.promise;
  
  let fullText = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    let pageText = '';
    let lastY = -1;
    for (const item of textContent.items as any[]) {
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

async function extractTextFromDocx(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
}
