"use client";

import { Suspense, useState, useEffect, useMemo } from "react";
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
  Clock,
  Star,
  Search,
  ArrowUpDown,
  Palette,
  Check
} from "lucide-react";

const FOLDER_COLORS = [
  { name: "blue", class: "text-blue-500", bg: "bg-blue-500/10" },
  { name: "red", class: "text-red-500", bg: "bg-red-500/10" },
  { name: "green", class: "text-green-500", bg: "bg-green-500/10" },
  { name: "purple", class: "text-purple-500", bg: "bg-purple-500/10" },
  { name: "orange", class: "text-orange-500", bg: "bg-orange-500/10" },
  { name: "pink", class: "text-pink-500", bg: "bg-pink-500/10" },
];

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
  
  // New States for Intelligence
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{folders: any[], files: any[]} | null>(null);
  const [sortBy, setSortType] = useState<"name" | "date" | "size">("name");
  const [activeColorPicker, setActiveColorPicker] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    } else if (status === "authenticated") {
      fetchData();
    }
  }, [status, currentFolderId]);

  // Global Search Logic
  useEffect(() => {
    const delayDebounce = setTimeout(async () => {
      if (searchQuery.length >= 2) {
        const res = await fetch(`/api/search?q=${searchQuery}`);
        const data = await res.json();
        setSearchResults(data);
      } else {
        setSearchResults(null);
      }
    }, 300);
    return () => clearTimeout(delayDebounce);
  }, [searchQuery]);

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

  const updateMetadata = async (id: string, type: "folder" | "file", updates: any) => {
    // Optimistic Update
    if (type === "folder") {
      setFolders(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
    } else {
      setFiles(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
    }

    try {
      await fetch("/api/update", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, type, updates }),
      });
    } catch (e) {
      fetchData(true); // Rollback on error
    }
  };

  // Sorting Logic
  const sortedItems = useMemo(() => {
    const sortFn = (a: any, b: any) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "date") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (sortBy === "size") return (b.size || 0) - (a.size || 0);
      return 0;
    };

    // Keep Starred items at the top
    const starredFolders = folders.filter(f => f.isStarred).sort(sortFn);
    const regularFolders = folders.filter(f => !f.isStarred).sort(sortFn);
    const starredFiles = files.filter(f => f.isStarred).sort(sortFn);
    const regularFiles = files.filter(f => !f.isStarred).sort(sortFn);

    return {
      folders: [...starredFolders, ...regularFolders],
      files: [...starredFiles, ...regularFiles]
    };
  }, [folders, files, sortBy]);

  const createFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName) return;
    const folderName = newFolderName;
    setNewFolderName("");
    const tempId = Math.random().toString();
    setFolders(prev => [...prev, { id: tempId, name: folderName, ownerId: (session?.user as any)?.id, isTemp: true, color: "blue" }]);
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

  const getDownloadUrl = (file: any) => `/api/files/download?key=${file.key}`;

  const handlePreview = async (file: any) => {
    setPreviewFile(file);
    setPreviewContent(null);
    const isTextBased = file.isEncoded || isNotebook(file.name) || isPython(file.name) || isShell(file.name) || isCpp(file.name) || isMD(file.name);
    
    if (isTextBased && file.size < 10 * 1024 * 1024) {
      try {
        const res = await fetch(getDownloadUrl(file));
        let text = await res.text();
        if (file.isEncoded) text = atob(text);
        setPreviewContent(text);
      } catch (e) {
        setPreviewContent("Error loading content");
      }
    } else if (isTextBased && file.size >= 10 * 1024 * 1024) {
      setPreviewContent("LARGE_FILE_DETECTED");
    }
  };

  const downloadFile = async (file: any) => {
    try {
      const res = await fetch(getDownloadUrl(file));
      if (!res.ok) throw new Error("Server error");
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
    } catch (e: any) {
      alert(`Download failed: ${e.message}`);
    }
  };

  const downloadFolder = async (folder: any) => {
    setIsZipping(true);
    try {
      const res = await fetch(`/api/folders/zip?id=${folder.id}`);
      const manifest = await res.json();
      const zip = new JSZip();
      for (const item of manifest) {
        const fileRes = await fetch(`/api/files/download?key=${item.key}`);
        let content = item.isEncoded ? new Uint8Array([...atob(await fileRes.text())].map(c => c.charCodeAt(0))) : await fileRes.blob();
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
      alert("ZIP failed");
    } finally { setIsZipping(false); }
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

  const displayFolders = searchResults ? searchResults.folders : sortedItems.folders;
  const displayFiles = searchResults ? searchResults.files : sortedItems.files;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#ededed]">
      {isZipping && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex flex-col items-center justify-center">
          <Loader2 className="text-blue-500 animate-spin mb-4" size={48} />
          <p className="text-white font-bold animate-pulse uppercase tracking-widest">Generating Secure Archive...</p>
        </div>
      )}
      
      <UploadSidebar />

      <nav className="bg-[#111] border-b border-gray-800 p-4 flex justify-between items-center sticky top-0 z-50 gap-4">
        <h1 className="text-xl font-bold text-blue-500 tracking-tight shrink-0">CloudShare</h1>
        
        {/* Intelligence: Global Search Bar */}
        <div className="flex-1 max-w-xl relative group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-blue-500 transition-colors" size={18} />
          <input 
            type="text" 
            placeholder="Search files and folders..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#1a1a1a] border border-gray-800 rounded-xl py-2 pl-10 pr-4 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all shadow-inner"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">
              <X size={14} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
          <button onClick={() => openSidebar(true)} className="relative p-2 hover:bg-[#1a1a1a] rounded-lg transition">
            <Clock size={20} className={activeUploads > 0 ? "text-blue-500 animate-pulse" : "text-gray-400"} />
            {activeUploads > 0 && <span className="absolute top-0 right-0 w-4 h-4 bg-blue-600 text-[10px] font-bold rounded-full flex items-center justify-center">{activeUploads}</span>}
          </button>
          <button onClick={() => signOut()} className="text-sm text-gray-400 hover:text-white transition hidden sm:flex items-center gap-1">
            <LogOut size={16} /> Logout
          </button>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto p-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div className="flex items-center gap-3">
            {currentFolderId && (
              <button onClick={() => { router.back(); setFolders([]); setFiles([]); }} className="p-2 bg-[#1a1a1a] hover:bg-[#2a2a2a] rounded-full transition active:scale-90"><ChevronLeft size={20} /></button>
            )}
            <div>
              <h2 className="text-2xl font-semibold">{currentFolderId ? currentFolderData?.name : "My Workspace"}</h2>
              {currentFolderData?.owner && currentFolderData.ownerId !== userId && <p className="text-xs text-gray-500">Shared by {currentFolderData.owner.email}</p>}
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {/* Intelligence: Sorting Dropdown */}
            <div className="relative">
              <button 
                onClick={() => setSortType(sortBy === "name" ? "date" : sortBy === "date" ? "size" : "name")}
                className="flex items-center gap-2 px-3 py-2 bg-[#1a1a1a] border border-gray-800 rounded-lg text-xs font-bold text-gray-400 hover:text-white transition"
              >
                <ArrowUpDown size={14} />
                Sort: {sortBy.toUpperCase()}
              </button>
            </div>

            <form onSubmit={createFolder} className="flex gap-2 flex-1 sm:flex-none">
              <input type="text" placeholder="New Folder..." value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} className="bg-[#1a1a1a] border border-gray-800 rounded p-2 text-sm focus:outline-none focus:border-blue-500 flex-1 sm:w-40" />
              <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white p-2 rounded transition"><Plus size={20} /></button>
            </form>
          </div>
        </div>

        {currentFolderId && canUpload && !searchQuery && <FileUpload folderId={currentFolderId} onUploadComplete={fetchData} />}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-8">
          {displayFolders.map((folder) => {
            const config = FOLDER_COLORS.find(c => c.name === (folder.color || "blue")) || FOLDER_COLORS[0];
            return (
              <div
                key={folder.id}
                onClick={() => { router.push(`/dashboard?folderId=${folder.id}`); setFolders([]); setFiles([]); }}
                className={`group relative bg-[#111] p-4 rounded-2xl border border-gray-800 hover:border-${config.name}-500/50 hover:bg-[#161616] transition-all cursor-pointer active:scale-[0.98] shadow-sm`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 ${config.bg} rounded-xl transition-colors`}>
                    <Folder className={config.class} size={24} fill="currentColor" fillOpacity={0.2} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <p className="font-bold truncate text-gray-200 group-hover:text-white transition-colors">{folder.name}</p>
                      {folder.isStarred && <Star size={10} className="text-amber-400 fill-amber-400" />}
                    </div>
                    <p className="text-[10px] text-gray-600 uppercase tracking-widest font-black">Folder</p>
                  </div>
                </div>

                <div 
                  className="absolute top-4 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button onClick={() => updateMetadata(folder.id, "folder", { isStarred: !folder.isStarred })} className={`p-1.5 rounded-lg hover:bg-[#222] ${folder.isStarred ? 'text-amber-400' : 'text-gray-500'}`}><Star size={14} fill={folder.isStarred ? "currentColor" : "none"} /></button>
                  <button onClick={() => setActiveColorPicker(activeColorPicker === folder.id ? null : folder.id)} className="p-1.5 rounded-lg hover:bg-[#222] text-gray-500"><Palette size={14} /></button>
                  <button onClick={() => downloadFolder(folder)} className="p-1.5 rounded-lg hover:bg-[#222] text-gray-500 hover:text-white"><Download size={14} /></button>
                  {folder.ownerId === userId && <button onClick={() => deleteItem(folder.id, "folder")} className="p-1.5 rounded-lg hover:bg-[#222] text-gray-500 hover:text-red-500"><Trash2 size={14} /></button>}
                </div>

                {/* Color Picker Overlay */}
                {activeColorPicker === folder.id && (
                  <div className="absolute top-12 right-2 bg-[#1a1a1a] border border-gray-800 p-2 rounded-xl z-10 grid grid-cols-3 gap-1 shadow-2xl animate-in zoom-in-95 duration-100">
                    {FOLDER_COLORS.map(c => (
                      <button 
                        key={c.name} 
                        onClick={() => { updateMetadata(folder.id, "folder", { color: c.name }); setActiveColorPicker(null); }}
                        className={`w-6 h-6 rounded-full ${c.bg} flex items-center justify-center border border-white/5 hover:scale-110 transition`}
                      >
                        {folder.color === c.name && <Check size={10} className={c.class} />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {displayFiles.map((file) => (
            <div key={file.id} className="bg-[#111] p-4 rounded-2xl border border-gray-800 hover:border-green-500/50 transition-all group relative">
              <div className="flex items-center gap-3 mb-3">
                <div className={`p-2 rounded-xl ${isNotebook(file.name) ? "bg-orange-500/10" : isPython(file.name) ? "bg-blue-500/10" : isShell(file.name) ? "bg-amber-500/10" : isCpp(file.name) ? "bg-indigo-500/10" : isMD(file.name) ? "bg-gray-500/10" : "bg-green-500/10"}`}>
                  <FileIcon className={isNotebook(file.name) ? "text-orange-500" : isPython(file.name) ? "text-blue-400" : isShell(file.name) ? "text-amber-400" : isCpp(file.name) ? "text-indigo-400" : isMD(file.name) ? "text-gray-400" : "text-green-500"} size={24} />
                </div>
                <div className="flex-1 min-w-0 pr-6">
                  <div className="flex items-center gap-1">
                    <p className="font-bold truncate text-gray-200">{file.name}</p>
                    {file.isStarred && <Star size={10} className="text-amber-400 fill-amber-400" />}
                  </div>
                  <p className="text-[10px] text-gray-600 uppercase font-black">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => handlePreview(file)} className="flex-1 flex justify-center items-center gap-2 bg-[#1a1a1a] hover:bg-[#2a2a2a] text-[10px] font-black uppercase tracking-widest py-2 rounded-xl text-gray-400 hover:text-white transition"><Eye size={14} /> Preview</button>
                <button onClick={() => downloadFile(file)} className="p-2 bg-[#1a1a1a] hover:bg-[#2a2a2a] rounded-xl text-gray-400 hover:text-white transition"><Download size={14} /></button>
              </div>
              <div className="absolute top-4 right-2 opacity-0 group-hover:opacity-100 transition-all flex flex-col gap-1">
                <button onClick={() => updateMetadata(file.id, "file", { isStarred: !file.isStarred })} className={`p-1 rounded-lg hover:bg-[#222] ${file.isStarred ? 'text-amber-400' : 'text-gray-600'}`}><Star size={14} fill={file.isStarred ? "currentColor" : "none"} /></button>
                <button onClick={() => deleteItem(file.id, "file")} className="p-1 rounded-lg hover:bg-[#222] text-gray-600 hover:text-red-500"><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>

        {!displayFolders.length && !displayFiles.length && !loading && (
          <div className="text-center py-32 bg-[#0d0d0d] border border-dashed border-gray-800 rounded-[3rem] mt-8">
            <div className="inline-block p-6 rounded-full bg-[#111] mb-6 shadow-inner"><Search size={48} className="text-gray-800" /></div>
            <p className="text-gray-500 font-bold uppercase tracking-[0.3em]">{searchQuery ? "No matches found" : "Workspace empty"}</p>
          </div>
        )}
      </main>

      {/* Preview Modal remains same... */}
      {previewFile && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-2xl flex flex-col z-[60] animate-in fade-in duration-200">
          <div className="p-4 flex justify-between items-center bg-[#111] border-b border-gray-800">
            <h3 className="font-bold text-white truncate pr-8">{previewFile.name}</h3>
            <button onClick={() => setPreviewFile(null)} className="p-2 hover:bg-[#222] rounded-full text-gray-400 hover:text-white transition"><X size={24} /></button>
          </div>
          <div className="flex-1 flex items-center justify-center p-4 overflow-auto">
            {isImage(previewFile.name) ? <img src={getDownloadUrl(previewFile)} alt={previewFile.name} className="max-w-full max-h-full object-contain rounded-3xl shadow-2xl" /> :
             isPDF(previewFile.name) ? <iframe src={`${getDownloadUrl(previewFile)}#toolbar=0`} className="w-full h-full max-w-5xl rounded-2xl bg-white shadow-2xl" /> :
             previewContent === "LARGE_FILE_DETECTED" ? (
               <div className="text-center p-12 bg-[#111] rounded-[2.5rem] border border-gray-800 max-w-md shadow-2xl">
                 <div className="p-6 bg-amber-500/10 rounded-full w-fit mx-auto mb-6"><Clock size={48} className="text-amber-500" /></div>
                 <h3 className="text-2xl font-black text-white mb-2">High Volume Data</h3>
                 <p className="text-gray-500 mb-8 text-sm">This file is {(previewFile.size / 1024 / 1024).toFixed(2)} MB. Pre-stream download recommended.</p>
                 <div className="flex flex-col gap-3">
                   <button onClick={() => downloadFile(previewFile)} className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-blue-700 transition shadow-lg shadow-blue-600/20">Download Original</button>
                   <button onClick={() => setPreviewFile(null)} className="text-gray-600 text-xs font-black uppercase tracking-widest hover:text-white transition">Dismiss</button>
                 </div>
               </div>
             ) :
             previewContent ? <div className="w-full h-full max-w-5xl bg-[#050505] border border-gray-800 rounded-3xl p-8 overflow-auto font-mono text-xs whitespace-pre-wrap leading-relaxed selection:bg-blue-500/30">{previewContent}</div> :
             <div className="text-center p-12 bg-[#111] rounded-[2.5rem] border border-gray-800 shadow-2xl">
               <div className="p-6 bg-gray-800/10 rounded-full w-fit mx-auto mb-6"><FileIcon size={64} className="text-gray-700" /></div>
               <p className="text-gray-500 mb-8 font-bold uppercase tracking-widest">Preview unavailable</p>
               <button onClick={() => downloadFile(previewFile)} className="px-10 py-4 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-blue-700 transition shadow-lg">Download File</button>
             </div>}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-400 bg-[#0a0a0a] min-h-screen font-mono uppercase tracking-widest animate-pulse">Initializing Secure Workspace...</div>}>
      <DashboardContent />
    </Suspense>
  );
}
