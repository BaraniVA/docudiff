import React, { useState } from 'react';
import { Upload, FileText, Settings, CheckCircle, AlertCircle, FileSearch, RefreshCw } from 'lucide-react';

const PrepareTab: React.FC = () => {
  const [files] = useState<{name: string, status: 'processing' | 'ready' | 'error', progress: number}[]>([]);

  return (
    <div className="flex-1 flex overflow-hidden bg-muted p-4 gap-4 h-full">
      {/* Left Column: Upload Zone & Queue */}
      <div className="flex-1 flex flex-col gap-4">
        <div className="bg-white rounded-lg shadow-sm border border-dashed border-primary/50 p-8 flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 transition-colors">
          <Upload size={48} className="text-primary opacity-80 mb-4" />
          <h3 className="text-lg font-bold text-primary mb-1">Drag & Drop Documents</h3>
          <p className="text-sm text-text-muted mb-4">Support for PDF, DOCX, PPTX, XLSX, TXT, Images</p>
          <button className="bg-primary text-white px-4 py-2 rounded font-medium text-sm hover:bg-primary-dark transition-colors">
            Browse Files
          </button>
        </div>

        <div className="flex-1 bg-white rounded-lg shadow-sm border border-muted-border p-4 overflow-hidden flex flex-col">
          <h3 className="font-bold text-primary text-sm mb-3">Processing Queue</h3>
          <div className="flex-1 overflow-y-auto pr-2 flex flex-col">
            {files.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-text-muted text-sm italic">
                Upload documents above to begin preprocessing.
              </div>
            ) : (
              <div className="space-y-3">
                {files.map((file, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 border border-muted-border rounded-lg bg-gray-50">
                    <FileText size={24} className={file.status === 'error' ? 'text-red-500' : 'text-primary'} />
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-medium text-sm truncate">{file.name}</span>
                        <span className="text-xs font-semibold text-text-muted">{file.progress}%</span>
                      </div>
                      <div className="h-1.5 w-full bg-gray-200 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full ${file.status === 'ready' ? 'bg-green-500' : file.status === 'error' ? 'bg-red-500' : 'bg-primary'}`} 
                          style={{ width: `${file.progress}%` }}
                        ></div>
                      </div>
                    </div>
                    <div>
                      {file.status === 'ready' && <CheckCircle size={20} className="text-green-500" />}
                      {file.status === 'processing' && <RefreshCw size={20} className="text-primary animate-spin" />}
                      {file.status === 'error' && <AlertCircle size={20} className="text-red-500" />}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Center: Processing Options */}
      <div className="flex-1 flex flex-col bg-white rounded-lg shadow-sm border border-muted-border overflow-hidden p-4">
        <h2 className="text-lg font-bold text-primary mb-4 flex items-center gap-2">
          <Settings size={20} /> Document Normalization
        </h2>
        
        <div className="space-y-4">
          <div className="p-3 border border-muted-border rounded-lg">
            <h4 className="font-semibold text-sm mb-2">OCR & Text Extraction</h4>
            <label className="flex items-center gap-2 text-sm text-text-main cursor-pointer mb-2">
              <input type="checkbox" className="rounded text-primary" defaultChecked /> Auto-detect scanned PDFs
            </label>
            <label className="flex items-center gap-2 text-sm text-text-main cursor-pointer">
              <input type="checkbox" className="rounded text-primary" defaultChecked /> Extract text from embedded images
            </label>
          </div>

          <div className="p-3 border border-muted-border rounded-lg">
            <h4 className="font-semibold text-sm mb-2">Document Cleaning</h4>
            <label className="flex items-center gap-2 text-sm text-text-main cursor-pointer mb-2">
              <input type="checkbox" className="rounded text-primary" defaultChecked /> Remove Headers & Footers
            </label>
            <label className="flex items-center gap-2 text-sm text-text-main cursor-pointer mb-2">
              <input type="checkbox" className="rounded text-primary" defaultChecked /> Normalize whitespace and fonts
            </label>
            <label className="flex items-center gap-2 text-sm text-text-main cursor-pointer">
              <input type="checkbox" className="rounded text-primary" /> Auto-accept track changes before compare
            </label>
          </div>
        </div>
      </div>

      {/* Right: QA Checklist */}
      <div className="w-80 bg-white rounded-lg shadow-sm border border-muted-border p-4 flex flex-col">
        <h3 className="font-bold text-primary text-sm mb-4 flex items-center gap-2">
          <FileSearch size={16} /> Quality Assurance
        </h3>
        
        <div className="flex-1 space-y-4">
          <div className="bg-green-50 text-green-800 p-3 rounded border border-green-100 text-sm">
            <div className="flex justify-between items-center mb-1">
              <span className="font-bold">File Integrity</span>
              <CheckCircle size={14} />
            </div>
            <p className="text-xs">All files passed corruption check.</p>
          </div>

          <div className="bg-yellow-50 text-yellow-800 p-3 rounded border border-yellow-100 text-sm">
            <div className="flex justify-between items-center mb-1">
              <span className="font-bold">Encoding Check</span>
              <AlertCircle size={14} />
            </div>
            <p className="text-xs">Detected potential encoding issues in v2.docx (processing).</p>
          </div>
        </div>

        <button className="w-full bg-accent text-primary font-bold py-3 rounded-lg shadow-sm mt-4 hover:brightness-105 transition-all">
          Ready for Comparison
        </button>
      </div>
    </div>
  );
};

export default PrepareTab;
