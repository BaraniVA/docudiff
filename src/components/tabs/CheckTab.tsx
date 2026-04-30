import React from 'react';
import { CheckCircle, AlertTriangle, Clock, ShieldCheck, ThumbsUp, ThumbsDown, MessageSquare, History } from 'lucide-react';
import type { Deviation } from '../../App';

interface CheckTabProps {
  deviations: Deviation[];
}

const CheckTab: React.FC<CheckTabProps> = ({ deviations }) => {
  const pendingCount = deviations.filter(d => d.status === 'pending').length;
  const approvedCount = deviations.filter(d => d.status === 'accepted').length;

  return (
    <div className="flex-1 flex overflow-hidden bg-muted p-4 gap-4 h-full">
      {/* Left Column: Pending Approvals Queue */}
      <div className="flex-1 flex flex-col bg-white rounded-lg shadow-sm border border-muted-border overflow-hidden">
        <div className="p-4 border-b border-muted-border bg-gray-50 flex justify-between items-center">
          <div>
            <h2 className="text-lg font-bold text-primary flex items-center gap-2">
              <ShieldCheck size={20} /> Reviewer Dashboard
            </h2>
            <p className="text-sm text-text-muted">Review and validate document changes</p>
          </div>
          <div className="flex gap-2 text-sm font-medium">
            <span className="bg-orange-100 text-orange-800 px-3 py-1 rounded-full">{pendingCount} Pending</span>
            <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full">{approvedCount} Approved</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {deviations.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-text-muted">
              <CheckCircle size={48} className="mb-4 text-green-400 opacity-50" />
              <p className="font-medium text-lg">No deviations to review</p>
              <p className="text-sm">Compare documents first to populate this queue.</p>
            </div>
          ) : (
            deviations.map((dev) => (
              <div key={dev.id} className="border border-muted-border rounded-lg p-4 hover:shadow-md transition-shadow bg-white">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-2">
                    {dev.type === 'Deviation' ? <AlertTriangle size={16} className="text-accent" /> : <Info size={16} className="text-primary" />}
                    <span className="font-semibold text-text-main">{dev.type} on Page {dev.page}</span>
                    <span className="text-xs bg-red-100 text-red-800 px-2 py-0.5 rounded ml-2">High Risk</span>
                  </div>
                  <span className="text-xs text-text-muted flex items-center gap-1"><Clock size={12} /> Just now</span>
                </div>
                
                <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                  <div className="bg-red-50 p-2 rounded border border-red-100">
                    <span className="text-xs text-red-500 font-bold block mb-1">ORIGINAL</span>
                    <span className="line-through text-text-main">{dev.originalText || '(empty)'}</span>
                  </div>
                  <div className="bg-green-50 p-2 rounded border border-green-100">
                    <span className="text-xs text-green-600 font-bold block mb-1">NEW</span>
                    <span className="text-text-main font-medium">{dev.copyText || '(empty)'}</span>
                  </div>
                </div>

                <div className="flex gap-2 items-center">
                  <button className="flex-1 bg-green-600 hover:bg-green-700 text-white py-1.5 rounded flex items-center justify-center gap-2 text-sm font-medium transition-colors">
                    <ThumbsUp size={16} /> Approve
                  </button>
                  <button className="flex-1 bg-white border border-red-200 text-red-600 hover:bg-red-50 py-1.5 rounded flex items-center justify-center gap-2 text-sm font-medium transition-colors">
                    <ThumbsDown size={16} /> Reject
                  </button>
                  <button className="px-3 py-1.5 bg-gray-100 text-gray-700 hover:bg-gray-200 rounded flex items-center justify-center transition-colors">
                    <MessageSquare size={16} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right Column: Workflow & Audit */}
      <div className="w-80 flex flex-col gap-4">
        {/* Validation Checklist */}
        <div className="bg-white rounded-lg shadow-sm border border-muted-border p-4">
          <h3 className="font-bold text-primary mb-3 text-sm">Validation Checklist</h3>
          <ul className="space-y-2 text-sm">
            <li className="flex items-center gap-2 text-green-600"><CheckCircle size={16} /> Regulatory Compliance (FDA)</li>
            <li className="flex items-center gap-2 text-text-main"><div className="w-4 h-4 border rounded border-gray-300"></div> Spelling & Grammar</li>
            <li className="flex items-center gap-2 text-text-main"><div className="w-4 h-4 border rounded border-gray-300"></div> Formatting Consistency</li>
            <li className="flex items-center gap-2 text-text-main"><div className="w-4 h-4 border rounded border-gray-300"></div> Risk Assessment</li>
          </ul>
        </div>

        {/* Audit Trail Timeline */}
        <div className="bg-white rounded-lg shadow-sm border border-muted-border p-4 flex-1 flex flex-col">
          <h3 className="font-bold text-primary mb-3 text-sm flex items-center gap-2">
            <History size={16} /> Audit Trail
          </h3>
          <div className="flex-1 overflow-y-auto pr-2">
            <div className="relative border-l-2 border-muted-border ml-2 space-y-4 pb-4">
              <div className="relative pl-4">
                <div className="absolute w-3 h-3 bg-primary rounded-full -left-[7px] top-1"></div>
                <p className="text-xs text-text-muted">10:45 AM today</p>
                <p className="text-sm font-medium">Comparison generated</p>
                <p className="text-xs text-text-muted mt-1">System user</p>
              </div>
              <div className="relative pl-4">
                <div className="absolute w-3 h-3 bg-green-500 rounded-full -left-[7px] top-1"></div>
                <p className="text-xs text-text-muted">10:47 AM today</p>
                <p className="text-sm font-medium">Automated AI compliance check passed</p>
                <p className="text-xs text-text-muted mt-1">Gemini 3.0 Flash</p>
              </div>
              <div className="relative pl-4 opacity-50">
                <div className="absolute w-3 h-3 border-2 border-muted-border bg-white rounded-full -left-[7px] top-1"></div>
                <p className="text-xs text-text-muted">Pending</p>
                <p className="text-sm font-medium">Manager Approval</p>
              </div>
            </div>
          </div>
          <button className="w-full mt-2 bg-primary/10 text-primary py-2 rounded text-sm font-bold hover:bg-primary/20 transition-colors">
            Generate Audit Report
          </button>
        </div>
      </div>
    </div>
  );
};

// Info icon dummy
const Info = ({ className, size }: { className: string, size: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
);

export default CheckTab;
