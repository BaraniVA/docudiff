import { useState, useEffect } from 'react';
import Header, { type TabType } from './components/Header';
import Footer from './components/Footer';
import ComparisonCanvas from './components/ComparisonCanvas';
import AnalysisPanel from './components/AnalysisPanel';
import CheckTab from './components/tabs/CheckTab';
import PrepareTab from './components/tabs/PrepareTab';
import SaveTab from './components/tabs/SaveTab';
import ExportTab from './components/tabs/ExportTab';
import ProjectTab from './components/tabs/ProjectTab';
import { simpleDiff, generateHighlightedHtml, extractDeviations, compareStyles, type StyleDeviation, type DiffResult } from './utils/diffEngine';
import { parseFile, type ParseResult } from './utils/fileParser';
import { analyzeChange, reviewChangeDecision } from './services/ai';

export interface Deviation {
  id: string;
  type: string;
  originalText: string;
  copyText: string;
  page: number;
  comment: string;
  status: 'pending' | 'accepted' | 'rejected';
  unicodeDetail?: string;
}

function csvCell(value: string | number | undefined) {
  const text = value == null ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function buildDifferencesCsv(
  deviations: Deviation[],
  styleDeviations: StyleDeviation[],
  originalFileName?: string,
  copyFileName?: string,
) {
  const rows = [
    ['Source Original', originalFileName ?? 'Original document'],
    ['Source Copy', copyFileName ?? 'Copy document'],
    ['Generated At', new Date().toISOString()],
    [],
    ['Kind', 'ID', 'Type/Category', 'Original Text/Value', 'Copy Text/Value', 'Original Page', 'Copy Page', 'Status', 'Notes'],
  ];

  deviations.forEach((dev) => {
    rows.push([
      'Text',
      dev.id,
      dev.type,
      dev.originalText,
      dev.copyText,
      String(dev.page),
      String(dev.page),
      dev.status,
      dev.comment || dev.unicodeDetail || '',
    ]);
  });

  styleDeviations.forEach((dev) => {
    rows.push([
      'Style',
      dev.id,
      dev.category,
      dev.originalValue,
      dev.copyValue,
      String(dev.originalPage),
      String(dev.copyPage),
      dev.status,
      dev.affectedText ? `Affected text: ${dev.affectedText}` : dev.comment,
    ]);
  });

  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

function App() {
  const [activeTab, setActiveTab] = useState<TabType>('compare');
  
  const [originalRawText, setOriginalRawText] = useState('');
  const [copyRawText, setCopyRawText] = useState('');
  
  // Diff-highlighted HTML (for diff view)
  const [originalDiffHtml, setOriginalDiffHtml] = useState('');
  const [copyDiffHtml, setCopyDiffHtml] = useState('');
  
  // Native display content (for original view)
  const [originalDisplay, setOriginalDisplay] = useState<ParseResult | null>(null);
  const [copyDisplay, setCopyDisplay] = useState<ParseResult | null>(null);
  
  const [deviations, setDeviations] = useState<Deviation[]>([]);
  const [styleDeviations, setStyleDeviations] = useState<StyleDeviation[]>([]);
  const [rawDiffs, setRawDiffs] = useState<DiffResult[]>([]);
  const [isComparing, setIsComparing] = useState(false);
  const [isAiReviewing, setIsAiReviewing] = useState(false);
  const [lastFixedDownload, setLastFixedDownload] = useState<{ url: string; fileName: string } | null>(null);
  const [aiConfidence, setAiConfidence] = useState(100);

  useEffect(() => {
    const compareTimer = window.setTimeout(() => {
      if (originalRawText && copyRawText) {
        setIsComparing(true);

        // Run text diff with page break info
        const diffs = simpleDiff(
          originalRawText,
          copyRawText,
          originalDisplay?.pageBreaks,
          copyDisplay?.pageBreaks,
        );
        setRawDiffs(diffs);
        const newDeviations = extractDeviations(diffs);
        setDeviations(newDeviations);
        setOriginalDiffHtml(generateHighlightedHtml(diffs, 'original'));
        setCopyDiffHtml(generateHighlightedHtml(diffs, 'copy'));

        // Run style comparison if both documents have style info
        if (originalDisplay?.styleRuns?.length && copyDisplay?.styleRuns?.length) {
          const styleDiffs = compareStyles(originalDisplay.styleRuns, copyDisplay.styleRuns);
          setStyleDeviations(styleDiffs);
        } else {
          setStyleDeviations([]);
        }

        setIsComparing(false);
      } else {
        setOriginalDiffHtml('');
        setCopyDiffHtml('');
        setDeviations([]);
        setStyleDeviations([]);
        setRawDiffs([]);
      }
    }, 100);

    return () => window.clearTimeout(compareTimer);
  }, [originalRawText, copyRawText, originalDisplay, copyDisplay]);

  const handleFileUpload = async (file: File, target: 'original' | 'copy') => {
    try {
      const result = await parseFile(file);
      if (target === 'original') {
        setOriginalRawText(result.rawText);
        setOriginalDisplay(result);
      } else {
        setCopyRawText(result.rawText);
        setCopyDisplay(result);
      }
    } catch (error) {
      console.error('File parsing error:', error);
      alert('Error parsing file: ' + (error as Error).message);
    }
  };

  const handleAiAnalysis = async (dev: Deviation) => {
    const result = await analyzeChange(dev.originalText, dev.copyText, 'Compare this change in context');
    setDeviations(prev => prev.map(d => 
      d.id === dev.id 
        ? { ...d, comment: result.explanation, type: result.type } 
        : d
    ));
    setAiConfidence(result.confidenceScore);
  };

  const handleDeviationStatusChange = (id: string, status: Deviation['status']) => {
    setDeviations(prev => prev.map(d => (
      d.id === id ? { ...d, status } : d
    )));
  };

  const handleAiReviewAll = async () => {
    if (deviations.length === 0) return;

    setIsAiReviewing(true);
    try {
      const reviewed = await Promise.all(deviations.map(async (dev) => {
        const decision = await reviewChangeDecision(dev.originalText, dev.copyText, dev.type);

        return {
          ...dev,
          status: decision.status,
          comment: decision.explanation,
        };
      }));

      setDeviations(reviewed);
    } finally {
      setIsAiReviewing(false);
    }
  };

  const getFixedCopyFile = () => {
    if (!originalDisplay) return null;

    const extension = originalDisplay.fileName.split('.').pop()?.toLowerCase() || 'txt';
    const baseName = (copyDisplay?.fileName || originalDisplay.fileName).replace(/\.[^.]+$/, '');
    const fileName = `${baseName}-fixed-like-original.${extension}`;
    const mimeType = extension === 'pdf'
      ? 'application/pdf'
      : extension === 'docx'
        ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        : 'text/plain';

    if (originalDisplay.sourceFileBytes?.byteLength) {
      return {
        fileName,
        blob: new Blob([new Uint8Array(originalDisplay.sourceFileBytes)], { type: mimeType }),
      };
    }

    if (originalDisplay.sourceFileBlob) {
      return {
        fileName,
        blob: originalDisplay.sourceFileBlob.slice(0, originalDisplay.sourceFileBlob.size, mimeType),
      };
    }

    const data = originalDisplay.sourceFileData ?? originalDisplay.rawFileData;
    if (data && data.byteLength > 0) {
      return {
        fileName,
        blob: new Blob([data.slice(0)], { type: mimeType }),
      };
    }

    return {
      fileName,
      blob: new Blob([originalRawText], { type: 'text/plain' }),
    };
  };

  const handleFixAndDownload = () => {
    if (!originalDisplay || !copyDisplay) {
      alert('Upload both original and copy documents first.');
      return;
    }

    const fixedFile = getFixedCopyFile();

    if (!fixedFile) {
      alert('Could not create the fixed document for download.');
      return;
    }

    const url = URL.createObjectURL(fixedFile.blob);
    setLastFixedDownload(prev => {
      if (prev) URL.revokeObjectURL(prev.url);
      return { url, fileName: fixedFile.fileName };
    });

    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fixedFile.fileName;
    anchor.rel = 'noopener';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    window.setTimeout(() => {
      setCopyRawText(originalRawText);
      setCopyDisplay({
        ...originalDisplay,
        fileName: fixedFile.fileName,
      });
    }, 500);
  };

  const handleDownloadDifferences = () => {
    if (deviations.length + styleDeviations.length === 0) {
      alert('No differences are available to download yet.');
      return;
    }

    const csv = buildDifferencesCsv(
      deviations,
      styleDeviations,
      originalDisplay?.fileName,
      copyDisplay?.fileName,
    );
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const baseName = (copyDisplay?.fileName || originalDisplay?.fileName || 'document').replace(/\.[^.]+$/, '');
    const anchor = document.createElement('a');

    anchor.href = url;
    anchor.download = `${baseName}-differences.csv`;
    anchor.rel = 'noopener';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-muted font-sans text-text-main">
      <Header activeTab={activeTab} setActiveTab={setActiveTab} />
      
      {/* Main Workspace */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        {activeTab === 'project' && <ProjectTab />}
        {activeTab === 'prepare' && <PrepareTab />}
        {activeTab === 'check' && (
          <CheckTab
            deviations={deviations}
            canFixAndDownload={Boolean(originalDisplay && copyDisplay)}
            fixedDownloadUrl={lastFixedDownload?.url}
            fixedDownloadFileName={lastFixedDownload?.fileName}
            onFixAndDownload={handleFixAndDownload}
            onDeviationStatusChange={handleDeviationStatusChange}
            onAiReviewAll={handleAiReviewAll}
            isAiReviewing={isAiReviewing}
          />
        )}
        {activeTab === 'export' && (
          <ExportTab
            canFixAndDownload={Boolean(originalDisplay && copyDisplay)}
            originalFileName={originalDisplay?.fileName}
            copyFileName={copyDisplay?.fileName}
            fixedDownloadUrl={lastFixedDownload?.url}
            fixedDownloadFileName={lastFixedDownload?.fileName}
            deviationCount={deviations.length + styleDeviations.length}
            onFixAndDownload={handleFixAndDownload}
            onDownloadDifferences={handleDownloadDifferences}
          />
        )}
        {activeTab === 'save' && <SaveTab />}
        
        {activeTab === 'compare' && (
          <>
            {isComparing && (
              <div className="absolute inset-0 bg-white/50 z-20 flex items-center justify-center">
                <div className="bg-white p-4 rounded-md shadow-lg border border-primary font-semibold text-primary">
                  Comparing documents...
                </div>
              </div>
            )}
            <ComparisonCanvas 
              originalDiffHtml={originalDiffHtml} 
              copyDiffHtml={copyDiffHtml}
              originalDisplay={originalDisplay}
              copyDisplay={copyDisplay}
              diffs={rawDiffs}
              onUploadOriginal={(f) => handleFileUpload(f, 'original')}
              onUploadCopy={(f) => handleFileUpload(f, 'copy')}
            />
            <AnalysisPanel 
              deviations={deviations}
              styleDeviations={styleDeviations}
              aiConfidence={aiConfidence}
              onAnalyzeDeviation={handleAiAnalysis}
              onDownloadDifferences={handleDownloadDifferences}
            />
          </>
        )}
      </main>

      <Footer wordsOriginal={originalRawText.split(/\s+/).filter(Boolean).length} wordsCopy={copyRawText.split(/\s+/).filter(Boolean).length} />
    </div>
  );
}

export default App;
