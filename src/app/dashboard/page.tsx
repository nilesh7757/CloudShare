"use client";

import { Suspense, useState, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { FileUpload } from "@/components/FileUpload";
import { UploadSidebar } from "@/components/UploadSidebar";
import { useUploadQueue } from "@/components/providers/UploadContext";
import JSZip from "jszip";
import { 
  Folder, 
  File as FileIcon, 
  Share2, 
  Plus, 
  LogOut, 
  ChevronLeft, 
  Eye, 
  Link as LinkIcon, 
  X,
  Download,
  Trash2,
  Loader2,
  Clock
} from "lucide-react";

function DashboardContent() {
  const { data: session, status } = useSession();
  const { openSidebar, queue, setIsSidebarOpen } = useUploadQueue();
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentFolderId = searchParams.get("folderId") || "";

  const [folders, setFolders] = useState<any[]>([]);
  const [files, setFiles] = useState<any[]>([]);
  const [currentFolderData, setCurrentFolderData] = useState<any>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [shareEmail, setShareEmail] = useState("");
  const [sharingFolderId, setSharingFolderId] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<any | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isZipping, setIsZipping] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    } else if (status === "authenticated") {
      fetchData();
    }
  }, [status, currentFolderId]);

  const fetchData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const parentParam = currentFolderId ? `?parentId=${currentFolderId}` : "";
      const res = await fetch(`/api/folders${parentParam}`);
      const data = await res.json();
      setFolders(data.folders || []);
      setFiles(data.files || []);
      
      if (currentFolderId) {
        const folderDetailsRes = await fetch(`/api/folders/details?id=${currentFolderId}`);
        const folderDetails = await folderDetailsRes.json();
        setCurrentFolderData(folderDetails);
      } else {
        setCurrentFolderData(null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const createFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName) return;
    const folderName = newFolderName;
    setNewFolderName("");
    const tempId = Math.random().toString();
    setFolders(prev => [...prev, { id: tempId, name: folderName, ownerId: (session?.user as any)?.id, isTemp: true }]);
    try {
      const res = await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: folderName, parentId: currentFolderId || null }),
      });
      if (res.ok) {
        const newFolder = await res.json();
        setFolders(prev => prev.map(f => f.id === tempId ? newFolder : f));
      } else {
        setFolders(prev => prev.filter(f => f.id !== tempId));
      }
    } catch (err) {
      setFolders(prev => prev.filter(f => f.id !== tempId));
    }
  };

  const deleteItem = async (id: string, type: "folder" | "file") => {
    if (!confirm(`Permanently delete this ${type}?`)) return;
    if (type === "folder") setFolders(prev => prev.filter(f => f.id !== id));
    else setFiles(prev => prev.filter(f => f.id !== id));
    try {
      const res = await fetch(`/api/delete?id=${id}&type=${type}`, { method: "DELETE" });
      if (!res.ok) fetchData();
    } catch (err) {
      fetchData();
    }
  };

  const shareFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shareEmail || !sharingFolderId) return;
    const res = await fetch("/api/folders/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: shareEmail, folderId: sharingFolderId }),
    });
    if (res.ok) {
      alert("Shared successfully");
      setShareEmail("");
      setSharingFolderId(null);
    }
  };

  const copyShareLink = (folderId: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/dashboard?folderId=${folderId}`);
    alert("Link copied!");
  };

  const handlePreview = async (file: any) => {
    setPreviewFile(file);
    setPreviewContent(null);
    if (file.isEncoded || isNotebook(file.name) || isPython(file.name) || isShell(file.name) || isCpp(file.name) || isMD(file.name)) {
      try {
        const res = await fetch(file.url);
        let text = await res.text();
        if (file.isEncoded) text = atob(text);
        setPreviewContent(text);
      } catch (e) {
        setPreviewContent("Error loading content");
      }
    }
  };

  const downloadFile = async (file: any) => {
    try {
      const res = await fetch(file.url);
      let blob: Blob;

      if (file.isEncoded) {
        const base64 = await res.text();
        const binaryString = atob(base64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
        blob = new Blob([bytes], { type: 'application/octet-stream' });
      } else {
        blob = await res.blob();
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert("Download failed");
    }
  };

  const downloadFolder = async (folder: any) => {
    setIsZipping(true);
    try {
      const res = await fetch(`/api/folders/zip?id=${folder.id}`);
      const manifest = await res.json();
      
      const zip = new JSZip();
      
      for (const item of manifest) {
        const fileRes = await fetch(item.url);
        let content: any;
        
        if (item.isEncoded) {
          const base64 = await fileRes.text();
          const binaryString = atob(base64);
          const len = binaryString.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
          content = bytes;
        } else {
          content = await fileRes.blob();
        }
        
        zip.file(item.path, content);
      }
      
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${folder.name}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert("Failed to create ZIP");
    } finally {
      setIsZipping(false);
    }
  };

  if (status === "loading" || loading) {
    return <div className="p-8 text-center text-gray-400 bg-[#0a0a0a] min-h-screen">Loading...</div>;
  }

  const userId = (session?.user as any)?.id;
  const canUpload = !currentFolderId || currentFolderData?.ownerId === userId || currentFolderData?.accessList?.some((a: any) => a.userId === userId && a.permission === "WRITE");
  const activeUploads = queue.filter(j => j.status === "uploading" || j.status === "queued").length;

  const isImage = (name: string) => /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(name);
  const isPDF = (name: string) => /\.pdf$/i.test(name);
  const isNotebook = (name: string) => /\.ipynb$/i.test(name);
  const isPython = (name: string) => /\.py$/i.test(name);
  const isShell = (name: string) => /\.sh$/i.test(name);
  const isCpp = (name: string) => /\.(cpp|h|hpp|c|cc)$/i.test(name);
  const isMD = (name: string) => /\.md$/i.test(name);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#ededed]">
      {isZipping && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex flex-col items-center justify-center">
          <Loader2 className="text-blue-500 animate-spin mb-4" size={48} />
          <p className="text-white font-bold animate-pulse uppercase tracking-widest">Generating Secure Archive...</p>
        </div>
      )}
      
      <UploadSidebar />

      <nav className="bg-[#111] border-b border-gray-800 p-4 flex justify-between items-center sticky top-0 z-50">
        <h1 className="text-xl font-bold text-blue-500 tracking-tight">CloudShare</h1>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => openSidebar(true)}
            className="relative p-2 hover:bg-[#1a1a1a] rounded-lg transition"
          >
            <Clock size={20} className={activeUploads > 0 ? "text-blue-500 animate-pulse" : "text-gray-400"} />
            {activeUploads > 0 && (
              <span className="absolute top-0 right-0 w-4 h-4 bg-blue-600 text-[10px] font-bold rounded-full flex items-center justify-center">
                {activeUploads}
              </span>
            )}
          </button>
          <span className="text-sm text-gray-400 hidden sm:inline">{session?.user?.email}</span>
          <button onClick={() => signOut()} className="text-sm text-gray-400 hover:text-white transition flex items-center gap-1">
            <LogOut size={16} /> Logout
          </button>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto p-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div className="flex items-center gap-3">
            {currentFolderId && (
              <button
                onClick={() => {
                  router.back();
                  setFolders([]);
                  setFiles([]);
                }}
                className="p-2 bg-[#1a1a1a] hover:bg-[#2a2a2a] rounded-full transition active:scale-90"
              >
                <ChevronLeft size={20} />
              </button>
            )}
            <div>
              <h2 className="text-2xl font-semibold">{currentFolderId ? currentFolderData?.name : "My Workspace"}</h2>
              {currentFolderData?.owner && currentFolderData.ownerId !== userId && (
                <p className="text-xs text-gray-500">Shared by {currentFolderData.owner.email}</p>
              )}
            </div>
          </div>
          <form onSubmit={createFolder} className="flex gap-2 w-full sm:w-auto">
            <input type="text" placeholder="New Folder..." value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} className="bg-[#1a1a1a] border border-gray-800 rounded p-2 text-sm focus:outline-none focus:border-blue-500 flex-1" />
            <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white p-2 rounded transition"><Plus size={20} /></button>
          </form>
        </div>

        {currentFolderId && canUpload && (
          <div className="mb-8">
            <FileUpload folderId={currentFolderId} onUploadComplete={fetchData} />
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {folders.map((folder) => (
            <div
              key={folder.id}
              onClick={() => {
                // Smooth Phase 1: Update URL and clear view instantly
                router.push(`/dashboard?folderId=${folder.id}`);
                setFolders([]);
                setFiles([]);
              }}
              className="bg-[#111] p-4 rounded-xl border border-gray-800 hover:border-blue-500/50 hover:bg-[#161616] transition-all group relative cursor-pointer active:scale-[0.98]"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/10 rounded-lg group-hover:bg-blue-500/20 transition-colors">
                  <Folder className="text-blue-500" size={24} fill="currentColor" fillOpacity={0.2} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate text-gray-200 group-hover:text-white transition-colors">{folder.name}</p>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider">Folder</p>
                </div>
              </div>
              <div 
                className="absolute top-4 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => e.stopPropagation()} // Prevent navigation when clicking actions
              >
                <button onClick={() => downloadFolder(folder)} className="p-1.5 hover:bg-[#222] rounded text-gray-400 hover:text-white" title="Download ZIP"><Download size={16} /></button>
                {folder.ownerId === userId && (
                  <><button onClick={() => setSharingFolderId(folder.id)} className="p-1.5 hover:bg-[#222] rounded text-gray-400 hover:text-blue-400"><Share2 size={16} /></button>
                  <button onClick={() => deleteItem(folder.id, "folder")} className="p-1.5 hover:bg-[#222] rounded text-gray-400 hover:text-red-500"><Trash2 size={16} /></button></>
                )}
                <button onClick={() => copyShareLink(folder.id)} className="p-1.5 hover:bg-[#222] rounded text-gray-400 hover:text-green-400"><LinkIcon size={16} /></button>
              </div>
            </div>
          ))}

          {files.map((file) => (
            <div key={file.id} className="bg-[#111] p-4 rounded-xl border border-gray-800 hover:border-green-500/50 transition-all group relative">
              <div className="flex items-center gap-3 mb-3">
                <div className={`p-2 rounded-lg ${isNotebook(file.name) ? "bg-orange-500/10" : isPython(file.name) ? "bg-blue-500/10" : isShell(file.name) ? "bg-amber-500/10" : isCpp(file.name) ? "bg-indigo-500/10" : isMD(file.name) ? "bg-gray-500/10" : "bg-green-500/10"}`}>
                  <FileIcon className={isNotebook(file.name) ? "text-orange-500" : isPython(file.name) ? "text-blue-400" : isShell(file.name) ? "text-amber-400" : isCpp(file.name) ? "text-indigo-400" : isMD(file.name) ? "text-gray-400" : "text-green-500"} size={24} />
                </div>
                <div className="flex-1 min-w-0 pr-6">
                  <p className="font-medium truncate text-gray-200">{file.name}</p>
                  <p className="text-[10px] text-gray-500 uppercase">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => handlePreview(file)} className="flex-1 flex justify-center items-center gap-2 bg-[#1a1a1a] hover:bg-[#2a2a2a] text-xs py-2 rounded text-gray-300 transition"><Eye size={14} /> Preview</button>
                <button onClick={() => downloadFile(file)} className="p-2 bg-[#1a1a1a] hover:bg-[#2a2a2a] rounded text-gray-300 transition"><Download size={14} /></button>
              </div>
              <button onClick={() => deleteItem(file.id, "file")} className="absolute top-4 right-2 opacity-0 group-hover:opacity-100 p-1.5 hover:bg-[#222] rounded text-gray-400 hover:text-red-500 transition"><Trash2 size={16} /></button>
            </div>
          ))}
        </div>
      </main>

      {/* Share Modal */}
      {sharingFolderId && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#111] border border-gray-800 p-6 rounded-2xl max-w-sm w-full">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold">Share Folder</h3>
              <button onClick={() => setSharingFolderId(null)}><X size={20} className="text-gray-500 hover:text-white" /></button>
            </div>
            <form onSubmit={shareFolder} className="space-y-4">
              <input type="email" placeholder="Email address..." value={shareEmail} onChange={(e) => setShareEmail(e.target.value)} className="w-full bg-[#1a1a1a] border border-gray-800 rounded p-3 text-sm focus:outline-none focus:border-blue-500" required />
              <button type="submit" className="w-full py-3 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition">Send Invite</button>
            </form>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewFile && (
        <div className="fixed inset-0 bg-black/95 flex flex-col z-[60]">
          <div className="p-4 flex justify-between items-center bg-[#111] border-b border-gray-800">
            <h3 className="font-medium truncate pr-8">{previewFile.name}</h3>
            <button onClick={() => setPreviewFile(null)} className="p-2 hover:bg-[#222] rounded-full text-gray-400 hover:text-white transition"><X size={24} /></button>
          </div>
          <div className="flex-1 flex items-center justify-center p-4 overflow-auto">
            {isImage(previewFile.name) ? <img src={previewFile.url} alt={previewFile.name} className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" /> :
             isPDF(previewFile.name) ? <iframe src={`${previewFile.url}#toolbar=0`} className="w-full h-full max-w-5xl rounded-lg bg-white" /> :
             previewContent ? <div className="w-full h-full max-w-5xl bg-[#0a0a0a] border border-gray-800 rounded-lg p-6 overflow-auto font-mono text-xs whitespace-pre-wrap">{previewContent}</div> :
             <div className="text-center p-12 bg-[#111] rounded-2xl border border-gray-800">
               <FileIcon size={64} className="text-gray-700 mx-auto mb-4" />
               <p className="text-gray-400 mb-6">Preview unavailable for this type.</p>
               <button onClick={() => downloadFile(previewFile)} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">Download to View</button>
             </div>}
          </div>
        </div>
      )}
    </div>
  );
}
