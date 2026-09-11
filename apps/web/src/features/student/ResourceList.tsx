/**
 * Campus Mesh — Student Available Resources & HTTP Chunk Verification
 */

import { useState, useEffect, useCallback } from 'react';
import { Package, CheckCircle2, ShieldCheck, FileCode, Loader2, AlertCircle, Download } from 'lucide-react';
import type { ResourceInfo, ResourceManifest } from '@campus-mesh/shared';
import { API_BASE_URL } from '../../config/api.config.js';
import { useToast } from '../../context/ToastContext.js';

interface ResourceListProps {
  sessionId: string;
  peerToken: string;
  onDownloadResource?: (resourceId: string) => void;
  downloadingResourceId?: string | null;
}

export function ResourceList({
  sessionId,
  peerToken,
  onDownloadResource,
  downloadingResourceId
}: ResourceListProps) {
  const { showToast } = useToast();
  const [resources, setResources] = useState<ResourceInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeManifest, setActiveManifest] = useState<ResourceManifest | null>(null);
  const [manifestLoadingId, setManifestLoadingId] = useState<string | null>(null);
  const [verifyingChunkId, setVerifyingChunkId] = useState<string | null>(null);
  const [verificationResult, setVerificationResult] = useState<{
    resourceId: string;
    verified: boolean;
    chunkHash: string;
    message: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchResources = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/resources`, {
        headers: { Authorization: `Bearer ${peerToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setResources(data.resources || []);
      } else {
        const errData = await res.json();
        setError(errData.message || 'Failed to fetch resources.');
      }
    } catch {
      setError('Network error loading resources.');
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, peerToken]);

  useEffect(() => {
    fetchResources();
  }, [fetchResources]);

  const handleInspectManifest = async (resourceId: string) => {
    setManifestLoadingId(resourceId);
    try {
      const res = await fetch(`${API_BASE_URL}/api/resources/${resourceId}/manifest`, {
        headers: { Authorization: `Bearer ${peerToken}` }
      });
      if (res.ok) {
        const manifest = await res.json();
        setActiveManifest(manifest);
      } else {
        showToast('Failed to load resource manifest.', 'error');
      }
    } catch {
      showToast('Error fetching manifest.', 'error');
    } finally {
      setManifestLoadingId(null);
    }
  };

  const handleVerifyChunk = async (resource: ResourceInfo) => {
    setVerifyingChunkId(resource.id);
    setVerificationResult(null);

    try {
      // 1. Fetch chunk index 0 from HTTP origin fallback endpoint
      const startTime = performance.now();
      const res = await fetch(`${API_BASE_URL}/api/resources/${resource.id}/chunks/0`, {
        headers: { Authorization: `Bearer ${peerToken}` }
      });

      if (!res.ok) {
        throw new Error(`HTTP Error: ${res.status} ${res.statusText}`);
      }

      const expectedHeaderHash = res.headers.get('X-Chunk-SHA256');
      const arrayBuffer = await res.arrayBuffer();
      const downloadMs = Math.round(performance.now() - startTime);

      // 2. Hardware-accelerated browser SHA-256 verification using crypto.subtle
      const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const computedHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      const matches = computedHex.toLowerCase() === expectedHeaderHash?.toLowerCase();

      if (matches) {
        showToast('Chunk #0 verified: SHA-256 signature matches manifest!', 'success');
      } else {
        showToast('Checksum verification failed!', 'error');
      }

      setVerificationResult({
        resourceId: resource.id,
        verified: matches,
        chunkHash: computedHex,
        message: matches
          ? `Chunk #0 (${arrayBuffer.byteLength.toLocaleString()} B) verified in ${downloadMs}ms! SHA-256 matches origin manifest.`
          : 'SHA-256 checksum mismatch!'
      });
    } catch (err: unknown) {
      const msg = (err as Error).message || 'Failed to download and verify chunk.';
      showToast(msg, 'error');
      setVerificationResult({
        resourceId: resource.id,
        verified: false,
        chunkHash: '',
        message: msg
      });
    } finally {
      setVerifyingChunkId(null);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5 text-left">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package className="w-5 h-5 text-indigo-400" />
          <h3 className="text-sm font-semibold text-white">Classroom Resources</h3>
        </div>
        <button
          onClick={fetchResources}
          className="text-xs text-slate-400 hover:text-indigo-400 transition-colors"
        >
          Refresh List
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Verification Result Banner */}
      {verificationResult && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${
            verificationResult.verified
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/20 text-rose-300'
          }`}
        >
          <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
          <div>
            <div className="font-semibold">{verificationResult.message}</div>
            {verificationResult.chunkHash && (
              <div className="font-mono text-[11px] text-slate-400 mt-1 break-all">
                Chunk Hash: {verificationResult.chunkHash}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Resource Cards */}
      {isLoading ? (
        <div className="p-6 text-center text-xs text-slate-500">Loading classroom resources...</div>
      ) : resources.length === 0 ? (
        <div className="p-8 text-center rounded-xl bg-slate-950/50 border border-dashed border-slate-800">
          <p className="text-xs text-slate-500">
            No resources uploaded by the instructor for this session yet.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {resources.map((res) => (
            <div
              key={res.id}
              className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold text-slate-200 text-sm">{res.fileName}</div>
                  <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
                    <span>{formatBytes(res.fileSize)}</span>
                    <span>•</span>
                    <span>{res.totalChunks.toLocaleString()} chunks (256 KB each)</span>
                  </div>
                </div>

                <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-medium flex items-center gap-1 shrink-0">
                  <CheckCircle2 className="w-3 h-3" />
                  Origin Ready
                </span>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-900">
                {onDownloadResource && (
                  <button
                    onClick={() => {
                      showToast(`Starting swarm download for ${res.fileName}...`, 'info');
                      onDownloadResource(res.id);
                    }}
                    disabled={downloadingResourceId === res.id}
                    className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold transition-all flex items-center gap-1.5 shadow-sm shadow-indigo-600/30"
                  >
                    {downloadingResourceId === res.id ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Swarm Active...</span>
                      </>
                    ) : (
                      <>
                        <Download className="w-3.5 h-3.5" />
                        <span>Download via Swarm</span>
                      </>
                    )}
                  </button>
                )}

                <button
                  onClick={() => handleVerifyChunk(res)}
                  disabled={verifyingChunkId === res.id}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600/10 hover:bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 text-xs font-medium transition-all flex items-center gap-1.5"
                >
                  {verifyingChunkId === res.id ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Streaming & Verifying...</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Test HTTP Chunk #0</span>
                    </>
                  )}
                </button>

                <button
                  onClick={() => handleInspectManifest(res.id)}
                  disabled={manifestLoadingId === res.id}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-all flex items-center gap-1.5 border border-slate-700"
                >
                  {manifestLoadingId === res.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <FileCode className="w-3.5 h-3.5 text-slate-400" />
                  )}
                  <span>Inspect Manifest</span>
                </button>
              </div>

              {/* Expanded Manifest Drawer */}
              {activeManifest && activeManifest.resourceId === res.id && (
                <div className="mt-3 p-3.5 rounded-xl bg-slate-900 border border-slate-800 text-[11px] space-y-2">
                  <div className="flex items-center justify-between text-slate-400 font-medium">
                    <span className="font-semibold text-slate-200">Deterministic SHA-256 Manifest</span>
                    <button
                      onClick={() => setActiveManifest(null)}
                      className="text-slate-500 hover:text-slate-300"
                    >
                      Close
                    </button>
                  </div>
                  <div className="font-mono text-slate-400 break-all">
                    File Hash: <span className="text-slate-200">{activeManifest.fileHash}</span>
                  </div>
                  <div className="text-slate-400">
                    Chunk Sample (First 3 Chunks):
                  </div>
                  <div className="space-y-1 font-mono text-[10px] text-slate-400">
                    {activeManifest.chunks.slice(0, 3).map((chunk) => (
                      <div key={chunk.index} className="flex items-center justify-between">
                        <span>Chunk #{chunk.index} ({formatBytes(chunk.size)}):</span>
                        <span className="text-indigo-400">{chunk.sha256.slice(0, 16)}...</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
