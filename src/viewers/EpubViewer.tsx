import { useEffect, useRef, useState } from "react";
import ePub from "epubjs";
import type Book from "epubjs/types/book";
import type Rendition from "epubjs/types/rendition";
import { ViewerToolbar } from "@/components/ViewerToolbar";
import { Button } from "@/components/ui/button";
import { Type, Sun, Moon, Minus, Plus } from "lucide-react";
import type { FileEntry } from "@/lib/fileStore";

interface EpubViewerProps {
  file: FileEntry;
  onBack: () => void;
}

type ThemeMode = "light" | "sepia" | "dark";

const themes: Record<ThemeMode, { bg: string; fg: string }> = {
  light: { bg: "#faf9f6", fg: "#1a1a1a" },
  sepia: { bg: "#f4ecd8", fg: "#5b4636" },
  dark: { bg: "#141a24", fg: "#d4cfc4" },
};

export function EpubViewer({ file, onBack }: EpubViewerProps) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<Book | null>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const [fontSize, setFontSize] = useState(100);
  const [theme, setTheme] = useState<ThemeMode>("dark");
  const [currentPage, setCurrentPage] = useState(1);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    if (!viewerRef.current) return;

    const book = ePub(file.data);
    bookRef.current = book;

    const rendition = book.renderTo(viewerRef.current, {
      width: "100%",
      height: "100%",
      spread: "none",
    });

    renditionRef.current = rendition;

    // Register themes
    Object.entries(themes).forEach(([name, t]) => {
      rendition.themes.register(name, {
        body: {
          background: t.bg + " !important",
          color: t.fg + " !important",
          "font-family": "'Space Grotesk', sans-serif !important",
        },
      });
    });

    rendition.themes.select(theme);
    rendition.themes.fontSize(`${fontSize}%`);
    rendition.display();

    rendition.on("relocated", (location: any) => {
      if (location?.start?.displayed?.page) {
        setCurrentPage(location.start.displayed.page);
      }
    });

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") rendition.next();
      if (e.key === "ArrowLeft") rendition.prev();
    };
    document.addEventListener("keydown", handleKey);

    return () => {
      document.removeEventListener("keydown", handleKey);
      book.destroy();
    };
  }, [file.data]);

  useEffect(() => {
    if (renditionRef.current) {
      renditionRef.current.themes.select(theme);
    }
  }, [theme]);

  useEffect(() => {
    if (renditionRef.current) {
      renditionRef.current.themes.fontSize(`${fontSize}%`);
    }
  }, [fontSize]);

  const nextTheme = () => {
    const order: ThemeMode[] = ["light", "sepia", "dark"];
    const idx = order.indexOf(theme);
    setTheme(order[(idx + 1) % 3]);
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      <ViewerToolbar
        title={file.name}
        onBack={onBack}
        currentPage={currentPage}
        totalPages={undefined}
        onPrevPage={() => renditionRef.current?.prev()}
        onNextPage={() => renditionRef.current?.next()}
      >
        <Button variant="ghost" size="icon" onClick={() => setShowSettings(!showSettings)}>
          <Type className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={nextTheme}>
          {theme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        </Button>
      </ViewerToolbar>

      {showSettings && (
        <div className="flex items-center gap-4 px-6 py-2 glass-surface">
          <span className="text-xs text-muted-foreground">Font Size</span>
          <Button variant="ghost" size="icon" onClick={() => setFontSize((s) => Math.max(60, s - 10))}>
            <Minus className="h-3 w-3" />
          </Button>
          <span className="text-xs font-mono text-foreground w-10 text-center">{fontSize}%</span>
          <Button variant="ghost" size="icon" onClick={() => setFontSize((s) => Math.min(200, s + 10))}>
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      )}

      <div ref={viewerRef} className="flex-1 overflow-hidden" />
    </div>
  );
}
