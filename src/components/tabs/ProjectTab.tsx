import React from 'react';
import { FolderGit2, Plus, Users, Clock, Filter, MoreHorizontal, FileText, CheckCircle2 } from 'lucide-react';

const ProjectTab: React.FC = () => {
  const projects: any[] = [];

  return (
    <div className="flex-1 flex overflow-hidden bg-muted p-4 gap-4 h-full">
      {/* Main Column: Projects Dashboard */}
      <div className="flex-[2] flex flex-col bg-white rounded-lg shadow-sm border border-muted-border overflow-hidden">
        {/* Header Bar */}
        <div className="p-4 border-b border-muted-border flex justify-between items-center bg-gray-50">
          <div>
            <h2 className="text-lg font-bold text-primary flex items-center gap-2">
              <FolderGit2 size={20} /> Project Dashboard
            </h2>
          </div>
          <div className="flex gap-3">
            <button className="bg-white border border-muted-border text-text-main px-3 py-1.5 rounded flex items-center gap-2 text-sm font-medium hover:bg-gray-50">
              <Filter size={14} /> Filter
            </button>
            <button className="bg-accent text-primary px-4 py-1.5 rounded shadow-sm flex items-center gap-2 text-sm font-bold hover:brightness-105">
              <Plus size={16} /> New Project
            </button>
          </div>
        </div>

        {/* Project Grid */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col">
          {projects.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-text-muted">
              <FolderGit2 size={64} className="mb-4 opacity-20" />
              <h3 className="text-xl font-bold text-primary mb-2">Welcome to DocDiff!</h3>
              <p className="text-sm max-w-md text-center mb-6">You don't have any projects yet. Create your first project to start comparing documents and organizing your workflow.</p>
              <button className="bg-primary text-white px-6 py-2.5 rounded-lg shadow-sm font-bold hover:bg-primary-dark transition-colors flex items-center gap-2">
                <Plus size={18} /> Create New Project
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {projects.map((proj) => (
                <div key={proj.id} className="border border-muted-border rounded-lg p-4 hover:border-primary/50 hover:shadow-md transition-all cursor-pointer group relative">
                  <button className="absolute top-4 right-4 text-gray-400 hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                    <MoreHorizontal size={18} />
                  </button>
                  <div className="flex gap-3 mb-3">
                    <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                      <FileText size={24} />
                    </div>
                    <div>
                      <h3 className="font-bold text-text-main group-hover:text-primary transition-colors">{proj.name}</h3>
                      <span className="text-xs text-text-muted bg-gray-100 px-2 py-0.5 rounded">{proj.type} Template</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between mt-4 pt-3 border-t border-muted-border">
                    <div className="flex items-center gap-4 text-xs text-text-muted">
                      <span className="flex items-center gap-1" title="Documents"><FileText size={14}/> {proj.docs}</span>
                      <span className="flex items-center gap-1" title="Team"><Users size={14}/> {proj.team}</span>
                      <span className="flex items-center gap-1" title="Last Updated"><Clock size={14}/> {proj.updated}</span>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider ${
                      proj.status === 'Active' ? 'bg-blue-100 text-blue-700' :
                      proj.status === 'Review' ? 'bg-orange-100 text-orange-700' :
                      'bg-green-100 text-green-700'
                    }`}>
                      {proj.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right Column: Templates & Details */}
      <div className="flex-1 flex flex-col gap-4 max-w-sm">
        {/* Creation Wizard / Templates */}
        <div className="bg-white rounded-lg shadow-sm border border-muted-border p-4">
          <h3 className="font-bold text-primary text-sm mb-3">Quick Start Templates</h3>
          <div className="grid grid-cols-2 gap-2">
            <button className="p-3 border border-muted-border rounded-lg text-left hover:bg-primary/5 hover:border-primary/30 transition-colors">
              <FileText size={16} className="text-primary mb-2" />
              <div className="text-xs font-bold text-text-main">Legal Contract</div>
              <div className="text-[10px] text-text-muted mt-1">Approval chain + Redline</div>
            </button>
            <button className="p-3 border border-muted-border rounded-lg text-left hover:bg-primary/5 hover:border-primary/30 transition-colors">
              <CheckCircle2 size={16} className="text-green-600 mb-2" />
              <div className="text-xs font-bold text-text-main">Compliance Docs</div>
              <div className="text-[10px] text-text-muted mt-1">Strict QA + Audit Export</div>
            </button>
          </div>
        </div>

        {/* Selected Project Details */}
        <div className="bg-white rounded-lg shadow-sm border border-muted-border p-4 flex-1 flex flex-col">
          <h3 className="font-bold text-primary text-sm mb-4">Project Details</h3>
          <div className="text-center py-6 text-text-muted">
            <FolderGit2 size={32} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">Select a project to view details,<br/>team members, and stats.</p>
          </div>
          
          <div className="mt-auto pt-4 border-t border-muted-border">
            <h4 className="text-xs font-bold text-text-muted mb-2">TEAM COLLABORATION</h4>
            <div className="flex items-center justify-between">
              <div className="flex -space-x-2">
                {[1,2,3].map(i => (
                  <img key={i} src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${i}`} alt="user" className="w-8 h-8 rounded-full border-2 border-white bg-gray-100" />
                ))}
                <div className="w-8 h-8 rounded-full border-2 border-white bg-gray-100 flex items-center justify-center text-xs font-bold text-text-muted">+2</div>
              </div>
              <button className="text-xs font-medium text-primary hover:underline">Manage Team</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProjectTab;
