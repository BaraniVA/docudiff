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
import { simpleDiff, generateHighlightedHtml, extractDeviations } from './utils/diffEngine';
import { parseFile, type ParseResult } from './utils/fileParser';
import { analyzeChange } from './services/ai';

export interface Deviation {
  id: string;
  type: string;
  originalText: string;
  copyText: string;
  page: number;
  comment: string;
  status: 'pending' | 'accepted' | 'rejected';
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
  const [isComparing, setIsComparing] = useState(false);
  const [aiConfidence, setAiConfidence] = useState(100);

  useEffect(() => {
    if (originalRawText && copyRawText) {
      setIsComparing(true);
      setTimeout(() => {
        const diffs = simpleDiff(originalRawText, copyRawText);
        const newDeviations = extractDeviations(diffs);
        setDeviations(newDeviations);
        setOriginalDiffHtml(generateHighlightedHtml(diffs, 'original'));
        setCopyDiffHtml(generateHighlightedHtml(diffs, 'copy'));
        setIsComparing(false);
      }, 100);
    } else {
      setOriginalDiffHtml('');
      setCopyDiffHtml('');
      setDeviations([]);
    }
  }, [originalRawText, copyRawText]);

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

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-muted font-sans text-text-main">
      <Header activeTab={activeTab} setActiveTab={setActiveTab} />
      
      {/* Main Workspace */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        {activeTab === 'project' && <ProjectTab />}
        {activeTab === 'prepare' && <PrepareTab />}
        {activeTab === 'check' && <CheckTab deviations={deviations} />}
        {activeTab === 'export' && <ExportTab />}
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
              onUploadOriginal={(f) => handleFileUpload(f, 'original')}
              onUploadCopy={(f) => handleFileUpload(f, 'copy')}
            />
            <AnalysisPanel 
              deviations={deviations} 
              aiConfidence={aiConfidence}
              onAnalyzeDeviation={handleAiAnalysis}
            />
          </>
        )}
      </main>

      <Footer wordsOriginal={originalRawText.split(/\s+/).filter(Boolean).length} wordsCopy={copyRawText.split(/\s+/).filter(Boolean).length} />
    </div>
  );
}

export default App;
