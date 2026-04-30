import { Settings, User, FileText, Upload, LayoutTemplate, CheckCircle, Download, Save as SaveIcon } from 'lucide-react';
import React from 'react';

export type TabType = 'project' | 'prepare' | 'compare' | 'check' | 'export' | 'save';

interface HeaderProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
}

const Header: React.FC<HeaderProps> = ({ activeTab, setActiveTab }) => {
  const tabs = [
    { id: 'project', label: 'Project', icon: FileText },
    { id: 'prepare', label: 'Prepare', icon: Upload },
    { id: 'compare', label: 'Compare', icon: LayoutTemplate },
    { id: 'check', label: 'Check', icon: CheckCircle },
    { id: 'export', label: 'Export', icon: Download },
    { id: 'save', label: 'Save', icon: SaveIcon },
  ] as const;

  return (
    <header className="bg-primary text-secondary flex items-center justify-between px-4 py-2 border-b border-primary-dark shadow-sm">
      <div className="flex items-center gap-4">
        <div className="bg-white rounded-full p-1 flex items-center justify-center h-10 w-10">
          <img 
            src="https://api.dicebear.com/7.x/shapes/svg?seed=SchlafenderHase&backgroundColor=003366" 
            alt="Schlafender Hase Logo" 
            className="h-8 w-8 rounded-full" 
          />
        </div>
        <div>
          <h1 className="font-bold text-lg leading-tight">TVT</h1>
          <p className="text-xs text-secondary/80">Schlafender Hase</p>
        </div>
      </div>

      <nav className="flex space-x-1">
        {tabs.map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button 
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors text-sm font-medium ${
                isActive ? 'bg-accent text-primary font-bold shadow-sm' : 'hover:bg-white/10 text-secondary'
              }`}
            >
              <tab.icon size={16} /> {tab.label}
            </button>
          );
        })}
      </nav>

      <div className="flex items-center gap-3">
        <button className="p-2 hover:bg-white/10 rounded-full transition-colors">
          <Settings size={20} />
        </button>
        <button className="p-2 hover:bg-white/10 rounded-full transition-colors">
          <User size={20} />
        </button>
      </div>
    </header>
  );
};

export default Header;
