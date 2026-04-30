import React, { useState, useRef } from 'react';
import { ZoomIn, ZoomOut, Maximize, MousePointer2, Type, FileSearch, Upload } from 'lucide-react';

interface ComparisonCanvasProps {
  originalHtml: string;
  copyHtml: string;
  onUploadOriginal: (file: File) => void;
  onUploadCopy: (file: File) => void;
}

const ComparisonCanvas: React.FC<ComparisonCanvasProps> = ({ 
  originalHtml, 
  copyHtml,
  onUploadOriginal,
  onUploadCopy
}) => {
  const [zoom, setZoom] = useState(100);
  const originalInputRef = useRef<HTMLInputElement>(null);
  const copyInputRef = useRef<HTMLInputElement>(null);

  const handleFileDrop = (e: React.DragEvent, callback: (f: File) => void) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      callback(e.dataTransfer.files[0]);
    }
  };

  React.useEffect(() => {
    const handleScrollToDev = (e: any) => {
      const devId = e.detail.id;
      const originalEl = document.getElementById(`dev-original-${devId}`);
      const copyEl = document.getElementById(`dev-copy-${devId}`);
      
      const highlightEl = (el: HTMLElement) => {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.style.backgroundColor = '#ffeb3b';
        el.style.boxShadow = '0 0 0 4px #ffeb3b';
        setTimeout(() => {
          el.style.backgroundColor = 'rgba(255, 165, 0, 0.4)';
          el.style.boxShadow = 'none';
        }, 2000);
      };

      if (originalEl) highlightEl(originalEl);
      if (copyEl) highlightEl(copyEl);
    };

    window.addEventListener('scroll-to-dev', handleScrollToDev);
    return () => window.removeEventListener('scroll-to-dev', handleScrollToDev);
  }, []);

  const ToolBar = ({ title, onUploadClick }: { title: string, onUploadClick: () => void }) => (
    <div className="flex items-center justify-between px-3 py-2 bg-white border-b border-muted-border shadow-sm">
      <div className="flex items-center gap-2">
        <span className="font-semibold text-sm text-primary">{title}</span>
        <div className="h-4 w-px bg-muted-border mx-2"></div>
        <button onClick={onUploadClick} className="p-1 hover:bg-muted rounded text-text-muted hover:text-primary transition-colors flex items-center gap-1 text-xs font-medium">
          <Upload size={14} /> Upload
        </button>
        <button className="p-1 hover:bg-muted rounded text-text-muted hover:text-primary transition-colors"><MousePointer2 size={16} /></button>
        <button className="p-1 hover:bg-muted rounded text-text-muted hover:text-primary transition-colors"><Type size={16} /></button>
        <button className="p-1 hover:bg-muted rounded text-text-muted hover:text-primary transition-colors"><FileSearch size={16} /></button>
      </div>
      <div className="flex items-center gap-3 text-sm text-text-muted">
        <div className="flex items-center gap-1 bg-muted px-2 py-1 rounded-md">
          <button onClick={() => setZoom(Math.max(50, zoom - 10))} className="hover:text-primary"><ZoomOut size={14} /></button>
          <span className="w-12 text-center font-mono">{zoom}%</span>
          <button onClick={() => setZoom(Math.min(200, zoom + 10))} className="hover:text-primary"><ZoomIn size={14} /></button>
        </div>
        <button className="p-1 hover:bg-muted rounded transition-colors hover:text-primary"><Maximize size={16} /></button>
      </div>
    </div>
  );

  const DocumentPane = ({ 
    title, 
    htmlContent, 
    inputRef, 
    onUpload, 
    onDrop 
  }: { 
    title: string; 
    htmlContent: string; 
    inputRef: React.RefObject<HTMLInputElement | null>; 
    onUpload: (f: File) => void;
    onDrop: (e: React.DragEvent) => void;
  }) => (
    <div className="flex-1 flex flex-col bg-white rounded-md shadow-sm overflow-hidden border border-muted-border">
      <ToolBar title={title} onUploadClick={() => inputRef.current?.click()} />
      <input 
        type="file" 
        className="hidden" 
        ref={inputRef as React.RefObject<HTMLInputElement>}
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            onUpload(e.target.files[0]);
          }
        }}
        accept=".txt,.pdf,.docx"
      />
      
      <div 
        className="flex-1 overflow-auto bg-muted p-4 md:p-8 flex justify-center relative"
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
      >
        {!htmlContent ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-text-muted">
            <Upload size={48} className="mb-4 opacity-50" />
            <p className="font-medium text-lg mb-2">Drag and drop file here</p>
            <p className="text-sm">or click Upload in the toolbar</p>
            <p className="text-xs mt-2 opacity-75">Supports TXT, PDF, DOCX</p>
          </div>
        ) : (
          <div 
            className="bg-white shadow-md p-8 md:p-12 doc-content origin-top transition-transform whitespace-pre-wrap"
            style={{ 
              width: '100%', 
              maxWidth: '800px', 
              minHeight: '100%',
              transform: `scale(${zoom / 100})`,
              transformOrigin: 'top center'
            }}
          >
            <div dangerouslySetInnerHTML={{ __html: htmlContent }} />
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex h-full w-full bg-muted gap-1 overflow-hidden p-1">
      <DocumentPane 
        title="Original Document" 
        htmlContent={originalHtml} 
        inputRef={originalInputRef}
        onUpload={onUploadOriginal}
        onDrop={(e) => handleFileDrop(e, onUploadOriginal)}
      />
      <DocumentPane 
        title="Copy Document" 
        htmlContent={copyHtml} 
        inputRef={copyInputRef}
        onUpload={onUploadCopy}
        onDrop={(e) => handleFileDrop(e, onUploadCopy)}
      />
    </div>
  );
};

export default ComparisonCanvas;
