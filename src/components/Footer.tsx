import React from 'react';
import { Activity, Clock } from 'lucide-react';

interface FooterProps {
  wordsOriginal: number;
  wordsCopy: number;
}

const Footer: React.FC<FooterProps> = ({ wordsOriginal = 0, wordsCopy = 0 }) => {
  return (
    <footer className="bg-white border-t border-muted-border flex items-center justify-between px-4 py-1.5 text-xs text-text-muted shadow-sm">
      <div className="flex items-center gap-4">
        <span className="font-medium text-text-main">Project ready</span>
        <div className="h-3 w-px bg-muted-border"></div>
        <span>Leaflets Project</span>
      </div>
      
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1">
          <Activity size={14} className="text-accent" />
          Words in Original: <span className="font-semibold text-text-main">{wordsOriginal}</span>
        </span>
        <span className="flex items-center gap-1">
          <Activity size={14} className="text-accent" />
          Words in Copy: <span className="font-semibold text-text-main">{wordsCopy}</span>
        </span>
        <div className="h-3 w-px bg-muted-border"></div>
        <span className="flex items-center gap-1">
          <Clock size={14} />
          Last Check: Just now
        </span>
      </div>
    </footer>
  );
};

export default Footer;
