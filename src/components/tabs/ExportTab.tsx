import React, { useState } from 'react';
import { Download, Mail, Link as LinkIcon, Settings, LayoutTemplate, Share2, FileBarChart, FileText, WandSparkles } from 'lucide-react';

interface ExportTabProps {
  canFixAndDownload: boolean;
  originalFileName?: string;
  copyFileName?: string;
  fixedDownloadUrl?: string;
  fixedDownloadFileName?: string;
  deviationCount: number;
  onFixAndDownload: () => void;
  onDownloadDifferences: () => void;
}

const ExportTab: React.FC<ExportTabProps> = ({
  canFixAndDownload,
  originalFileName,
  copyFileName,
  fixedDownloadUrl,
  fixedDownloadFileName,
  deviationCount,
  onFixAndDownload,
  onDownloadDifferences,
}) => {
  const [selectedFormat, setSelectedFormat] = useState('pdf');

  return (
    <div className="flex-1 flex overflow-hidden bg-muted p-4 gap-4 h-full">
      {/* Left: Customization Options */}
      <div className="w-80 flex flex-col gap-4">
        <div className="bg-white rounded-lg shadow-sm border border-muted-border p-4">
          <h3 className="font-bold text-primary text-sm mb-4 flex items-center gap-2">
            <LayoutTemplate size={16} /> Report Templates
          </h3>
          <select className="w-full border border-muted-border rounded p-2 text-sm focus:outline-none focus:border-primary">
            <option>Executive Summary (Legal)</option>
            <option>Detailed Technical Diff</option>
            <option>Compliance Audit Report</option>
            <option>Custom Template 1</option>
          </select>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-muted-border p-4 flex-1 flex flex-col">
          <h3 className="font-bold text-primary text-sm mb-4 flex items-center gap-2">
            <Settings size={16} /> Export Settings
          </h3>
          
          <div className="space-y-4 overflow-y-auto pr-2 flex-1">
            <div>
              <label className="text-xs font-semibold text-text-muted mb-2 block">INCLUDE SECTIONS</label>
              <div className="space-y-2 text-sm">
                <label className="flex items-center gap-2"><input type="checkbox" defaultChecked className="text-primary rounded"/> Executive Summary (AI)</label>
                <label className="flex items-center gap-2"><input type="checkbox" defaultChecked className="text-primary rounded"/> Detailed Change Log</label>
                <label className="flex items-center gap-2"><input type="checkbox" defaultChecked className="text-primary rounded"/> Side-by-Side Visual Diff</label>
                <label className="flex items-center gap-2"><input type="checkbox" defaultChecked className="text-primary rounded"/> Approval Audit Trail</label>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-text-muted mb-2 block">ADVANCED</label>
              <div className="space-y-2 text-sm">
                <label className="flex items-center gap-2"><input type="checkbox" defaultChecked className="text-primary rounded"/> Include Risk Assessments</label>
                <label className="flex items-center gap-2"><input type="checkbox" className="text-primary rounded"/> Redact Sensitive Info (PII)</label>
                <label className="flex items-center gap-2"><input type="checkbox" className="text-primary rounded"/> Watermark "CONFIDENTIAL"</label>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Center: Report Preview */}
      <div className="flex-1 bg-white rounded-lg shadow-sm border border-muted-border p-4 flex flex-col items-center justify-center bg-gray-50 relative overflow-hidden">
        <div className="absolute top-4 left-4 flex gap-2">
          {['pdf', 'docx', 'xlsx', 'html'].map(fmt => (
            <button 
              key={fmt}
              onClick={() => setSelectedFormat(fmt)}
              className={`px-3 py-1 text-xs font-bold uppercase rounded border ${selectedFormat === fmt ? 'bg-primary text-white border-primary' : 'bg-white text-text-muted border-muted-border hover:bg-gray-100'}`}
            >
              {fmt}
            </button>
          ))}
        </div>
        
        <div className="w-full max-w-lg aspect-[1/1.4] bg-white shadow-xl border border-gray-200 mt-8 p-8 flex flex-col items-center justify-center text-center text-text-muted">
          <FileText size={48} className="mb-4 opacity-20" />
          <p className="font-medium text-lg text-primary mb-2">
            {canFixAndDownload ? 'Corrected Copy Ready' : 'No Comparison Data'}
          </p>
          <p className="text-sm">
            {canFixAndDownload
              ? `${copyFileName ?? 'Copy document'} can be fixed to match ${originalFileName ?? 'the original document'}.`
              : 'Please compare documents in the "Compare" tab first to generate a report preview.'}
          </p>
          {canFixAndDownload && (
            <p className="text-xs mt-3 text-text-muted">
              {deviationCount} difference{deviationCount === 1 ? '' : 's'} will be replaced with the original document content and formatting.
            </p>
          )}
        </div>
        <p className="mt-4 text-sm text-text-muted flex items-center gap-2"><FileBarChart size={16}/> Previewing Executive Summary ({selectedFormat.toUpperCase()})</p>
      </div>

      {/* Right: Actions */}
      <div className="w-80 bg-white rounded-lg shadow-sm border border-muted-border p-4 flex flex-col">
        <h3 className="font-bold text-primary text-sm mb-4 flex items-center gap-2">
          <Share2 size={16} /> Distribution
        </h3>

        <div className="space-y-3 mb-8">
          <button
            type="button"
            onClick={onFixAndDownload}
            disabled={!canFixAndDownload}
            className="w-full bg-primary text-white font-bold py-3 rounded-lg shadow-sm flex items-center justify-center gap-2 hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <WandSparkles size={18} /> Fix Copy & Download
          </button>
          <button
            type="button"
            onClick={onFixAndDownload}
            disabled={!canFixAndDownload}
            className="w-full bg-accent text-primary font-bold py-3 rounded-lg shadow-sm flex items-center justify-center gap-2 hover:brightness-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download size={18} /> Download Fixed File
          </button>
          <button
            type="button"
            onClick={onDownloadDifferences}
            disabled={deviationCount === 0}
            className="w-full bg-white border border-primary/30 text-primary py-2.5 rounded shadow-sm font-bold flex items-center justify-center gap-2 hover:bg-primary/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download size={18} /> Download Differences
          </button>
          {fixedDownloadUrl && (
            <a
              href={fixedDownloadUrl}
              download={fixedDownloadFileName}
              className="block text-xs font-semibold text-primary underline text-center"
            >
              Download did not start? Click here
            </a>
          )}
          <button className="w-full bg-white border border-muted-border text-text-main py-2.5 rounded shadow-sm font-medium flex items-center justify-center gap-2 hover:bg-gray-50 transition-colors">
            <Mail size={18} /> Email Report
          </button>
          <button className="w-full bg-white border border-muted-border text-text-main py-2.5 rounded shadow-sm font-medium flex items-center justify-center gap-2 hover:bg-gray-50 transition-colors">
            <LinkIcon size={18} /> Generate Secure Link
          </button>
        </div>

        <h3 className="font-bold text-primary text-sm mb-3">Batch Operations</h3>
        <p className="text-xs text-text-muted mb-3 leading-relaxed">
          Need to export multiple reports? Select multiple comparisons from the Save tab to run a batch export.
        </p>
        <button className="w-full border border-primary/30 text-primary py-2 rounded text-sm font-medium hover:bg-primary/5 transition-colors">
          Configure Batch Export
        </button>
      </div>
    </div>
  );
};

export default ExportTab;
