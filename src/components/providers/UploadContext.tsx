"use client";

import { createContext, useContext, useState, ReactNode, useEffect } from "react";
import { set, get, del } from "idb-keyval";

export type UploadStatus = "queued" | "uploading" | "syncing" | "completed" | "failed" | "resuming";

export interface UploadJob {
  id: string;
  name: string;
  progress: number;
  status: UploadStatus;
  totalFiles: number;
  completedFiles: number;
  totalSize: number;
  uploadedSize: number;
  folderId: string;
  type: "folder" | "files";
  files: { name: string; path: string; status: "pending" | "uploading" | "completed" | "failed" }[];
}

interface UploadContextType {
  queue: UploadJob[];
  addUpload: (name: string, files: File[], folderId: string, type: "folder" | "files") => void;
  openSidebar: (manual: boolean) => void;
  isSidebarOpen: boolean;
  setIsSidebarOpen: (open: boolean) => void;
  updateJob: (id: string, updates: Partial<UploadJob>) => void;
  removeJob: (id: string) => void;
  clearQueue: (force?: boolean) => void;
}

const UploadContext = createContext<UploadContextType | undefined>(undefined);

export const UploadProvider = ({ children }: { children: ReactNode }) => {
  const [queue, setQueue] = useState<UploadJob[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [autoCloseTimer, setAutoCloseTimer] = useState<NodeJS.Timeout | null>(null);

  // 1. Load Queue and Resume on Mount
  useEffect(() => {
    const init = async () => {
      const savedMeta = localStorage.getItem("_upload_queue_v2");
      if (savedMeta) {
        try {
          const parsed = JSON.parse(savedMeta);
          const resumed = parsed.map((j: UploadJob) => 
            (j.status === "uploading" || j.status === "queued" || j.status === "resuming") 
            ? { ...j, status: "resuming" as UploadStatus } 
            : j
          );
          setQueue(resumed);

          for (const job of resumed) {
            if (job.status === "resuming") {
              const files = await get(`files_${job.id}`);
              if (files) {
                (window as any)._pendingUploads = (window as any)._pendingUploads || [];
                (window as any)._pendingUploads.push({ job, files, folderId: job.folderId, type: job.type });
              }
            }
          }
        } catch (e) { console.error(e); }
      }
    };
    init();
  }, []);

  // 2. Persist Meta
  useEffect(() => {
    localStorage.setItem("_upload_queue_v2", JSON.stringify(queue));
  }, [queue]);

  const removeJob = (id: string) => {
    setQueue(prev => prev.filter(j => j.id !== id));
    del(`files_${id}`);
  };

  const clearQueue = (force = false) => {
    if (force) {
      // Emergency Clear: Wipe everything
      setQueue([]);
      (window as any)._pendingUploads = [];
      // Clear all file storage from IndexedDB
      queue.forEach(j => del(`files_${j.id}`));
      return;
    }

    const finishedIds = queue
      .filter(j => j.status === "completed" || j.status === "failed")
      .map(j => j.id);
    
    setQueue(prev => prev.filter(j => j.status !== "completed" && j.status !== "failed"));
    finishedIds.forEach(id => del(`files_${id}`));
  };

  const updateJob = (id: string, updates: Partial<UploadJob>) => {
    setQueue(prev => prev.map(j => j.id === id ? { ...j, ...updates } : j));
    
    // Auto-remove completed/failed jobs after 10 seconds
    if (updates.status === "completed" || updates.status === "failed") {
      setTimeout(() => {
        setQueue(prev => prev.filter(j => j.id !== id));
        del(`files_${id}`);
      }, 10000);
    }
  };

  const openSidebar = (manual: boolean) => {
    if (autoCloseTimer) clearTimeout(autoCloseTimer);
    setIsSidebarOpen(true);
    if (!manual) {
      const timer = setTimeout(() => setIsSidebarOpen(false), 3000);
      setAutoCloseTimer(timer);
    } else {
      setAutoCloseTimer(null);
    }
  };

  const addUpload = async (name: string, files: File[], folderId: string, type: "folder" | "files") => {
    const id = Math.random().toString(36).substr(2, 9);
    const totalSize = files.reduce((acc, f) => acc + f.size, 0);
    
    const newJob: UploadJob = {
      id,
      name,
      progress: 0,
      status: "queued",
      totalFiles: files.length,
      completedFiles: 0,
      totalSize,
      uploadedSize: 0,
      folderId,
      type,
      files: files.map(f => ({ 
        name: f.name, 
        path: (f as any).webkitRelativePath || f.name, 
        status: "pending" 
      }))
    };

    await set(`files_${id}`, files);
    setQueue(prev => [...prev, newJob]);
    openSidebar(false);

    (window as any)._pendingUploads = (window as any)._pendingUploads || [];
    (window as any)._pendingUploads.push({ job: newJob, files, folderId, type });
  };

  return (
    <UploadContext.Provider value={{ queue, addUpload, openSidebar, isSidebarOpen, setIsSidebarOpen, updateJob, removeJob, clearQueue }}>
      {children}
    </UploadContext.Provider>
  );
};

export const useUploadQueue = () => {
  const context = useContext(UploadContext);
  if (!context) throw new Error("useUploadQueue must be used within UploadProvider");
  return context;
};
