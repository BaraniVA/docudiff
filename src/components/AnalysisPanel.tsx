import React, { useState } from 'react';
import { AlertTriangle, Info, Image as ImageIcon, Barcode, AlignLeft, CheckCircle2, ChevronDown, ChevronUp, Sparkles, Loader2, Palette, Download } from 'lucide-react';
import clsx from 'clsx';
import type { Deviation } from '../App';
import type { StyleDeviation } from '../utils/diffEngine';

interface AnalysisPanelProps {
  deviations: Deviation[];
  styleDeviations: StyleDeviation[];
  aiConfidence: number;
  onAnalyzeDeviation: (dev: Deviation) => void;
  onDownloadDifferences: () => void;
}

/** Compact display of a unicode detail string. */
function UnicodeTag({ detail }: { detail: string }) {
  if (!detail) return null;
  return (
    <span className="text-[10px] text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded font-mono whitespace-nowrap" title={detail}>
      {detail.length > 40 ? detail.slice(0, 37) + '…' : detail}
    </span>
  );
}

function AiExplanation({ explanation, unicodeDetail }: { explanation: string; unicodeDetail?: string }) {
  const hasAiExplanation = explanation && explanation !== unicodeDetail;

  if (!hasAiExplanation) {
    return <span className="text-xs text-text-muted">Not analyzed</span>;
  }

  return (
    <span className="block text-xs text-text-main leading-snug max-w-md" title={explanation}>
      {explanation.length > 180 ? explanation.slice(0, 177) + '...' : explanation}
    </span>
  );
}

/** Deviation-type badge colour mapping (TVT-style). */
function deviationBadge(type: string) {
  switch (type) {
    case 'Insertion':
      return 'bg-green-100 text-green-800 border-green-200';
    case 'Deletion':
      return 'bg-red-100 text-red-800 border-red-200';
    case 'Capitalisation':
      return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'Spacing / Hyphenation':
      return 'bg-purple-100 text-purple-800 border-purple-200';
    case 'Punctuation':
      return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    default:
      return 'bg-orange-100 text-orange-800 border-orange-200';
  }
}

const AnalysisPanel: React.FC<AnalysisPanelProps> = ({ deviations, styleDeviations, aiConfidence, onAnalyzeDeviation, onDownloadDifferences }) => {
  const [activeTab, setActiveTab] = useState('deviations');
  const [isExpanded, setIsExpanded] = useState(true);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);

  const handleAnalyze = async (dev: Deviation) => {
    setAnalyzingId(dev.id);
    await onAnalyzeDeviation(dev);
    setAnalyzingId(null);
  };

  const tabs = [
    { id: 'deviations', label: 'Deviations', icon: AlertTriangle, count: deviations.length },
    { id: 'style', label: 'Style Check', icon: Palette, count: styleDeviations.length },
    { id: 'images', label: 'Images', icon: ImageIcon, count: 0 },
    { id: 'barcodes', label: 'Barcodes', icon: Barcode, count: 0 },
    { id: 'annotations', label: 'Annotations', icon: AlignLeft, count: 0 },
  ];

  return (
    <div className={clsx(
      "bg-white border-t border-muted-border flex flex-col transition-all duration-300 ease-in-out shadow-lg z-10",
      isExpanded ? "h-64" : "h-10"
    )}>
      {/* Tabs Header */}
      <div className="flex items-center justify-between bg-muted border-b border-muted-border px-2">
        <div className="flex space-x-1">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                if (!isExpanded) setIsExpanded(true);
              }}
              className={clsx(
                "px-4 py-2 text-sm font-medium flex items-center gap-2 border-t-2 transition-colors",
                activeTab === tab.id
                  ? "bg-white border-primary text-primary"
                  : "border-transparent text-text-muted hover:bg-white/50 hover:text-text-main"
              )}
            >
              <tab.icon size={16} />
              {tab.label}
              {tab.count > 0 && (
                <span className="bg-primary/10 text-primary text-xs py-0.5 px-2 rounded-full font-bold">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="p-1.5 hover:bg-muted-border rounded-md text-text-muted hover:text-primary transition-colors mr-2"
        >
          {isExpanded ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
        </button>
      </div>

      {/* Content Area */}
      {isExpanded && (
        <div className="flex-1 overflow-hidden flex">
          {/* Table Area */}
          <div className="flex-1 overflow-auto border-r border-muted-border relative">
            {activeTab === 'deviations' && (
              <table className="w-full text-sm text-left">
                <thead className="bg-muted text-text-muted sticky top-0 border-b border-muted-border shadow-sm z-10">
                  <tr>
                    <th className="px-4 py-2 font-medium w-8">#</th>
                    <th className="px-4 py-2 font-medium w-32">Type</th>
                    <th className="px-4 py-2 font-medium">Original Text</th>
                    <th className="px-4 py-2 font-medium w-12 text-center">P.</th>
                    <th className="px-4 py-2 font-medium">Copy Text</th>
                    <th className="px-4 py-2 font-medium w-12 text-center">P.</th>
                    <th className="px-4 py-2 font-medium">Unicode Detail</th>
                    <th className="px-4 py-2 font-medium min-w-64">AI Explanation</th>
                    <th className="px-4 py-2 font-medium w-24">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-muted-border">
                  {deviations.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-text-muted">
                        No deviations found or documents not yet compared.
                      </td>
                    </tr>
                  ) : (
                    deviations.map((dev, idx) => (
                      <tr
                        key={dev.id}
                        className="hover:bg-accent/5 transition-colors group cursor-pointer"
                        onClick={() => {
                          window.dispatchEvent(new CustomEvent('scroll-to-dev', { detail: { id: dev.id } }));
                        }}
                      >
                        <td className="px-4 py-2 text-text-muted font-mono text-xs">
                          {idx + 1}
                        </td>
                        <td className="px-4 py-2">
                          <span className={clsx(
                            "text-xs font-semibold px-2 py-0.5 rounded border",
                            deviationBadge(dev.type)
                          )}>
                            {dev.type}
                          </span>
                        </td>
                        <td className="px-4 py-2 max-w-xs">
                          <span className="bg-red-50 text-red-800 px-1 py-0.5 rounded break-all text-xs font-mono">
                            {dev.originalText || '∅'}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-center text-text-muted text-xs">{dev.page}</td>
                        <td className="px-4 py-2 max-w-xs">
                          <span className="bg-green-50 text-green-800 px-1 py-0.5 rounded break-all text-xs font-mono">
                            {dev.copyText || '∅'}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-center text-text-muted text-xs">{dev.page}</td>
                        <td className="px-4 py-2 max-w-xs">
                          <UnicodeTag detail={dev.unicodeDetail ?? dev.comment} />
                        </td>
                        <td className="px-4 py-2">
                          <AiExplanation explanation={dev.comment} unicodeDetail={dev.unicodeDetail} />
                        </td>
                        <td className="px-4 py-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAnalyze(dev);
                            }}
                            disabled={analyzingId === dev.id}
                            className="flex items-center gap-1 text-xs bg-primary/10 text-primary hover:bg-primary hover:text-white px-2 py-1 rounded transition-colors disabled:opacity-50"
                          >
                            {analyzingId === dev.id ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                            AI Explain
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}

            {activeTab === 'style' && (
              <table className="w-full text-sm text-left">
                <thead className="bg-muted text-text-muted sticky top-0 border-b border-muted-border shadow-sm z-10">
                  <tr>
                    <th className="px-4 py-2 font-medium w-8">#</th>
                    <th className="px-4 py-2 font-medium w-36">Category</th>
                    <th className="px-4 py-2 font-medium">Affected Text</th>
                    <th className="px-4 py-2 font-medium">Original Value</th>
                    <th className="px-4 py-2 font-medium w-12 text-center">P.</th>
                    <th className="px-4 py-2 font-medium">Copy Value</th>
                    <th className="px-4 py-2 font-medium w-12 text-center">P.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-muted-border">
                  {styleDeviations.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-text-muted">
                        No style deviations found. Style comparison requires DOCX or PDF documents with embedded font/style information.
                      </td>
                    </tr>
                  ) : (
                    styleDeviations.map((sd, idx) => (
                      <tr key={sd.id} className="hover:bg-accent/5 transition-colors">
                        <td className="px-4 py-2 text-text-muted font-mono text-xs">{idx + 1}</td>
                        <td className="px-4 py-2">
                          <span className="text-xs font-semibold px-2 py-0.5 rounded border bg-violet-100 text-violet-800 border-violet-200">
                            {sd.category}
                          </span>
                        </td>
                        <td className="px-4 py-2 max-w-xs truncate text-xs" title={sd.affectedText}>
                          {sd.affectedText}
                        </td>
                        <td className="px-4 py-2">
                          <span className="bg-red-50 text-red-800 px-1.5 py-0.5 rounded text-xs font-mono">
                            {sd.originalValue}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-center text-text-muted text-xs">{sd.originalPage}</td>
                        <td className="px-4 py-2">
                          <span className="bg-green-50 text-green-800 px-1.5 py-0.5 rounded text-xs font-mono">
                            {sd.copyValue}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-center text-text-muted text-xs">{sd.copyPage}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}

            {activeTab !== 'deviations' && activeTab !== 'style' && (
              <div className="flex items-center justify-center h-full text-text-muted flex-col gap-2">
                <Info size={24} className="text-muted-border" />
                <p>No {activeTab} found in the current documents.</p>
              </div>
            )}
          </div>

          {/* Legend / Info Area */}
          <div className="w-80 bg-muted/30 p-4 overflow-y-auto flex flex-col gap-4">
            <div>
              <h3 className="font-semibold text-sm mb-2 flex items-center gap-2 text-primary">
                <Info size={16} /> Analysis Info
              </h3>
              <p className="text-xs text-text-muted leading-relaxed bg-white p-3 border border-muted-border rounded-md shadow-sm">
                Text deviations: <span className="bg-accent/30 font-semibold px-1 rounded text-text-main">{deviations.length}</span>
                {styleDeviations.length > 0 && (
                  <> · Style deviations: <span className="bg-violet-200/50 font-semibold px-1 rounded text-text-main">{styleDeviations.length}</span></>
                )}
                <br /><br />
                Each deviation shows the exact text from your original document and the copy – no normalization is applied to the display.
                Unicode code-point differences are shown to catch invisible character substitutions.
                <br /><br />
                AI confidence: <span className="font-bold text-green-600">{aiConfidence}%</span>
              </p>
              <button
                type="button"
                onClick={onDownloadDifferences}
                disabled={deviations.length + styleDeviations.length === 0}
                className="mt-2 w-full flex items-center justify-center gap-2 rounded-md border border-primary/30 bg-white px-3 py-2 text-xs font-semibold text-primary shadow-sm transition-colors hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Download size={14} /> Download Differences
              </button>
            </div>

            <div>
              <h3 className="font-semibold text-sm mb-2 text-primary">Deviation Types</h3>
              <div className="grid grid-cols-1 gap-1.5 text-xs">
                <div className="flex items-center gap-2"><span className={clsx("w-3 h-3 rounded border", "bg-orange-100 border-orange-300")}></span> Deviation (text changed)</div>
                <div className="flex items-center gap-2"><span className={clsx("w-3 h-3 rounded border", "bg-green-100 border-green-300")}></span> Insertion (text added)</div>
                <div className="flex items-center gap-2"><span className={clsx("w-3 h-3 rounded border", "bg-red-100 border-red-300")}></span> Deletion (text removed)</div>
                <div className="flex items-center gap-2"><span className={clsx("w-3 h-3 rounded border", "bg-blue-100 border-blue-300")}></span> Capitalisation</div>
                <div className="flex items-center gap-2"><span className={clsx("w-3 h-3 rounded border", "bg-purple-100 border-purple-300")}></span> Spacing / Hyphenation</div>
                <div className="flex items-center gap-2"><span className={clsx("w-3 h-3 rounded border", "bg-yellow-100 border-yellow-300")}></span> Punctuation</div>
                <div className="flex items-center gap-2"><span className={clsx("w-3 h-3 rounded border", "bg-violet-100 border-violet-300")}></span> Style (font, size, color…)</div>
              </div>
            </div>

            <div>
              <h3 className="font-semibold text-sm mb-2 text-primary">DDF Features</h3>
              <ul className="text-xs text-text-muted space-y-1">
                <li className="flex items-center gap-1.5"><CheckCircle2 size={12} className="text-green-500 flex-shrink-0" /> Char-by-char Unicode comparison</li>
                <li className="flex items-center gap-1.5"><CheckCircle2 size={12} className="text-green-500 flex-shrink-0" /> No display normalization</li>
                <li className="flex items-center gap-1.5"><CheckCircle2 size={12} className="text-green-500 flex-shrink-0" /> Font family & size detection</li>
                <li className="flex items-center gap-1.5"><CheckCircle2 size={12} className="text-green-500 flex-shrink-0" /> Font weight & style tracking</li>
                <li className="flex items-center gap-1.5"><CheckCircle2 size={12} className="text-green-500 flex-shrink-0" /> Color deviation detection</li>
                <li className="flex items-center gap-1.5"><CheckCircle2 size={12} className="text-green-500 flex-shrink-0" /> Page-level tracking</li>
                <li className="flex items-center gap-1.5"><CheckCircle2 size={12} className="text-green-500 flex-shrink-0" /> Myers diff algorithm</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AnalysisPanel;
