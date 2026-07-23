import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, ExternalLink, Image as ImageIcon, Upload as UploadIcon, X } from "lucide-react";
import { resolveStoredFileUrl } from "@/lib/resolve-stored-file-url";
import { SITE_PHOTOS_MAX, sitePhotosLabel } from "@/lib/site-photos";

function SitePhotoThumb({ url, onOpen, onDownload, onRemove }) {
  const [src, setSrc] = useState("");

  useEffect(() => {
    let cancelled = false;
    resolveStoredFileUrl(url).then((resolved) => {
      if (!cancelled) setSrc(resolved || url);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return (
    <div className="rounded-lg border bg-background overflow-hidden flex flex-col">
      <button
        type="button"
        onClick={onOpen}
        className="block w-full aspect-[4/3] bg-muted overflow-hidden"
        title="Otwórz podgląd"
      >
        {src ? (
          <img src={src} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-muted-foreground">
            <ImageIcon className="h-6 w-6" />
          </div>
        )}
      </button>
      <div className="flex flex-wrap gap-1 p-2 border-t">
        <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={onOpen}>
          <ExternalLink className="h-3.5 w-3.5 mr-1" />
          Otwórz
        </Button>
        <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={onDownload}>
          <Download className="h-3.5 w-3.5 mr-1" />
          Pobierz
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive" onClick={onRemove}>
          <X className="h-3.5 w-3.5 mr-1" />
          Usuń
        </Button>
      </div>
    </div>
  );
}

/**
 * Galeria zdjęć obiektu — wiele plików, max SITE_PHOTOS_MAX.
 */
export function SitePhotoGallery({
  photos,
  onChange,
  onUploadFiles,
  uploading = false,
  objectLabel = "",
  onOpen,
  onDownload,
}) {
  const list = Array.isArray(photos) ? photos : [];
  const remaining = Math.max(0, SITE_PHOTOS_MAX - list.length);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-foreground">Dokumentacja fotograficzna</p>
          <p className="text-xs text-muted-foreground">
            {list.length
              ? `${sitePhotosLabel(list.length)} · możesz dodać jeszcze ${remaining}`
              : `Dodaj jedno lub więcej zdjęć (max ${SITE_PHOTOS_MAX})`}
          </p>
        </div>
        {remaining > 0 && (
          <label className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-md border border-input bg-background text-sm font-medium cursor-pointer hover:bg-accent relative overflow-hidden">
            {uploading ? (
              <span className="text-muted-foreground">Wgrywanie…</span>
            ) : (
              <>
                <UploadIcon className="h-4 w-4" />
                {list.length ? "Dodaj zdjęcia" : "Wgraj zdjęcia"}
              </>
            )}
            <input
              type="file"
              accept="image/*"
              multiple
              disabled={uploading || remaining <= 0}
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                e.target.value = "";
                if (files.length) onUploadFiles(files);
              }}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
          </label>
        )}
      </div>

      {list.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {list.map((url, idx) => (
            <SitePhotoThumb
              key={`${idx}-${String(url).slice(0, 48)}`}
              url={url}
              onOpen={() => onOpen(url)}
              onDownload={() => onDownload(url, idx)}
              onRemove={() => onChange(list.filter((_, i) => i !== idx))}
            />
          ))}
        </div>
      ) : (
        <div className="relative border border-dashed border-slate-300 rounded-lg p-6 text-center hover:border-blue-400 hover:bg-blue-50/50 transition-colors">
          <input
            type="file"
            accept="image/*"
            multiple
            disabled={uploading}
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              e.target.value = "";
              if (files.length) onUploadFiles(files);
            }}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
          <div className="flex flex-col items-center pointer-events-none">
            <UploadIcon className="h-7 w-7 text-slate-400 mb-2" />
            <span className="text-sm text-slate-600">Kliknij, aby wgrać zdjęcia (można wybrać wiele)</span>
            {objectLabel ? <span className="text-xs text-muted-foreground mt-1">{objectLabel}</span> : null}
          </div>
        </div>
      )}
    </div>
  );
}
