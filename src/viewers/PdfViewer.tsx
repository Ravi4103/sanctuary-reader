import { useEffect, useRef, useState, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { ViewerToolbar } from "@/components/ViewerToolbar";
import type { FileEntry } from "@/lib/fileStore";

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;

interface PdfViewerProps {
  file: FileEntry;
  onBack: () => void;
}

export function PdfViewer({ file, onBack }: PdfViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pdf, setPdf] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [zoom, setZoom] = useState(1.2);
  const [rendering, setRendering] = useState(false);

  useEffect(() => {
    const loadPdf = async () => {
      const data = new Uint8Array(file.data);
      const doc = await pdfjsLib.getDocument({ data }).promise;
      setPdf(doc);
      setTotalPages(doc.numPages);
    };
    loadPdf();
  }, [file.data]);

  const renderPage = useCallback(async () => {
    if (!pdf || !canvasRef.current || rendering) return;
    setRendering(true);
    try {
      const p = await pdf.getPage(page);
      const viewport = p.getViewport({ scale: zoom });
      const canvas = canvasRef.current;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d")!;
      await p.render({ canvasContext: ctx, viewport }).promise;
    } finally {
      setRendering(false);
    }
  }, [pdf, page, zoom, rendering]);

  useEffect(() => {
    renderPage();
  }, [pdf, page, zoom]);

  return (
    <div className="flex flex-col h-screen bg-background">
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
        onFitWidth={() => setZoom(1.2)}
      />
      <div className="flex-1 overflow-auto flex justify-center p-8">
        <canvas
          ref={canvasRef}
          className="shadow-2xl rounded-sm"
          style={{ maxWidth: "100%" }}
        />
      </div>
    </div>
  );
}
