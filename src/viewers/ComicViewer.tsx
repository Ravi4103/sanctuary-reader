import { useEffect, useState, useCallback } from "react";
import JSZip from "jszip";
import { ViewerToolbar } from "@/components/ViewerToolbar";
import { Button } from "@/components/ui/button";
import { ArrowLeftRight, Columns2, SunMedium, Contrast } from "lucide-react";
import type { FileEntry } from "@/lib/fileStore";

interface ComicViewerProps {
  file: FileEntry;
  onBack: () => void;
}

type DisplayMode = "single" | "double" | "scroll";

export function ComicViewer({ file, onBack }: ComicViewerProps) {
  const [images, setImages] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  const [rtl, setRtl] = useState(false);
  const [mode, setMode] = useState<DisplayMode>("single");
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [showEnhance, setShowEnhance] = useState(false);

  useEffect(() => {
    const load = async () => {
      const zip = await JSZip.loadAsync(file.data);
      const imageFiles = Object.keys(zip.files)
        .filter((f) => /\.(jpe?g|png|gif|webp|bmp)$/i.test(f))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

      const urls: string[] = [];
      for (const name of imageFiles) {
        const blob = await zip.files[name].async("blob");
        urls.push(URL.createObjectURL(blob));
      }
      setImages(urls);
    };
    load();

    return () => {
      images.forEach(URL.revokeObjectURL);
    };
  }, [file.data]);

  const totalPages = images.length;

  const goNext = useCallback(() => {
    const step = mode === "double" ? 2 : 1;
    setPage((p) => Math.min(totalPages - 1, p + step));
  }, [totalPages, mode]);

  const goPrev = useCallback(() => {
    const step = mode === "double" ? 2 : 1;
    setPage((p) => Math.max(0, p - step));
  }, [mode]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const next = rtl ? "ArrowLeft" : "ArrowRight";
      const prev = rtl ? "ArrowRight" : "ArrowLeft";
      if (e.key === next) goNext();
      if (e.key === prev) goPrev();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [goNext, goPrev, rtl]);

  const imgStyle = {
    filter: `brightness(${brightness}%) contrast(${contrast}%)`,
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      <ViewerToolbar
        title={file.name}
        onBack={onBack}
        currentPage={page + 1}
        totalPages={totalPages}
        onPrevPage={goPrev}
        onNextPage={goNext}
      >
        <Button variant="ghost" size="icon" onClick={() => setRtl(!rtl)} title={rtl ? "RTL" : "LTR"}>
          <ArrowLeftRight className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost" size="icon"
          onClick={() => setMode(mode === "single" ? "double" : mode === "double" ? "scroll" : "single")}
          title={mode}
        >
          <Columns2 className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => setShowEnhance(!showEnhance)}>
          <SunMedium className="h-4 w-4" />
        </Button>
      </ViewerToolbar>

      {showEnhance && (
        <div className="flex items-center gap-6 px-6 py-2 glass-surface">
          <div className="flex items-center gap-2">
            <SunMedium className="h-3.5 w-3.5 text-muted-foreground" />
            <input type="range" min={50} max={150} value={brightness} onChange={(e) => setBrightness(+e.target.value)} className="w-24 accent-primary" />
          </div>
          <div className="flex items-center gap-2">
            <Contrast className="h-3.5 w-3.5 text-muted-foreground" />
            <input type="range" min={50} max={200} value={contrast} onChange={(e) => setContrast(+e.target.value)} className="w-24 accent-primary" />
          </div>
        </div>
      )}

      <div className="flex-1 overflow-auto flex items-start justify-center p-4">
        {mode === "scroll" ? (
          <div className="flex flex-col items-center gap-2 max-w-4xl">
            {images.map((src, i) => (
              <img key={i} src={src} alt={`Page ${i + 1}`} className="w-full" style={imgStyle} />
            ))}
          </div>
        ) : (
          <div className={`flex gap-1 items-center justify-center h-full ${rtl ? "flex-row-reverse" : ""}`}>
            {images[page] && (
              <img src={images[page]} alt={`Page ${page + 1}`} className="max-h-[calc(100vh-100px)] object-contain" style={imgStyle} />
            )}
            {mode === "double" && images[page + 1] && (
              <img src={images[page + 1]} alt={`Page ${page + 2}`} className="max-h-[calc(100vh-100px)] object-contain" style={imgStyle} />
            )}
          </div>
        )}
      </div>

      {/* Click zones for paging */}
      {mode !== "scroll" && (
        <>
          <div
            className="fixed left-0 top-12 w-1/3 bottom-0 cursor-pointer z-10"
            onClick={rtl ? goNext : goPrev}
          />
          <div
            className="fixed right-0 top-12 w-1/3 bottom-0 cursor-pointer z-10"
            onClick={rtl ? goPrev : goNext}
          />
        </>
      )}
    </div>
  );
}
