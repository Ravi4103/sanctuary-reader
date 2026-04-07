import { ArrowLeft, ZoomIn, ZoomOut, Maximize2, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ViewerToolbarProps {
  title: string;
  onBack: () => void;
  currentPage?: number;
  totalPages?: number;
  onPrevPage?: () => void;
  onNextPage?: () => void;
  zoom?: number;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onFitWidth?: () => void;
  children?: React.ReactNode;
}

export function ViewerToolbar({
  title, onBack, currentPage, totalPages,
  onPrevPage, onNextPage,
  zoom, onZoomIn, onZoomOut, onFitWidth,
  children,
}: ViewerToolbarProps) {
  return (
    <div className="sticky top-0 z-40 flex items-center gap-2 px-4 py-2 glass-surface">
      <Button variant="ghost" size="icon" onClick={onBack}>
        <ArrowLeft className="h-4 w-4" />
      </Button>
      <h2 className="text-sm font-medium text-foreground truncate max-w-[200px]">{title}</h2>

      <div className="flex-1" />

      {currentPage != null && totalPages != null && (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={onPrevPage} disabled={currentPage <= 1}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground font-mono min-w-[60px] text-center">
            {currentPage} / {totalPages}
          </span>
          <Button variant="ghost" size="icon" onClick={onNextPage} disabled={currentPage >= totalPages}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {zoom != null && (
        <div className="flex items-center gap-1 ml-2">
          <Button variant="ghost" size="icon" onClick={onZoomOut}>
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground font-mono w-12 text-center">{Math.round(zoom * 100)}%</span>
          <Button variant="ghost" size="icon" onClick={onZoomIn}>
            <ZoomIn className="h-4 w-4" />
          </Button>
          {onFitWidth && (
            <Button variant="ghost" size="icon" onClick={onFitWidth}>
              <Maximize2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      )}

      {children}
    </div>
  );
}
