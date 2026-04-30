import React, { useState } from 'react';
import { AlertTriangle, Info, Image as ImageIcon, Barcode, Type, AlignLeft, CheckCircle2, ChevronDown, ChevronUp, Sparkles, Loader2 } from 'lucide-react';
import clsx from 'clsx';
import type { Deviation } from '../App';

interface AnalysisPanelProps {
  deviations: Deviation[];
  aiConfidence: number;
  onAnalyzeDeviation: (dev: Deviation) => void;
}

const AnalysisPanel: React.FC<AnalysisPanelProps> = ({ deviations, aiConfidence, onAnalyzeDeviation }) => {
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
    { id: 'images', label: 'Images', icon: ImageIcon, count: 0 },
    { id: 'barcodes', label: 'Barcodes', icon: Barcode, count: 0 },
    { id: 'style', label: 'Style Check', icon: Type, count: 0 },
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
                    <th className="px-4 py-2 font-medium w-8">G</th>
                    <th className="px-4 py-2 font-medium">Type</th>
                    <th className="px-4 py-2 font-medium">Original Text</th>
                    <th className="px-4 py-2 font-medium w-16 text-center">P.</th>
                    <th className="px-4 py-2 font-medium">Copy Text</th>
                    <th className="px-4 py-2 font-medium w-16 text-center">P.</th>
                    <th className="px-4 py-2 font-medium">Comment (AI Analysis)</th>
                    <th className="px-4 py-2 font-medium w-24">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-muted-border">
                  {deviations.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-text-muted">
                        No deviations found or documents not yet compared.
                      </td>
                    </tr>
                  ) : (
                    deviations.map((dev) => (
                      <tr 
                        key={dev.id} 
                        className="hover:bg-accent/5 transition-colors group cursor-pointer"
                        onClick={() => {
                          window.dispatchEvent(new CustomEvent('scroll-to-dev', { detail: { id: dev.id } }));
                        }}
                      >
                        <td className="px-4 py-2 text-text-muted group-hover:text-accent">
                          <CheckCircle2 size={16} />
                        </td>
                        <td className="px-4 py-2 font-medium flex items-center gap-2">
                          {dev.type === 'Deviation' ? (
                            <AlertTriangle size={14} className="text-accent" />
                          ) : (
                            <Info size={14} className="text-primary" />
                          )}
                          {dev.type}
                        </td>
                        <td className="px-4 py-2"><span className="bg-red-100 text-red-800 px-1 py-0.5 rounded break-all">{dev.originalText}</span></td>
                        <td className="px-4 py-2 text-center text-text-muted">{dev.page}</td>
                        <td className="px-4 py-2"><span className="bg-green-100 text-green-800 px-1 py-0.5 rounded break-all">{dev.copyText}</span></td>
                        <td className="px-4 py-2 text-center text-text-muted">{dev.page}</td>
                        <td className="px-4 py-2 text-text-muted italic max-w-md truncate" title={dev.comment}>{dev.comment || '-'}</td>
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
            
            {activeTab !== 'deviations' && (
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
                Currently, <span className="bg-accent/30 font-semibold px-1 rounded text-text-main">{deviations.length}</span> deviations have been identified. 
                You can review each deviation and add comments or accept/reject them. Click "AI Explain" to use Gemini to analyze the specific change context.
                <br /><br />
                The AI confidence score for this comparison is <span className="font-bold text-green-600">{aiConfidence}%</span>.
              </p>
            </div>
            
            <div>
              <h3 className="font-semibold text-sm mb-2 text-primary">Legend</h3>
              <div className="grid grid-cols-1 gap-1.5 text-xs">
                <div className="flex items-center gap-2"><div className="w-3 h-3 bg-green-400 border border-green-600"></div> Selection</div>
                <div className="flex items-center gap-2"><div className="w-3 h-3 bg-accent/60 border border-accent"></div> Mapped Text</div>
                <div className="flex items-center gap-2"><div className="w-3 h-3 bg-orange-400 border border-orange-600"></div> Unmapped Text</div>
                <div className="flex items-center gap-2"><div className="w-3 h-3 bg-yellow-400 border border-yellow-600"></div> Warning</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AnalysisPanel;
