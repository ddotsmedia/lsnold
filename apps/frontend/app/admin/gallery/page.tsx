'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '../../../lib/api';
import type { PaginatedResponse } from '../../../lib/api';
import { Button, Modal, FormField, Input, Toast, ConfirmDialog } from '../../../components/admin/shared';
import VideoUploadModal from '../../../components/VideoUploadModal';
import { YoutubeManager } from '../../../components/admin/YoutubeManager';

interface Category { id: string; name: string; slug: string; description: string; image_count: number; sort_order: number; }
interface GalleryImage { id: string; category_id: string; image_url: string; title: string; description: string; category_name: string; sort_order: number; }
interface Video { id: string; title: string; description: string; video_url: string; thumbnail_url: string; cloudinary_public_id: string; uploaded_by: string; created_at: string; deleted_at: string | null; }

export default function GalleryPage() {
  // Shared state
  const [activeTab, setActiveTab] = useState<'images' | 'videos' | 'youtube'>('images');
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Images state
  const [categories, setCategories] = useState<Category[]>([]);
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 30, total: 0, totalPages: 0 });
  const [selectedCat, setSelectedCat] = useState('');
  const [showCatModal, setShowCatModal] = useState(false);
  const [editCat, setEditCat] = useState<Category | null>(null);
  const [catForm, setCatForm] = useState({ name: '', slug: '', description: '' });
  const [showUpload, setShowUpload] = useState(false);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadDesc, setUploadDesc] = useState('');
  const [uploadCat, setUploadCat] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<{ type: 'cat' | 'img'; id: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Videos state
  const [videos, setVideos] = useState<Video[]>([]);
  const [showVideoUpload, setShowVideoUpload] = useState(false);

  // Fetch categories
  const fetchCategories = useCallback(async () => {
    try {
      const res = await api<Category[]>('/admin/gallery/categories');
      setCategories(res);
    } catch { /* ignore */ }
  }, []);

  // Fetch images
  const fetchImages = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const res = await api<PaginatedResponse<GalleryImage>>('/admin/gallery/images', {
        params: { page, limit: 30, categoryId: selectedCat },
      });
      setImages(res.data);
      setPagination(res.pagination);
    } catch { setToast({ message: 'Failed to load images', type: 'error' }); }
    finally { setLoading(false); }
  }, [selectedCat]);

  // Fetch videos
  const fetchVideos = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ data: Video[] }>('/videos/list');
      setVideos(res.data || []);
    } catch { setToast({ message: 'Failed to load videos', type: 'error' }); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchCategories(); }, [fetchCategories]);
  useEffect(() => { if (activeTab === 'images') fetchImages(); }, [fetchImages, activeTab]);
  useEffect(() => { if (activeTab === 'videos') fetchVideos(); }, [fetchVideos, activeTab]);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); } }, [toast]);

  // Image functions
  const saveCategory = async () => {
    try {
      if (editCat) {
        await api(`/admin/gallery/categories/${editCat.id}`, { method: 'PUT', body: JSON.stringify(catForm) });
      } else {
        await api('/admin/gallery/categories', { method: 'POST', body: JSON.stringify(catForm) });
      }
      setToast({ message: `Category ${editCat ? 'updated' : 'created'}`, type: 'success' });
      setShowCatModal(false);
      setEditCat(null);
      setCatForm({ name: '', slug: '', description: '' });
      fetchCategories();
    } catch { setToast({ message: 'Failed to save category', type: 'error' }); }
  };

  const uploadImage = async () => {
    const files = fileRef.current?.files;
    if (!files || files.length === 0) return;
    try {
      if (files.length === 1) {
        const fd = new FormData();
        fd.append('image', files[0]);
        fd.append('category_id', uploadCat || selectedCat || categories[0]?.id || '');
        fd.append('title', uploadTitle || files[0].name);
        if (uploadDesc) fd.append('description', uploadDesc);
        await api('/admin/gallery/images', { method: 'POST', body: fd });
      } else {
        const fd = new FormData();
        for (let i = 0; i < files.length; i++) fd.append('images', files[i]);
        fd.append('category_id', uploadCat || selectedCat || categories[0]?.id || '');
        await api('/admin/gallery/images/bulk', { method: 'POST', body: fd });
      }
      setToast({ message: `${files.length} image(s) uploaded`, type: 'success' });
      setShowUpload(false);
      setUploadTitle('');
      setUploadDesc('');
      fetchImages();
      fetchCategories();
    } catch { setToast({ message: 'Upload failed', type: 'error' }); }
  };

  // Video functions
  const deleteVideo = async (videoId: string) => {
    try {
      await api(`/videos/${videoId}`, { method: 'DELETE' });
      setToast({ message: 'Video deleted', type: 'success' });
      fetchVideos();
    } catch { setToast({ message: 'Failed to delete video', type: 'error' }); }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      if (confirmDelete.type === 'cat') {
        await api(`/admin/gallery/categories/${confirmDelete.id}`, { method: 'DELETE' });
        fetchCategories();
      } else {
        await api(`/admin/gallery/images/${confirmDelete.id}`, { method: 'DELETE' });
        fetchImages(pagination.page);
        fetchCategories();
      }
      setToast({ message: 'Deleted', type: 'success' });
    } catch { setToast({ message: 'Failed to delete', type: 'error' }); }
    setConfirmDelete(null);
  };

  return (
    <div className="space-y-6">
      {/* Tab switcher */}
      <div className="flex gap-2 border-b border-panel-line">
        <button
          onClick={() => setActiveTab('images')}
          className={`px-4 py-2 font-medium text-sm transition-colors border-b-2 ${
            activeTab === 'images'
              ? 'text-emerald-400 border-emerald-500'
              : 'text-panel-body border-transparent hover:text-panel-body'
          }`}
        >
          Images ({categories.reduce((s, c) => s + c.image_count, 0)})
        </button>
        <button
          onClick={() => setActiveTab('videos')}
          className={`px-4 py-2 font-medium text-sm transition-colors border-b-2 ${
            activeTab === 'videos'
              ? 'text-emerald-400 border-emerald-500'
              : 'text-panel-body border-transparent hover:text-panel-body'
          }`}
        >
          Videos ({videos.length})
        </button>
        <button
          onClick={() => setActiveTab('youtube')}
          className={`px-4 py-2 font-medium text-sm transition-colors border-b-2 ${
            activeTab === 'youtube'
              ? 'text-emerald-400 border-emerald-500'
              : 'text-panel-body border-transparent hover:text-panel-body'
          }`}
        >
          YouTube Videos
        </button>
      </div>

      {activeTab === 'youtube' && <YoutubeManager />}

      {/* IMAGES TAB */}
      {activeTab === 'images' && (
        <div className="space-y-6">
          {/* Category bar */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => { setSelectedCat(''); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                !selectedCat ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'text-panel-body border-panel-line hover:border-panel-line-2'
              }`}
            >
              All ({categories.reduce((s, c) => s + c.image_count, 0)})
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCat(cat.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border group relative ${
                  selectedCat === cat.id ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'text-panel-body border-panel-line hover:border-panel-line-2'
                }`}
              >
                {cat.name} ({cat.image_count})
                <span
                  className="hidden group-hover:inline ml-2 text-panel-muted hover:text-red-400"
                  onClick={(e) => { e.stopPropagation(); setConfirmDelete({ type: 'cat', id: cat.id }); }}
                >×</span>
              </button>
            ))}
            <Button size="sm" variant="secondary" onClick={() => { setCatForm({ name: '', slug: '', description: '' }); setEditCat(null); setShowCatModal(true); }}>
              + Category
            </Button>
          </div>

          {/* Actions */}
          <div className="flex justify-between items-center">
            <p className="text-sm text-panel-muted">{pagination.total} images</p>
            <Button onClick={() => setShowUpload(true)}>Upload Images</Button>
          </div>

          {/* Image Grid */}
          {loading ? (
            <div className="flex justify-center py-16">
              <div className="w-8 h-8 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
            </div>
          ) : images.length === 0 ? (
            <div className="text-center py-16 text-panel-muted">No images found. Upload some to get started.</div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {images.map((img) => (
                <div key={img.id} className="group relative bg-panel-surface rounded-xl border border-panel-line/50 overflow-hidden">
                  <div className="aspect-square bg-panel-surface">
                    <img
                      src={img.image_url}
                      alt={img.title}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </div>
                  <div className="p-2.5">
                    <p className="text-xs text-panel-body truncate">{img.title}</p>
                    <p className="text-[10px] text-panel-faint truncate">{img.category_name}</p>
                  </div>
                  <button
                    onClick={() => setConfirmDelete({ type: 'img', id: img.id })}
                    className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/60 text-panel-body hover:text-red-400 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {pagination.totalPages > 1 && (
            <div className="flex justify-center gap-2 pt-4">
              <Button size="sm" variant="secondary" onClick={() => fetchImages(pagination.page - 1)} disabled={pagination.page <= 1}>‹ Prev</Button>
              <span className="text-xs text-panel-muted flex items-center">Page {pagination.page} of {pagination.totalPages}</span>
              <Button size="sm" variant="secondary" onClick={() => fetchImages(pagination.page + 1)} disabled={pagination.page >= pagination.totalPages}>Next ›</Button>
            </div>
          )}

          {/* Category Modal */}
          <Modal open={showCatModal} onClose={() => setShowCatModal(false)} title={editCat ? 'Edit Category' : 'New Category'}>
            <div className="space-y-4">
              <FormField label="Name"><Input value={catForm.name} onChange={(e) => setCatForm({ ...catForm, name: e.target.value, slug: e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') })} /></FormField>
              <FormField label="Slug"><Input value={catForm.slug} onChange={(e) => setCatForm({ ...catForm, slug: e.target.value })} /></FormField>
              <FormField label="Description"><Input value={catForm.description} onChange={(e) => setCatForm({ ...catForm, description: e.target.value })} /></FormField>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="secondary" onClick={() => setShowCatModal(false)}>Cancel</Button>
                <Button onClick={saveCategory}>{editCat ? 'Update' : 'Create'}</Button>
              </div>
            </div>
          </Modal>
        </div>
      )}

      {/* VIDEOS TAB */}
      {activeTab === 'videos' && (
        <div className="space-y-6">
          {/* Actions */}
          <div className="flex justify-between items-center">
            <p className="text-sm text-panel-muted">{videos.length} videos</p>
            <Button onClick={() => setShowVideoUpload(true)}>+ Upload Video</Button>
          </div>

          {/* Video Grid */}
          {loading ? (
            <div className="flex justify-center py-16">
              <div className="w-8 h-8 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
            </div>
          ) : videos.length === 0 ? (
            <div className="text-center py-16 text-panel-muted">No videos yet. Upload one to get started.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {videos.map((video) => (
                <div key={video.id} className="group relative bg-panel-surface rounded-xl border border-panel-line/50 overflow-hidden">
                  <div className="aspect-video bg-panel-surface">
                    <video
                      src={video.video_url}
                      poster={video.thumbnail_url}
                      className="w-full h-full object-cover"
                      controls
                    />
                  </div>
                  <div className="p-3">
                    <p className="text-sm text-panel-body font-medium truncate">{video.title}</p>
                    <p className="text-xs text-panel-faint truncate mt-1">{video.description}</p>
                    <p className="text-xs text-panel-muted mt-2">{new Date(video.created_at).toLocaleDateString()}</p>
                  </div>
                  <button
                    onClick={() => deleteVideo(video.id)}
                    className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/60 text-panel-body hover:text-red-400 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Video Upload Modal */}
          <VideoUploadModal
            isOpen={showVideoUpload}
            onClose={() => setShowVideoUpload(false)}
            onUploadSuccess={() => {
              fetchVideos();
            }}
          />
        </div>
      )}

      {/* Image Upload Modal (existing) */}
      <Modal open={showUpload} onClose={() => setShowUpload(false)} title="Upload Images">
        <div className="space-y-4">
          <FormField label="Category">
            <select value={uploadCat} onChange={(e) => setUploadCat(e.target.value)} className="w-full px-3 py-2 bg-panel-surface border border-panel-line rounded-lg text-sm text-panel-body">
              {categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
            </select>
          </FormField>
          <FormField label="Title"><Input value={uploadTitle} onChange={(e) => setUploadTitle(e.target.value)} placeholder="Optional" /></FormField>
          <FormField label="Description"><Input value={uploadDesc} onChange={(e) => setUploadDesc(e.target.value)} placeholder="Optional" /></FormField>
          <FormField label="Images">
            <input ref={fileRef} type="file" multiple accept="image/*" className="w-full text-sm text-panel-muted file:mr-3 file:px-3 file:py-1.5 file:bg-emerald-500/10 file:text-emerald-400 file:border file:border-emerald-500/30 file:rounded" />
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowUpload(false)}>Cancel</Button>
            <Button onClick={uploadImage}>Upload</Button>
          </div>
        </div>
      </Modal>

      {/* Delete confirmation */}
      <ConfirmDialog open={!!confirmDelete} onClose={() => setConfirmDelete(null)} onConfirm={handleDelete} title="Delete?" message={confirmDelete?.type === 'cat' ? 'Delete this category?' : 'Delete this image?'} />

      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  );
}
