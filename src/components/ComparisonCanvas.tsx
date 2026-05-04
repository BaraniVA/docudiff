import React, { useEffect, useRef, useState } from 'react';
import { ZoomIn, ZoomOut, Maximize, Upload, Eye, GitCompare } from 'lucide-react';
import { renderAsync } from 'docx-preview';
import * as pdfjsLib from 'pdfjs-dist';
import type { ParseResult } from '../utils/fileParser';
import type { DiffResult } from '../utils/diffEngine';

type ViewMode = 'original' | 'diff';

interface DiffRenderBoundaryProps {
  resetKey: string;
  children: React.ReactNode;
}

interface DiffRenderBoundaryState {
  hasError: boolean;
}

class DiffRenderBoundary extends React.Component<DiffRenderBoundaryProps, DiffRenderBoundaryState> {
  state: DiffRenderBoundaryState = { hasError: false };

  static getDerivedStateFromError(): DiffRenderBoundaryState {
    return { hasError: true };
  }

  componentDidUpdate(prevProps: DiffRenderBoundaryProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  componentDidCatch(error: unknown) {
    console.error('Document render failed:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="m-4 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          This document view could not be rendered. Switch back to Original, then try Diff again.
        </div>
      );
    }

    return this.props.children;
  }
}

interface ComparisonCanvasProps {
  originalDiffHtml: string;
  copyDiffHtml: string;
  originalDisplay: ParseResult | null;
  copyDisplay: ParseResult | null;
  diffs: DiffResult[];
  onUploadOriginal: (file: File) => void;
  onUploadCopy: (file: File) => void;
}

// ── PDF Canvas Renderer ──────────────────────────────────────────────────────
// Renders PDF pages using pdf.js canvas API (preserving native look) and
// overlays a text layer for text selection + deviation highlighting.

interface PdfCanvasViewerProps {
  pdfData: ArrayBuffer;
  zoom: number;
  side: 'original' | 'copy';
  diffs: DiffResult[];
  showHighlights: boolean;
}

interface RenderedPage {
  pageNum: number;
  canvas: HTMLCanvasElement;
  textLayerDiv: HTMLDivElement;
  viewport: { width: number; height: number };
}

interface DeviationHighlightTarget {
  text: string;
  type: 'added' | 'removed';
  id?: string;
  page?: number;
}

function diffTextForSide(diff: DiffResult, side: 'original' | 'copy'): string {
  return side === 'original'
    ? diff.originalValue ?? diff.value
    : diff.copyValue ?? diff.value;
}

function normalizeHighlightText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function isSymbolLike(value: string): boolean {
  const codePoint = [...value][0]?.codePointAt(0);
  if (!codePoint) return false;
  return codePoint >= 0x2000 || (codePoint >= 0xE000 && codePoint <= 0xF8FF);
}

function shouldMatchHighlight(spanText: string, targetText: string): boolean {
  const span = normalizeHighlightText(spanText);
  const target = normalizeHighlightText(targetText);

  if (!span || !target) return false;
  if (target.length === 1 && /[\p{L}\p{N}]/u.test(target) && !isSymbolLike(target)) return false;

  return span.includes(target) || target.includes(span);
}

function cssEscape(value: string): string {
  return typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(value)
    : value.replace(/["\\]/g, '\\$&');
}

const PdfCanvasViewer: React.FC<PdfCanvasViewerProps> = ({
  pdfData,
  zoom,
  side,
  diffs,
  showHighlights,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pages, setPages] = useState<RenderedPage[]>([]);
  const [isRendering, setIsRendering] = useState(true);

  // Load the PDF document
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const pdfBytes = new Uint8Array(pdfData.slice(0));
        const loadingTask = pdfjsLib.getDocument({ data: pdfBytes });
        const doc = await loadingTask.promise;
        if (!cancelled) setPdf(doc);
      } catch (err) {
        console.error('Failed to load PDF:', err);
        if (!cancelled) setIsRendering(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [pdfData]);

  // Render all pages when PDF loads or zoom changes
  useEffect(() => {
    if (!pdf || !containerRef.current) return;
    let cancelled = false;
    setIsRendering(true);

    const renderPages = async () => {
      try {
        const scale = zoom / 100;
        const rendered: RenderedPage[] = [];

        for (let i = 1; i <= pdf.numPages; i++) {
          if (cancelled) return;
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale });

          // Create canvas
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('Could not create PDF canvas context');
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = `${Math.floor(viewport.width)}px`;
          canvas.style.height = `${Math.floor(viewport.height)}px`;

          await page.render({ canvas, canvasContext: ctx, viewport }).promise;

          // Create text layer with manually positioned spans
          // (works across all pdf.js versions without relying on TextLayer class)
          const textLayerDiv = document.createElement('div');
          textLayerDiv.className = 'pdf-text-layer';
          textLayerDiv.style.width = `${Math.floor(viewport.width)}px`;
          textLayerDiv.style.height = `${Math.floor(viewport.height)}px`;

          const textContent = await page.getTextContent();
          for (const item of textContent.items as Array<{ str: string; transform: number[]; width?: number; height?: number }>) {
            if (!item.str) continue;
            const span = document.createElement('span');
            span.textContent = item.str;

            // Transform from PDF coordinate space to viewport
            const tx = item.transform[4];
            const ty = item.transform[5];
            const fontSize = Math.abs(item.transform[3] || item.transform[0] || 10);

            // Convert to viewport coordinates
            const [vx, vy] = viewport.convertToViewportPoint(tx, ty);
            const scaledFontSize = fontSize * scale;

            span.style.left = `${vx}px`;
            span.style.top = `${vy - scaledFontSize}px`;
            span.style.fontSize = `${scaledFontSize}px`;
            span.style.fontFamily = 'sans-serif';
            span.setAttribute('data-text', item.str);

            textLayerDiv.appendChild(span);
          }

          rendered.push({
            pageNum: i,
            canvas,
            textLayerDiv,
            viewport: { width: Math.floor(viewport.width), height: Math.floor(viewport.height) },
          });
        }

        if (!cancelled) {
          setPages(rendered);
          setIsRendering(false);
        }
      } catch (err) {
        console.error('Failed to render PDF pages:', err);
        if (!cancelled) setIsRendering(false);
      }
    };

    renderPages();
    return () => { cancelled = true; };
  }, [pdf, zoom]);

  // Mount rendered pages into the DOM
  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    container.innerHTML = '';

    for (const page of pages) {
      const wrapper = document.createElement('div');
      wrapper.className = 'pdf-page-wrapper';
      wrapper.style.position = 'relative';
      wrapper.style.width = `${page.viewport.width}px`;
      wrapper.style.height = `${page.viewport.height}px`;
      wrapper.style.margin = '0 auto 12px';
      wrapper.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
      wrapper.style.background = 'white';

      wrapper.appendChild(page.canvas);
      wrapper.appendChild(page.textLayerDiv);

      container.appendChild(wrapper);
    }
  }, [pages]);

  // Apply deviation highlights on the text layer
  useEffect(() => {
    if (!showHighlights || !pages.length || !diffs.length) {
      // Clear existing highlights
      pages.forEach(p => {
        p.textLayerDiv.querySelectorAll('.dev-highlight').forEach(el => el.remove());
      });
      return;
    }

    // Gather complete deviation snippets. Diffs are character tokens, so
    // grouping by deviationId avoids highlighting every span that contains a
    // common single letter.
    const deviationMap = new Map<string, DeviationHighlightTarget>();

    for (const diff of diffs) {
      if (side === 'original' && diff.removed) {
        const key = diff.deviationId ?? `removed-${deviationMap.size}`;
        const existing = deviationMap.get(key);
        const value = diffTextForSide(diff, side);
        deviationMap.set(key, {
          text: existing ? existing.text + value : value,
          type: 'removed',
          id: diff.deviationId,
          page: diff.originalPage,
        });
      } else if (side === 'copy' && diff.added) {
        const key = diff.deviationId ?? `added-${deviationMap.size}`;
        const existing = deviationMap.get(key);
        const value = diffTextForSide(diff, side);
        deviationMap.set(key, {
          text: existing ? existing.text + value : value,
          type: 'added',
          id: diff.deviationId,
          page: diff.copyPage,
        });
      }
    }

    const deviationTexts = Array.from(deviationMap.values())
      .filter((dev) => normalizeHighlightText(dev.text));

    // For each page's text layer, find spans that contain deviation text and highlight
    for (const page of pages) {
      // Remove old highlights
      page.textLayerDiv.querySelectorAll('.dev-highlight').forEach(el => el.remove());

      const spans = Array.from(page.textLayerDiv.querySelectorAll('span'));
      for (const span of spans) {
        const spanText = span.textContent || '';
        if (!spanText.trim()) continue;

        for (const dev of deviationTexts) {
          if (dev.page && dev.page !== page.pageNum) continue;

          if (shouldMatchHighlight(spanText, dev.text)) {
            // This span contains or is part of a deviation
            const highlight = document.createElement('div');
            highlight.className = 'dev-highlight';
            if (dev.id) {
              highlight.id = `dev-${side}-${dev.id}`;
              highlight.dataset.devId = dev.id;
              highlight.dataset.devSide = side;
            }

            const rect = span.getBoundingClientRect();
            const parentRect = page.textLayerDiv.getBoundingClientRect();

            highlight.style.position = 'absolute';
            highlight.style.left = `${rect.left - parentRect.left}px`;
            highlight.style.top = `${rect.top - parentRect.top}px`;
            highlight.style.width = `${rect.width}px`;
            highlight.style.height = `${rect.height}px`;
            highlight.style.backgroundColor = dev.type === 'removed'
              ? 'rgba(239, 68, 68, 0.25)'
              : 'rgba(34, 197, 94, 0.25)';
            highlight.style.border = dev.type === 'removed'
              ? '1px solid rgba(239, 68, 68, 0.5)'
              : '1px solid rgba(34, 197, 94, 0.5)';
            highlight.style.borderRadius = '2px';
            highlight.style.pointerEvents = 'none';
            highlight.style.mixBlendMode = 'multiply';
            highlight.style.zIndex = '5';

            page.textLayerDiv.appendChild(highlight);
            break;
          }
        }
      }
    }
  }, [showHighlights, pages, diffs, side]);

  return (
    <div ref={containerRef} className="pdf-canvas-container" style={{ padding: '12px' }}>
      {isRendering && (
        <div className="flex items-center justify-center py-12 text-text-muted">
          <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full mr-3" />
          Rendering PDF...
        </div>
      )}
    </div>
  );
};

// ── DOCX Viewer (shadow-root based) ──────────────────────────────────────────

const DocxViewer: React.FC<{ data: ArrayBuffer }> = ({ data }) => {
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
      :host { display: block; }
      .docx-shell { min-width: fit-content; }
      .docx-page-wrapper { background: white !important; padding: 0 !important; }
      .docx-page-wrapper > section.docx-page { box-shadow: none !important; margin: 0 auto 16px !important; }
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
      if (!cancelled) setIsRendering(false);
    }).catch((err) => {
      if (!cancelled) { setError((err as Error).message); setIsRendering(false); }
    });

    return () => { cancelled = true; };
  }, [data]);

  return (
    <div className="docx-viewer-host">
      {isRendering && <div className="docx-viewer-loading">Rendering document...</div>}
      {error && <div className="docx-viewer-error">Failed to render: {error}</div>}
      <div ref={hostRef} />
    </div>
  );
};

// ── Toolbar ──────────────────────────────────────────────────────────────────

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

// ── Document Pane ────────────────────────────────────────────────────────────

const DiffTextViewer: React.FC<{ diffs: DiffResult[]; side: 'original' | 'copy' }> = ({ diffs, side }) => {
  const parts = diffs.flatMap((part, index) => {
    const value = side === 'original'
      ? part.originalValue ?? part.value
      : part.copyValue ?? part.value;

    if (part.added && side !== 'copy') return [];
    if (part.removed && side !== 'original') return [];

    const isChanged = (side === 'copy' && part.added) || (side === 'original' && part.removed);

    if (!isChanged) {
      return [<React.Fragment key={`${side}-same-${index}`}>{value}</React.Fragment>];
    }

    return [
      <span
        key={`${side}-diff-${part.deviationId ?? index}-${index}`}
        id={part.deviationId ? `dev-${side}-${part.deviationId}` : undefined}
        data-dev-id={part.deviationId}
        data-dev-side={side}
        className="diff-highlight cursor-pointer transition-all duration-300"
      >
        {value}
      </span>,
    ];
  });

  return (
    <div className="bg-white p-8 doc-content whitespace-pre-wrap" style={{ minWidth: '100%' }}>
      {parts}
    </div>
  );
};

const DocumentPane = ({
  title, display, inputRef, onUpload, onDrop,
  showViewToggle, viewMode, onViewModeChange, zoom, onZoomChange, children,
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
      ) : children}
    </div>
  </div>
);

// ── Main Component ───────────────────────────────────────────────────────────

const ComparisonCanvas: React.FC<ComparisonCanvasProps> = ({
  originalDiffHtml,
  copyDiffHtml,
  originalDisplay,
  copyDisplay,
  diffs,
  onUploadOriginal,
  onUploadCopy,
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

  // Navigate to deviation on click from analysis panel
  useEffect(() => {
    const handleScrollToDev = (event: Event) => {
      const e = event as CustomEvent<{ id: string }>;
      setViewMode('diff');
      setTimeout(() => {
        const devId = e.detail.id;
        const el =
          document.getElementById(`dev-original-${devId}`)
          || document.getElementById(`dev-copy-${devId}`)
          || document.querySelector<HTMLElement>(`[data-dev-id="${cssEscape(devId)}"]`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          const previousBackground = el.style.backgroundColor;
          const previousShadow = el.style.boxShadow;
          el.style.backgroundColor = '#ffeb3b';
          el.style.boxShadow = '0 0 0 4px #ffeb3b';
          setTimeout(() => {
            el.style.backgroundColor = previousBackground;
            el.style.boxShadow = previousShadow;
          }, 2000);
        }
      }, 300);
    };

    window.addEventListener('scroll-to-dev', handleScrollToDev);
    return () => window.removeEventListener('scroll-to-dev', handleScrollToDev);
  }, []);

  const hasBothDocs = originalDisplay && copyDisplay;
  const isDiffMode = viewMode === 'diff' && hasBothDocs;

  const renderContent = (display: ParseResult | null, side: 'original' | 'copy') => {
    if (!display) return null;

    // Diff mode uses React text nodes instead of rendered document/PDF HTML so
    // malformed extracted characters cannot crash the React tree.
    if (isDiffMode) {
      return <DiffTextViewer diffs={diffs} side={side} />;
    }

    // Original mode: native rendering
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
        <DiffRenderBoundary resetKey={`original-${viewMode}-${originalDisplay?.fileName ?? ''}-${originalDiffHtml.length}`}>
          {renderContent(originalDisplay, 'original')}
        </DiffRenderBoundary>
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
        <DiffRenderBoundary resetKey={`copy-${viewMode}-${copyDisplay?.fileName ?? ''}-${copyDiffHtml.length}`}>
          {renderContent(copyDisplay, 'copy')}
        </DiffRenderBoundary>
      </DocumentPane>
    </div>
  );
};

export default ComparisonCanvas;
