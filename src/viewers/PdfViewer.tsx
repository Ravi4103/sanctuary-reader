import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { ListTree } from "lucide-react";
import { DocumentTocSidebar, type TocItem } from "@/components/DocumentTocSidebar";
import { ViewerToolbar } from "@/components/ViewerToolbar";
import { PdfSettingsPanel, defaultSettings, type PdfSettings } from "@/components/PdfSettingsPanel";
import { Button } from "@/components/ui/button";
import type { FileEntry } from "@/lib/fileStore";

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;

/* ── TOC helpers ─────────────────────────────────────────────────── */

interface PdfTocItem extends TocItem {
  children?: PdfTocItem[];
  dest?: unknown;
  page?: number | null;
  url?: string | null;
}

type PageSetter = Dispatch<SetStateAction<number>>;

async function resolvePdfDestination(doc: pdfjsLib.PDFDocumentProxy, dest: any): Promise<number | null> {
  if (!dest) return null;
  const resolvedDest = typeof dest === "string" ? await doc.getDestination(dest) : dest;
  if (!Array.isArray(resolvedDest) || resolvedDest.length === 0) return null;
  const target = resolvedDest[0];
  if (typeof target === "number") return target + 1;
  if (target && typeof target === "object") return (await doc.getPageIndex(target)) + 1;
  return null;
}

async function mapPdfOutlineItems(
  doc: pdfjsLib.PDFDocumentProxy,
  outline: any[],
  prefix = "toc",
): Promise<PdfTocItem[]> {
  return Promise.all(
    outline.map(async (item, index) => {
      const id = `${prefix}-${index}`;
      const pageNumber = item.dest ? await resolvePdfDestination(doc, item.dest).catch(() => null) : null;
      return {
        id,
        label: item.title?.trim() || "Untitled section",
        hint: pageNumber ? `Page ${pageNumber}` : undefined,
        page: pageNumber,
        dest: item.dest,
        url: item.url ?? null,
        children: item.items?.length ? await mapPdfOutlineItems(doc, item.items, id) : [],
      };
    }),
  );
}

function flattenPdfTocItems(items: PdfTocItem[]): PdfTocItem[] {
  return items.flatMap((item) => [item, ...flattenPdfTocItems(item.children ?? [])]);
}

/* ── Link service ────────────────────────────────────────────────── */

function createPdfLinkService(doc: pdfjsLib.PDFDocumentProxy, setPage: PageSetter, totalPages: number) {
  const goToPage = (target: number) => setPage(Math.max(1, Math.min(totalPages, target)));
  return {
    addLinkAttributes(link: HTMLAnchorElement, url: string, newWindow?: boolean) {
      link.href = url;
      link.target = newWindow ? "_blank" : "_self";
      link.rel = "noopener noreferrer";
    },
    eventBus: { dispatch: () => undefined },
    executeNamedAction(action: string) {
      switch (action) {
        case "NextPage": setPage((c) => Math.min(totalPages, c + 1)); break;
        case "PrevPage": setPage((c) => Math.max(1, c - 1)); break;
        case "FirstPage": goToPage(1); break;
        case "LastPage": goToPage(totalPages); break;
      }
    },
    executeSetOCGState() { return undefined; },
    getAnchorUrl(hash: string) { return hash || "#"; },
    getDestinationHash() { return "#"; },
    async goToDestination(dest: unknown) {
      const p = await resolvePdfDestination(doc, dest).catch(() => null);
      if (p) goToPage(p);
    },
  };
}

/* ── Background filter helpers ───────────────────────────────────── */

function getPageFilter(settings: PdfSettings): string {
  const parts: string[] = [];
  if (settings.brightness !== 100) parts.push(`brightness(${settings.brightness / 100})`);
  if (settings.invertColors) parts.push("invert(1) hue-rotate(180deg)");
  if (settings.pageBackground === "sepia") parts.push("sepia(0.3)");
  if (settings.pageBackground === "warm") parts.push("sepia(0.15) saturate(1.1)");
  if (settings.pageBackground === "cool") parts.push("hue-rotate(15deg) saturate(0.9)");
  return parts.length ? parts.join(" ") : "none";
}

/* ── Print helper ────────────────────────────────────────────────── */

async function printPdf(pdfDoc: pdfjsLib.PDFDocumentProxy) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) return;

  printWindow.document.write("<html><head><title>Print PDF</title><style>@media print { @page { margin: 0; } body { margin: 0; } canvas { page-break-after: always; display: block; width: 100%; } canvas:last-child { page-break-after: auto; } } body { margin: 0; background: white; }</style></head><body></body></html>");
  printWindow.document.close();

  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = printWindow.document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    await page.render({ canvasContext: ctx, viewport }).promise;
    printWindow.document.body.appendChild(canvas);
  }

  setTimeout(() => {
    printWindow.focus();
    printWindow.print();
  }, 500);
}

/* ── Component ───────────────────────────────────────────────────── */

interface PdfViewerProps {
  file: FileEntry;
  onBack: () => void;
}

export function PdfViewer({ file, onBack }: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [zoom, setZoom] = useState(1.2);
  const [rotation, setRotation] = useState(0);
  const [showToc, setShowToc] = useState(false);
  const [tocItems, setTocItems] = useState<PdfTocItem[]>([]);
  const [settings, setSettings] = useState<PdfSettings>(defaultSettings);

  /* Load PDF */
  useEffect(() => {
    let cancelled = false;
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(file.data) });

    loadingTask.promise
      .then(async (doc) => {
        if (cancelled) return;
        setPdf(doc);
        setTotalPages(doc.numPages);
        const outline = await doc.getOutline();
        if (!cancelled) setTocItems(outline ? await mapPdfOutlineItems(doc, outline) : []);
      })
      .catch((error) => { if (!cancelled) console.error("Failed to load PDF", error); });

    return () => { cancelled = true; loadingTask.destroy(); };
  }, [file.data]);

  /* TOC */
  const flatTocItems = useMemo(() => flattenPdfTocItems(tocItems), [tocItems]);
  const activeTocId = useMemo(() => {
    let id: string | null = null;
    for (const item of flatTocItems) { if (item.page && item.page <= page) id = item.id; }
    return id;
  }, [flatTocItems, page]);

  const handleTocSelect = useCallback(async (item: TocItem) => {
    const tocItem = item as PdfTocItem;
    if (tocItem.url) { window.open(tocItem.url, "_blank", "noopener,noreferrer"); return; }
    if (!pdf) return;
    const p = tocItem.page ?? (await resolvePdfDestination(pdf, tocItem.dest).catch(() => null));
    if (p) setPage(p);
    if (window.innerWidth < 768) setShowToc(false);
  }, [pdf]);

  /* Fit width */
  const handleFitWidth = useCallback(async () => {
    if (!pdf || !viewportRef.current) return;
    const currentPage = await pdf.getPage(page);
    const baseViewport = currentPage.getViewport({ scale: 1 });
    const availableWidth = Math.max(viewportRef.current.clientWidth - 32, 240);
    setZoom(Math.max(0.4, Math.min(3, availableWidth / baseViewport.width)));
  }, [page, pdf]);

  /* Auto fit width on setting change */
  useEffect(() => {
    if (settings.autoFitWidth) handleFitWidth();
  }, [settings.autoFitWidth, handleFitWidth]);

  /* Render page */
  useEffect(() => {
    if (!pdf || !containerRef.current) return;
    let cancelled = false;
    let renderTask: pdfjsLib.RenderTask | null = null;
    let textLayerTask: { cancel?: () => void; promise?: Promise<void> } | null = null;

    const render = async () => {
      const container = containerRef.current;
      if (!container) return;

      const pdfPage = await pdf.getPage(page);
      const viewport = pdfPage.getViewport({ scale: zoom, rotation });
      const outputScale = window.devicePixelRatio || 1;

      const wrapper = document.createElement("div");
      wrapper.className = "pdf-page";
      wrapper.style.width = `${viewport.width}px`;
      wrapper.style.height = `${viewport.height}px`;
      wrapper.style.setProperty("--scale-factor", `${viewport.scale}`);

      const filter = getPageFilter(settings);
      if (filter !== "none") wrapper.style.filter = filter;

      const canvas = document.createElement("canvas");
      canvas.className = "pdf-canvas";
      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;

      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) return;
      wrapper.appendChild(canvas);

      /* Text layer */
      if (settings.enableTextSelection) {
        const textDiv = document.createElement("div");
        textDiv.className = "textLayer";
        textDiv.style.setProperty("--scale-factor", `${viewport.scale}`);
        wrapper.appendChild(textDiv);
      }

      /* Annotation layer */
      if (settings.showAnnotations) {
        const annotationDiv = document.createElement("div");
        annotationDiv.className = "annotationLayer";
        annotationDiv.style.setProperty("--scale-factor", `${viewport.scale}`);
        wrapper.appendChild(annotationDiv);
      }

      container.replaceChildren(wrapper);
      if (cancelled) return;

      renderTask = pdfPage.render({
        annotationMode: settings.showAnnotations ? pdfjsLib.AnnotationMode.ENABLE_FORMS : pdfjsLib.AnnotationMode.DISABLE,
        canvasContext: ctx,
        transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
        viewport,
      });

      await renderTask.promise;

      /* Render text layer */
      if (settings.enableTextSelection) {
        const textDiv = wrapper.querySelector(".textLayer") as HTMLDivElement;
        if (textDiv) {
          const textContent = await pdfPage.getTextContent();
          if (cancelled) return;
          textLayerTask = (pdfjsLib as any).renderTextLayer({
            container: textDiv,
            textContentSource: textContent,
            textContentItemsStr: [],
            textDivs: [],
            viewport,
          });
          await textLayerTask?.promise;
        }
      }

      /* Render annotation layer */
      if (settings.showAnnotations) {
        const annotationDiv = wrapper.querySelector(".annotationLayer") as HTMLDivElement;
        if (annotationDiv) {
          const annotations = await pdfPage.getAnnotations();
          if (cancelled || annotations.length === 0) {
            annotationDiv.hidden = annotations.length === 0;
            return;
          }
          const annotationLayer = new (pdfjsLib as any).AnnotationLayer({
            div: annotationDiv,
            page: pdfPage,
            viewport: viewport.clone({ dontFlip: true }),
          });
          await annotationLayer.render({
            annotations,
            linkService: createPdfLinkService(pdf, setPage, totalPages),
            renderForms: true,
          });
        }
      }
    };

    render().catch((error) => { if (!cancelled) console.error("Failed to render PDF page", error); });

    return () => {
      cancelled = true;
      renderTask?.cancel();
      textLayerTask?.cancel?.();
      containerRef.current?.replaceChildren();
    };
  }, [page, pdf, totalPages, zoom, rotation, settings]);

  /* Keyboard nav */
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") setPage((p) => Math.min(totalPages, p + 1));
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") setPage((p) => Math.max(1, p - 1));
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [totalPages]);

  /* Ctrl+scroll zoom */
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        setZoom((z) => Math.max(0.4, Math.min(3, z - e.deltaY * 0.002)));
      }
    };
    document.addEventListener("wheel", handleWheel, { passive: false });
    return () => document.removeEventListener("wheel", handleWheel);
  }, []);

  /* Print */
  const handlePrint = useCallback(() => { if (pdf) printPdf(pdf); }, [pdf]);

  /* Rotate */
  const handleRotate = useCallback(() => { setRotation((r) => (r + 90) % 360); }, []);

  /* Scroll direction class */
  const scrollClass = settings.scrollDirection === "horizontal"
    ? "flex flex-row items-center overflow-x-auto overflow-y-hidden"
    : "flex flex-1 justify-center overflow-auto";

  return (
    <div className="flex h-screen flex-col bg-background">
      <ViewerToolbar
        title={file.name}
        onBack={onBack}
        currentPage={page}
        totalPages={totalPages}
        onPrevPage={() => setPage((p) => Math.max(1, p - 1))}
        onNextPage={() => setPage((p) => Math.min(totalPages, p + 1))}
        zoom={zoom}
        onZoomIn={() => setZoom((z) => Math.min(3, z + 0.2))}
        onZoomOut={() => setZoom((z) => Math.max(0.4, z - 0.2))}
        onFitWidth={handleFitWidth}
      >
        <Button
          variant="ghost"
          size="icon"
          aria-label="Toggle table of contents"
          aria-pressed={showToc}
          onClick={() => setShowToc((o) => !o)}
        >
          <ListTree className="h-4 w-4" />
        </Button>
        <PdfSettingsPanel
          settings={settings}
          onSettingsChange={setSettings}
          onPrint={handlePrint}
          onRotatePage={handleRotate}
        />
      </ViewerToolbar>

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <DocumentTocSidebar
          title="PDF contents"
          items={tocItems}
          isOpen={showToc}
          activeId={activeTocId}
          onClose={() => setShowToc(false)}
          onSelect={handleTocSelect}
        />

        <div ref={viewportRef} className={`${scrollClass} p-4 md:p-8`}>
          <div ref={containerRef} className="shrink-0" />
        </div>
      </div>
    </div>
  );
}
