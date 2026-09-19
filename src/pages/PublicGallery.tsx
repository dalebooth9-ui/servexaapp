import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, X } from "lucide-react";

type GalleryData = {
  gallery: { title: string; description: string | null; createdAt: string };
  org: { name: string; logoUrl: string | null; primaryColor: string | null };
  site: string | null;
  photos: { id: string; url: string; createdAt: string }[];
};

export default function PublicGallery() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<GalleryData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: res, error: err } = await supabase.functions.invoke("public-gallery", {
        body: { token },
      });
      if (cancelled) return;
      if (err || !res || (res as any).error) {
        setError("This gallery has expired or been removed");
      } else {
        setData(res as GalleryData);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [token]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white px-6 text-center">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">This gallery has expired or been removed</h1>
          <p className="mt-2 text-sm text-slate-500">Please contact the company that sent you this link.</p>
        </div>
      </div>
    );
  }

  const { gallery, org, site, photos } = data;

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header className="border-b border-slate-200">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-6 sm:flex-row sm:items-center sm:gap-5 sm:py-8">
          {org.logoUrl && (
            <img src={org.logoUrl} alt={org.name} className="h-12 w-auto max-w-[180px] object-contain" />
          )}
          <div className="min-w-0">
            {org.name && <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{org.name}</p>}
            <h1 className="truncate text-xl font-semibold sm:text-2xl">{gallery.title}</h1>
            {site && <p className="text-sm text-slate-500">{site}</p>}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        {gallery.description && (
          <p className="mb-6 whitespace-pre-line rounded-lg bg-slate-50 p-4 text-sm text-slate-700">
            {gallery.description}
          </p>
        )}

        {photos.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-500">No photos have been shared yet.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {photos.map((p, i) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setOpenIdx(i)}
                className="group aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-100"
              >
                <img
                  src={p.url}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]"
                />
              </button>
            ))}
          </div>
        )}
      </main>

      <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-400">
        Powered by{" "}
        <a href="https://servexaapp.com" target="_blank" rel="noreferrer" className="underline">
          Servexa
        </a>
      </footer>

      {openIdx !== null && photos[openIdx] && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setOpenIdx(null)}
        >
          <button
            type="button"
            onClick={() => setOpenIdx(null)}
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={photos[openIdx].url}
            alt=""
            className="max-h-full max-w-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          {photos.length > 1 && (
            <>
              <button
                type="button"
                className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 px-3 py-2 text-white"
                onClick={(e) => { e.stopPropagation(); setOpenIdx((openIdx - 1 + photos.length) % photos.length); }}
                aria-label="Previous photo"
              >
                ‹
              </button>
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 px-3 py-2 text-white"
                onClick={(e) => { e.stopPropagation(); setOpenIdx((openIdx + 1) % photos.length); }}
                aria-label="Next photo"
              >
                ›
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
