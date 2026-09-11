/**
 * Campus Mesh — Instructor Resource Uploader & Management
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { UploadCloud, File, Trash2, CheckCircle2, AlertCircle, Loader2, Copy, Check } from 'lucide-react';
import type { ResourceInfo } from '@campus-mesh/shared';
import { API_BASE_URL } from '../../config/api.config.js';

interface ResourceUploaderProps {
  sessionId: string;
  instructorToken: string;
}

export function ResourceUploader({ sessionId, instructorToken }: ResourceUploaderProps) {
  const [resources, setResources] = useState<ResourceInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadPercent, setUploadPercent] = useState<number>(0);
  const [statusText, setStatusText] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const fetchResources = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/resources`, {
        headers: { Authorization: `Bearer ${instructorToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setResources(data.resources || []);
      }
    } catch {
      // Ignore initial fetch errors
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, instructorToken]);

  useEffect(() => {
    fetchResources();
  }, [fetchResources]);

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setIsUploading(true);
    setUploadPercent(0);
    setStatusText('Uploading resource payload...');

    const formData = new FormData();
    formData.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE_URL}/api/sessions/${sessionId}/resources`);
    xhr.setRequestHeader('Authorization', `Bearer ${instructorToken}`);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        setUploadPercent(percent);
        if (percent === 100) {
          setStatusText('Generating 256 KB chunk manifest & SHA-256 hashes...');
        }
      }
    };

    xhr.onload = () => {
      setIsUploading(false);
      if (xhr.status === 201) {
        setStatusText('Resource ready!');
        fetchResources();
        if (fileInputRef.current) fileInputRef.current.value = '';
      } else {
        try {
          const errData = JSON.parse(xhr.responseText);
          setError(errData.message || 'Failed to upload resource.');
        } catch {
          setError(`Upload failed with status ${xhr.status}`);
        }
      }
    };

    xhr.onerror = () => {
      setIsUploading(false);
      setError('Network error during file upload.');
    };

    xhr.send(formData);
  };

  const handleDelete = async (resourceId: string) => {
    const confirmDelete = window.confirm('Delete this resource and its chunk manifests?');
    if (!confirmDelete) return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/resources/${resourceId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${instructorToken}` }
      });
      if (res.ok) {
        setResources(prev => prev.filter(r => r.id !== resourceId));
      } else {
        const data = await res.json();
        alert(data.message || 'Failed to delete resource.');
      }
    } catch {
      alert('Error deleting resource.');
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  const copyHash = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5 text-left">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <UploadCloud className="w-5 h-5 text-indigo-400" />
          <h3 className="text-sm font-semibold text-white">Classroom Resources (Origin Storage)</h3>
        </div>
        <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 text-xs font-medium">
          {resources.length} Uploaded
        </span>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Upload Box */}
      <div className="p-4 rounded-xl bg-slate-950 border border-dashed border-slate-800 text-center">
        <input
          ref={fileInputRef}
          type="file"
          disabled={isUploading}
          onChange={handleFileSelected}
          className="hidden"
          id="resource-upload-input"
        />

        {isUploading ? (
          <div className="py-4 space-y-3">
            <Loader2 className="w-6 h-6 animate-spin text-indigo-400 mx-auto" />
            <div className="text-xs text-slate-300 font-medium">{statusText}</div>
            <div className="w-full max-w-xs mx-auto bg-slate-800 rounded-full h-2 overflow-hidden">
              <div
                className="bg-indigo-500 h-full transition-all duration-300"
                style={{ width: `${uploadPercent}%` }}
              />
            </div>
            <div className="text-[11px] text-slate-400">{uploadPercent}% uploaded</div>
          </div>
        ) : (
          <label
            htmlFor="resource-upload-input"
            className="cursor-pointer inline-flex flex-col items-center justify-center p-3 text-slate-400 hover:text-indigo-400 transition-colors"
          >
            <UploadCloud className="w-8 h-8 mb-2 text-indigo-400" />
            <span className="text-xs font-semibold text-slate-200">
              Click to select a file for class distribution
            </span>
            <span className="text-[11px] text-slate-500 mt-0.5">
              Automatically split into deterministic 256 KB SHA-256 verified chunks
            </span>
          </label>
        )}
      </div>

      {/* Resource Table */}
      {isLoading ? (
        <div className="p-4 text-center text-xs text-slate-500">Loading resources...</div>
      ) : resources.length === 0 ? (
        <div className="p-4 text-center text-xs text-slate-500">
          No resources uploaded yet. Upload an installer, dataset, or ISO image above.
        </div>
      ) : (
        <div className="divide-y divide-slate-800/80 max-h-72 overflow-y-auto">
          {resources.map((res) => (
            <div key={res.id} className="py-3 flex items-center justify-between text-xs gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <File className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="font-semibold text-slate-200 truncate">{res.fileName}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5 flex flex-wrap items-center gap-2">
                    <span>{formatBytes(res.fileSize)}</span>
                    <span>•</span>
                    <span>{res.totalChunks.toLocaleString()} chunks</span>
                    <span>•</span>
                    <span className="inline-flex items-center gap-1">
                      <span className="font-mono text-slate-500">{res.fileHash.slice(0, 8)}...</span>
                      <button
                        onClick={() => copyHash(res.fileHash)}
                        className="hover:text-slate-200 text-slate-500"
                        title="Copy SHA-256"
                      >
                        {copiedHash === res.fileHash ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-medium flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  Ready
                </span>
                <button
                  onClick={() => handleDelete(res.id)}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 hover:text-rose-400 text-slate-400 transition-colors"
                  title="Delete Resource"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
