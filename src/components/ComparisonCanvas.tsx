import React, { useEffect, useRef, useState } from 'react';
import { ZoomIn, ZoomOut, Maximize, Upload, Eye, GitCompare } from 'lucide-react';
import { renderAsync } from 'docx-preview';
import type { ParseResult } from '../utils/fileParser';

type ViewMode = 'original' | 'diff';

interface ComparisonCanvasProps {
  originalDiffHtml: string;
  copyDiffHtml: string;
  originalDisplay: ParseResult | null;
  copyDisplay: ParseResult | null;
  onUploadOriginal: (file: File) => void;
  onUploadCopy: (file: File) => void;
}

// Render DOCX inside a shadow root so app CSS cannot alter Word layout.
// Keep Word's native page width instead of fitting to the pane.
const DocxViewer: React.FC<{ data: ArrayBuffer }> = ({ data }) => {
  const outerRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const styleRef = useRef<HTMLDivElement | null>(null);
  const [isRendering, setIsRendering] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hostRef.current || hostRef.current.shadowRoot) return;

    const shadowRoot = hostRef.current.attachShadow({ mode: 'open' });
    const baseStyle = document.createElement('style');
    baseStyle.textContent = `
      :host {
        display: block;
      }

      .docx-shell {
        min-width: fit-content;
      }

      .docx-page-wrapper {
        background: white !important;
        padding: 0 !important;
      }

      .docx-page-wrapper > section.docx-page {
        box-shadow: none !important;
        margin: 0 auto 16px !important;
      }
    `;

    const styleContainer = document.createElement('div');
    const bodyContainer = document.createElement('div');
    bodyContainer.className = 'docx-shell';

    shadowRoot.appendChild(baseStyle);
    shadowRoot.appendChild(styleContainer);
    shadowRoot.appendChild(bodyContainer);

    styleRef.current = styleContainer;
    bodyRef.current = bodyContainer;
  }, []);

  useEffect(() => {
    if (!bodyRef.current || !styleRef.current || !data) return;
    let cancelled = false;

    setIsRendering(true);
    setError(null);

    renderAsync(data, bodyRef.current, styleRef.current, {
      className: 'docx-page',
      inWrapper: true,
      ignoreWidth: false,
      ignoreHeight: false,
      ignoreFonts: false,
      breakPages: true,
      ignoreLastRenderedPageBreak: false,
      experimental: false,
      trimXmlDeclaration: true,
      useBase64URL: true,
      renderHeaders: true,
      renderFooters: true,
      renderFootnotes: true,
      renderEndnotes: true,
    }).then(() => {
      if (cancelled) return;
      setIsRendering(false);
    }).catch((err) => {
      if (!cancelled) {
        setError((err as Error).message);
        setIsRendering(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [data]);

  return (
    <div ref={outerRef} className="docx-viewer-host">
      {isRendering && <div className="docx-viewer-loading">Rendering document...</div>}
      {error && <div className="docx-viewer-error">Failed to render: {error}</div>}
      <div ref={hostRef} />
    </div>
  );
};

const CanvasToolBar = ({
  title,
  onUploadClick,
  showViewToggle,
  viewMode,
  onViewModeChange,
  zoom,
  onZoomChange,
}: {
  title: string;
  onUploadClick: () => void;
  showViewToggle: boolean;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  zoom: number;
  onZoomChange: (zoom: number) => void;
}) => (
  <div className="flex items-center justify-between px-3 py-2 bg-white border-b border-muted-border shadow-sm flex-shrink-0">
    <div className="flex items-center gap-2">
      <span className="font-semibold text-sm text-primary">{title}</span>
      <div className="h-4 w-px bg-muted-border mx-2"></div>
      <button onClick={onUploadClick} className="p-1 hover:bg-muted rounded text-text-muted hover:text-primary transition-colors flex items-center gap-1 text-xs font-medium">
        <Upload size={14} /> Upload
      </button>
    </div>
    <div className="flex items-center gap-3 text-sm text-text-muted">
      {showViewToggle && (
        <div className="flex items-center bg-muted rounded-md overflow-hidden border border-muted-border mr-2">
          <button
            onClick={() => onViewModeChange('original')}
            className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium transition-colors ${viewMode === 'original' ? 'bg-primary text-white' : 'text-text-muted hover:text-primary'}`}
          >
            <Eye size={12} /> Original
          </button>
          <button
            onClick={() => onViewModeChange('diff')}
            className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium transition-colors ${viewMode === 'diff' ? 'bg-primary text-white' : 'text-text-muted hover:text-primary'}`}
          >
            <GitCompare size={12} /> Diff
          </button>
        </div>
      )}
      <div className="flex items-center gap-1 bg-muted px-2 py-1 rounded-md">
        <button onClick={() => onZoomChange(Math.max(50, zoom - 10))} className="hover:text-primary"><ZoomOut size={14} /></button>
        <span className="w-12 text-center font-mono">{zoom}%</span>
        <button onClick={() => onZoomChange(Math.min(200, zoom + 10))} className="hover:text-primary"><ZoomIn size={14} /></button>
      </div>
      <button className="p-1 hover:bg-muted rounded transition-colors hover:text-primary"><Maximize size={16} /></button>
    </div>
  </div>
);

const DocumentPane = ({
  title,
  display,
  inputRef,
  onUpload,
  onDrop,
  showViewToggle,
  viewMode,
  onViewModeChange,
  zoom,
  onZoomChange,
  children,
}: {
  title: string;
  display: ParseResult | null;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onUpload: (f: File) => void;
  onDrop: (e: React.DragEvent) => void;
  showViewToggle: boolean;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  children: React.ReactNode;
}) => (
  <div className="flex-1 flex flex-col min-w-0 border border-muted-border rounded-md overflow-hidden bg-white shadow-sm">
    <CanvasToolBar
      title={title}
      onUploadClick={() => inputRef.current?.click()}
      showViewToggle={showViewToggle}
      viewMode={viewMode}
      onViewModeChange={onViewModeChange}
      zoom={zoom}
      onZoomChange={onZoomChange}
    />
    <input
      type="file"
      className="hidden"
      ref={inputRef as React.RefObject<HTMLInputElement>}
      onChange={(e) => { if (e.target.files?.[0]) onUpload(e.target.files[0]); }}
      accept=".txt,.pdf,.docx"
    />

    <div
      className="flex-1 overflow-auto relative"
      style={{ background: 'var(--color-muted)' }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      {!display ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-text-muted">
          <Upload size={48} className="mb-4 opacity-50" />
          <p className="font-medium text-lg mb-2">Drag and drop file here</p>
          <p className="text-sm">or click Upload in the toolbar</p>
          <p className="text-xs mt-2 opacity-75">Supports TXT, PDF, DOCX</p>
        </div>
      ) : (
        children
      )}
    </div>
  </div>
);

const ComparisonCanvas: React.FC<ComparisonCanvasProps> = ({
  originalDiffHtml,
  copyDiffHtml,
  originalDisplay,
  copyDisplay,
  onUploadOriginal,
  onUploadCopy
}) => {
  const [zoom, setZoom] = useState(100);
  const [viewMode, setViewMode] = useState<ViewMode>('original');
  const originalInputRef = useRef<HTMLInputElement>(null);
  const copyInputRef = useRef<HTMLInputElement>(null);

  const handleFileDrop = (e: React.DragEvent, callback: (f: File) => void) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      callback(e.dataTransfer.files[0]);
    }
  };

  React.useEffect(() => {
    const handleScrollToDev = (event: Event) => {
      const e = event as CustomEvent<{ id: string }>;
      setViewMode('diff');
      setTimeout(() => {
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
      }, 100);
    };

    window.addEventListener('scroll-to-dev', handleScrollToDev);
    return () => window.removeEventListener('scroll-to-dev', handleScrollToDev);
  }, []);

  const hasBothDocs = originalDisplay && copyDisplay;

  const renderContent = (display: ParseResult | null, diffHtml: string) => {
    if (!display) return null;

    const showDiff = viewMode === 'diff' && diffHtml;

    if (showDiff) {
      return (
        <div className="bg-white p-8 doc-content whitespace-pre-wrap" style={{ minWidth: '100%' }}>
          <div dangerouslySetInnerHTML={{ __html: diffHtml }} />
        </div>
      );
    }

    if (display.displayType === 'pdf') {
      return (
        <iframe
          src={display.displayContent + '#toolbar=0'}
          className="w-full h-full border-0 block"
          title={display.fileName}
        />
      );
    }

    if (display.displayType === 'docx' && display.rawFileData) {
      return <DocxViewer data={display.rawFileData} />;
    }

    return (
      <div className="bg-white p-8 doc-content whitespace-pre-wrap font-mono text-sm" style={{ minWidth: '100%' }}>
        {display.displayContent}
      </div>
    );
  };

  return (
    <div className="flex h-full w-full bg-muted gap-1 overflow-hidden p-1">
      <DocumentPane
        title="Original Document"
        display={originalDisplay}
        inputRef={originalInputRef}
        onUpload={onUploadOriginal}
        onDrop={(e) => handleFileDrop(e, onUploadOriginal)}
        showViewToggle={Boolean(hasBothDocs)}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        zoom={zoom}
        onZoomChange={setZoom}
      >
        {renderContent(originalDisplay, originalDiffHtml)}
      </DocumentPane>
      <DocumentPane
        title="Copy Document"
        display={copyDisplay}
        inputRef={copyInputRef}
        onUpload={onUploadCopy}
        onDrop={(e) => handleFileDrop(e, onUploadCopy)}
        showViewToggle={Boolean(hasBothDocs)}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        zoom={zoom}
        onZoomChange={setZoom}
      >
        {renderContent(copyDisplay, copyDiffHtml)}
      </DocumentPane>
    </div>
  );
};

export default ComparisonCanvas;
