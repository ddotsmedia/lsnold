'use client';

import { useCallback, useEffect, useState } from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { PageSections, usePageSections } from '@/components/PageSections';
import { EditableProse, sectionMap } from '@/lib/renderPageSection';
import { HeroBackground } from '@/components/HeroBackground';
import { usePageMedia } from '@/lib/media';
import Modal from '@/components/Modal';
import VideoUploadModal from '@/components/VideoUploadModal';

interface GalleryImage {
  id: string;
  title: string;
  alt_text: string | null;
  description: string | null;
  image_url: string;
  category_id: string | null;
  category_name: string | null;
}

interface GalleryCategory {
  id: string;
  name: string;
  slug: string;
  image_count: number;
}

/** Uploaded to Cloudinary and played inline. */
interface CloudinaryVideo {
  id: string;
  title: string;
  description: string | null;
  video_url: string;
  thumbnail_url: string | null;
}

/** Hosted on YouTube; only the id is stored, played in an embed on click. */
interface YoutubeVideo {
  id: string;
  title: string;
  description: string | null;
  youtube_id: string;
  thumbnail_url: string | null;
}

const API = process.env.NEXT_PUBLIC_API_URL;

export default function GalleryPage() {
  // Hero image uploaded via admin → Media Library → Pages.
  const pageImages = usePageMedia('gallery');
  // Text written in admin -> Pages -> Text, keyed by section.
  const sections = sectionMap(usePageSections('gallery'));
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [categories, setCategories] = useState<GalleryCategory[]>([]);
  const [active, setActive] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [videos, setVideos] = useState<CloudinaryVideo[]>([]);
  const [ytVideos, setYtVideos] = useState<YoutubeVideo[]>([]);
  // First video is featured; the rest fall through to the grid below it.
  const featuredVideo = ytVideos[0] ?? null;
  const otherVideos = ytVideos.slice(1);

  // Lets /gallery?tab=videos (and #videos) open straight on the Videos filter,
  // which is where the homepage's "See More Videos" link points. Read from
  // window rather than useSearchParams so this page needs no Suspense boundary.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('tab') === 'videos' || window.location.hash === '#videos') {
      setActive('videos');
    }
  }, []);
  const [playing, setPlaying] = useState<YoutubeVideo | null>(null);

  useEffect(() => {
    fetch(`${API}/youtube-videos`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: YoutubeVideo[]) => setYtVideos(Array.isArray(d) ? d : []))
      .catch(() => setYtVideos([]));
  }, []);

  useEffect(() => {
    fetch(`${API}/gallery/categories`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: GalleryCategory[]) => setCategories(Array.isArray(d) ? d : []))
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    const checkAdmin = async () => {
      try {
        const res = await fetch(`${API}/auth/me`);
        if (res.ok) {
          const data = await res.json();
          setIsAdmin(data.isAdmin || false);
        }
      } catch {
        setIsAdmin(false);
      }
    };
    checkAdmin();
  }, []);

  useEffect(() => {
    fetchVideos();
  }, []);

  const fetchVideos = async () => {
    try {
      const res = await fetch(`${API}/videos/list`);
      if (res.ok) {
        const data = await res.json();
        setVideos(data.data || []);
      }
    } catch {
      setVideos([]);
    }
  };

  const handleDeleteVideo = async (videoId: string) => {
    if (!confirm('Delete this video?')) return;
    try {
      const res = await fetch(`${API}/videos/${videoId}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchVideos();
      }
    } catch (err) {
      console.error('Error deleting video:', err);
    }
  };

  const load = useCallback(async (slug: string) => {
    setLoading(true);
    setError(false);
    try {
      const url = slug === 'all' ? `${API}/gallery` : `${API}/gallery?category=${slug}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error();
      const data: GalleryImage[] = await res.json();
      setImages(Array.isArray(data) ? data : []);
    } catch {
      setError(true);
      setImages([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(active);
  }, [active, load]);

  const current = openIndex !== null ? images[openIndex] ?? null : null;

  const step = (by: number) => {
    setOpenIndex((idx) => {
      if (idx === null) return null;
      const next = idx + by;
      return next >= 0 && next < images.length ? next : idx;
    });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') step(-1);
      if (e.key === 'ArrowRight') step(1);
      if (e.key === 'Escape') setOpenIndex(null);
    };
    if (openIndex !== null) document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [openIndex, images.length]);

  const filters = [
    { slug: 'all', name: 'All photos' },
    ...categories,
    { slug: 'videos', name: 'Videos', image_count: videos.length }
  ];

  return (
    <>
      <Header />
      <main className="bg-white">
        <section
          aria-labelledby="gallery-hero"
          className="relative overflow-hidden bg-gradient-to-br from-blue-800 to-blue-500 px-4 py-12 text-center md:py-16"
        >
          <HeroBackground image={pageImages.hero} />
          <div className="relative z-10">
            <h1 id="gallery-hero" className="text-3xl font-bold text-white md:text-4xl lg:text-5xl">
              Gallery
            </h1>
            <p className="mx-auto mt-3 max-w-xl text-base text-blue-50 md:text-lg">
              A look inside our rooms, our garden and our busiest days.
            </p>
          </div>
        </section>
        {/* admin -> Pages -> Gallery -> Text. Renders nothing until a
            section is published, so the page is unchanged by default. */}
        <section className="mx-auto max-w-4xl px-4 empty:hidden md:px-6">
          <EditableProse sections={sections} sectionKey="intro">{null}</EditableProse>
          <EditableProse sections={sections} sectionKey="body">{null}</EditableProse>
        </section>

        <section aria-labelledby="gallery-heading" className="py-10 md:py-16">
          <div className="mx-auto max-w-6xl px-4 md:px-6">
            <h2 id="gallery-heading" className="sr-only">
              Photo gallery
            </h2>

            <ul className="mb-8 flex flex-wrap gap-2">
              {filters.map(({ slug, name }) => (
                <li key={slug}>
                  <button
                    onClick={() => {
                      setActive(slug);
                      setOpenIndex(null);
                    }}
                    className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                      active === slug
                        ? 'bg-blue-600 text-white'
                        : 'border border-gray-300 text-gray-700 hover:border-blue-600 hover:text-blue-600'
                    }`}
                  >
                    {name}
                  </button>
                </li>
              ))}
            </ul>

            {active !== 'videos' && (
              <>
                {loading && (
                  <div className="py-12 text-center">
                    <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
                  </div>
                )}

                {error && (
                  <div className="rounded-lg bg-red-50 p-4 text-red-800">
                    Failed to load gallery. Please try again.
                  </div>
                )}

                {!loading && !error && images.length === 0 && (
                  <div className="py-12 text-center text-gray-500">
                    No images found in this category.
                  </div>
                )}

                {!loading && images.length > 0 && (
                  <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                    {images.map((image, idx) => (
                      <li key={image.id}>
                        <button
                          onClick={() => setOpenIndex(idx)}
                          className="group relative block w-full overflow-hidden rounded-lg bg-gray-100"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={image.image_url}
                            alt={image.alt_text || image.title}
                            className="aspect-square w-full object-cover transition group-hover:scale-105"
                          />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition group-hover:bg-black/30">
                            <span className="text-2xl text-white opacity-0 transition group-hover:opacity-100">
                              👁
                            </span>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}

            {active === 'videos' && (
              <section className="mt-8">
                {isAdmin && (
                  <button
                    onClick={() => setShowUploadModal(true)}
                    className="mb-6 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-semibold"
                  >
                    + Upload Video
                  </button>
                )}

                {featuredVideo && (
                  <div className="mb-12">
                    {/* Featured: first video, given the full width */}
                    <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 to-blue-800 shadow-lg">
                      <div className="grid grid-cols-1 items-center gap-6 p-6 md:grid-cols-2 md:gap-8 md:p-8">
                        <button
                          type="button"
                          onClick={() => setPlaying(featuredVideo)}
                          aria-label={`Play ${featuredVideo.title}`}
                          className="group relative block w-full overflow-hidden rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-blue-700"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={
                              featuredVideo.thumbnail_url ||
                              `https://img.youtube.com/vi/${featuredVideo.youtube_id}/hqdefault.jpg`
                            }
                            alt=""
                            className="aspect-video w-full object-cover"
                          />
                          <span className="absolute inset-0 flex items-center justify-center bg-black/25 transition-colors group-hover:bg-black/40">
                            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/95 shadow-xl transition-transform duration-200 group-hover:scale-110 md:h-20 md:w-20">
                              <svg
                                width={26}
                                height={26}
                                viewBox="0 0 24 24"
                                fill="currentColor"
                                aria-hidden="true"
                                className="ml-1 text-blue-700"
                              >
                                <path d="M8 5v14l11-7z" />
                              </svg>
                            </span>
                          </span>
                        </button>

                        <div className="text-white">
                          <span className="inline-flex rounded-full bg-white/20 px-3 py-1 text-xs font-semibold uppercase tracking-wide">
                            Featured Video
                          </span>
                          <h3 className="mt-3 text-2xl font-bold md:text-3xl">
                            {featuredVideo.title}
                          </h3>
                          {featuredVideo.description && (
                            <p className="mt-3 text-base leading-relaxed text-blue-50">
                              {featuredVideo.description}
                            </p>
                          )}
                          <button
                            type="button"
                            onClick={() => setPlaying(featuredVideo)}
                            className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-lg bg-white px-6 font-semibold text-blue-700 shadow transition-colors hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-blue-700"
                          >
                            <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                              <path d="M8 5v14l11-7z" />
                            </svg>
                            Play Video
                          </button>
                        </div>
                      </div>
                    </div>

                    {otherVideos.length > 0 && (
                      <>
                        <h3 className="mb-4 mt-10 text-lg font-bold text-gray-900">More Videos</h3>
                        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                          {otherVideos.map((v) => (
                            <button
                              key={v.id}
                              type="button"
                              onClick={() => setPlaying(v)}
                              aria-label={`Play ${v.title}`}
                              className="group block overflow-hidden rounded-lg bg-white text-left shadow-md transition-shadow duration-200 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-800"
                            >
                              {/* overflow-hidden here so the thumbnail scale stays inside the card */}
                              <span className="relative block overflow-hidden">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={v.thumbnail_url || `https://img.youtube.com/vi/${v.youtube_id}/hqdefault.jpg`}
                                  alt=""
                                  loading="lazy"
                                  className="aspect-video w-full object-cover transition-transform duration-300 group-hover:scale-105"
                                />
                                <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md bg-blue-700 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow">
                                  <svg width={10} height={10} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                    <path d="M8 5v14l11-7z" />
                                  </svg>
                                  Video
                                </span>
                                <span className="absolute inset-0 flex items-center justify-center bg-black/20 transition-colors group-hover:bg-black/35">
                                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 shadow-lg transition-transform duration-200 group-hover:scale-110">
                                    <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="ml-0.5 text-blue-700">
                                      <path d="M8 5v14l11-7z" />
                                    </svg>
                                  </span>
                                </span>
                              </span>
                              <span className="block p-4">
                                <span className="block font-bold text-gray-900">{v.title}</span>
                                {v.description && (
                                  <span className="mt-1 line-clamp-2 block text-sm text-gray-600">
                                    {v.description}
                                  </span>
                                )}
                              </span>
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {videos.length === 0 && ytVideos.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-gray-600">No videos yet</p>
                    {isAdmin && (
                      <p className="text-sm text-gray-500 mt-2">
                        Click "Upload Video" to add promotional videos
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {videos.map((video) => (
                      <div key={video.id} className="bg-white rounded-lg shadow-md overflow-hidden">
                        <div className="relative bg-black h-48">
                          <video
                            src={video.video_url}
                            poster={video.thumbnail_url ?? undefined}
                            controls
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="p-4">
                          <h3 className="font-bold text-gray-900">{video.title}</h3>
                          <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                            {video.description}
                          </p>
                          {isAdmin && (
                            <button
                              onClick={() => handleDeleteVideo(video.id)}
                              className="mt-4 w-full px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700 transition"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>
        </section>
        {/* Text written in admin -> Pages -> Text. Renders nothing until a
            section has content, so the copy above is untouched by default. */}
        <PageSections pageSlug="gallery" />

      </main>
      <Footer />

      <Modal
        isOpen={current !== null && active !== 'videos'}
        onClose={() => setOpenIndex(null)}
        title={current?.title ?? ''}
        size="lg"
      >
        {current && (
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={current.image_url}
              alt={current.alt_text || current.title}
              className="max-h-[60vh] w-full rounded-lg object-contain"
            />
            {current.category_name && (
              <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-red-600">
                {current.category_name}
              </p>
            )}
            {current.description && (
              <p className="mt-2 text-base leading-relaxed text-gray-700">
                {current.description}
              </p>
            )}
            {images.length > 1 && (
              <div className="mt-6 flex items-center justify-between border-t border-gray-100 pt-4">
                <button
                  type="button"
                  onClick={() => step(-1)}
                  className="min-h-11 rounded-lg px-3 text-sm font-semibold text-blue-800 hover:bg-blue-50"
                >
                  ← Previous
                </button>
                <span className="text-sm text-gray-600">
                  {(openIndex ?? 0) + 1} of {images.length}
                </span>
                <button
                  type="button"
                  onClick={() => step(1)}
                  className="min-h-11 rounded-lg px-3 text-sm font-semibold text-blue-800 hover:bg-blue-50"
                >
                  Next →
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        isOpen={playing !== null}
        onClose={() => setPlaying(null)}
        title={playing?.title ?? ''}
        size="lg"
      >
        {playing && (
          <div>
            {/* Mounted only once a visitor clicks, so no request reaches
                YouTube on page load. nocookie avoids tracking until playback. */}
            <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${playing.youtube_id}?autoplay=1&rel=0`}
                title={playing.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="h-full w-full border-0"
              />
            </div>
            {playing.description && (
              <p className="mt-4 text-base leading-relaxed text-gray-700">{playing.description}</p>
            )}
          </div>
        )}
      </Modal>

      <VideoUploadModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onUploadSuccess={() => {
          fetchVideos();
        }}
      />
    </>
  );
}
