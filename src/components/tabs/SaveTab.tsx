import React from 'react';
import { Folder, FileText, Search, Cloud } from 'lucide-react';

const SaveTab: React.FC = () => {
  return (
    <div className="flex-1 flex overflow-hidden bg-muted p-4 gap-4 h-full">
      {/* Left: Folder Hierarchy */}
      <div className="w-64 bg-white rounded-lg shadow-sm border border-muted-border p-4 flex flex-col">
        <h3 className="font-bold text-primary text-sm mb-4">Library</h3>
        <div className="space-y-1 overflow-y-auto">
          {['All Projects', 'Legal Contracts', 'Compliance Docs', 'Technical Manuals', 'Marketing', 'Archive'].map((folder, i) => (
            <button key={i} className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left ${i === 1 ? 'bg-primary/10 text-primary font-medium' : 'text-text-muted hover:bg-gray-50'}`}>
              <Folder size={16} className={i === 1 ? "fill-primary/20" : ""} /> {folder}
            </button>
          ))}
        </div>
        <div className="mt-auto pt-4 border-t border-muted-border">
          <div className="flex justify-between text-xs text-text-muted mb-1">
            <span>Storage Usage</span>
            <span>45%</span>
          </div>
          <div className="h-1.5 w-full bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-accent rounded-full" style={{ width: '45%' }}></div>
          </div>
        </div>
      </div>

      {/* Center: Document Grid */}
      <div className="flex-1 flex flex-col bg-white rounded-lg shadow-sm border border-muted-border overflow-hidden p-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold text-primary">Legal Contracts</h2>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" placeholder="Search documents..." className="pl-8 pr-4 py-1.5 text-sm border border-muted-border rounded-md focus:outline-none focus:border-primary" />
            </div>
            <button className="bg-primary text-white px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-2 hover:bg-primary-dark">
              <Cloud size={14} /> Save to Cloud
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pr-2 pb-4 flex flex-col">
          <div className="flex-1 flex flex-col items-center justify-center text-text-muted">
            <Folder size={48} className="mb-4 opacity-20" />
            <p className="text-sm font-medium">This folder is empty.</p>
            <p className="text-xs">Saved comparisons and documents will appear here.</p>
          </div>
        </div>
      </div>

      {/* Right: Details & Version History */}
      <div className="w-80 bg-white rounded-lg shadow-sm border border-muted-border p-4 flex flex-col">
        <h3 className="font-bold text-primary text-sm mb-4">Document Details</h3>
        <div className="flex-1 flex flex-col items-center justify-center text-center text-text-muted">
          <FileText size={48} className="mb-4 opacity-20" />
          <p className="text-sm">Select a document to view details,<br/>versions, and access control.</p>
        </div>
      </div>
    </div>
  );
};

export default SaveTab;
