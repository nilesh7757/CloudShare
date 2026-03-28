"use client";

import { useUploadThing } from "@/lib/uploadthing";
import { useState, useRef, useEffect, useCallback } from "react";
import { FolderUp, Loader2, FileUp, CheckCircle2, ShieldCheck, Cpu } from "lucide-react";
import { useUploadQueue } from "./providers/UploadContext";

interface FileUploadProps {
  folderId: string;
  onUploadComplete: (silent?: boolean) => void;
}

export const FileUpload = ({ folderId, onUploadComplete }: FileUploadProps) => {
  const { addUpload, updateJob } = useUploadQueue();
  const folderInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isRunningRef = useRef(false);
  const onCompleteRef = useRef(onUploadComplete);

  useEffect(() => {
    onCompleteRef.current = onUploadComplete;
  }, [onUploadComplete]);

  const { startUpload } = useUploadThing("fileUploader");

  const runUploadTask = useCallback(async (task: any) => {
    const { job, files, folderId: targetRootId, type } = task;
    updateJob(job.id, { status: "uploading" });
    
    const fileList = Array.from(files as File[]);
    let idMap: Record<string, string> = {};

    try {
      if (type === "folder") {
        const folderObjects: any[] = [];
        const seenPaths = new Set<string>();
        
        // Use job.files which has the preserved path metadata
        for (const fileMeta of job.files) {
          const parts = fileMeta.path.split("/");
          parts.pop(); 
          let currentPath = "";
          for (let i = 0; i < parts.length; i++) {
            const name = parts[i];
            const parentPath = currentPath;
            currentPath = currentPath ? `${currentPath}/${name}` : name;
            if (!seenPaths.has(currentPath)) {
              seenPaths.add(currentPath);
              folderObjects.push({ name, path: currentPath, parentPath });
            }
          }
        }
        const batchRes = await fetch("/api/folders/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ folders: folderObjects, rootFolderId: targetRootId }),
        });
        idMap = await batchRes.json();
      }

      let completedCount = 0;
      const BATCH_SIZE = 3; 
      
      for (let i = 0; i < fileList.length; i += BATCH_SIZE) {
        const chunk = fileList.slice(i, i + BATCH_SIZE);
        
        for (const file of chunk) {
          // Find the preserved path for this specific file
          const fileMeta = job.files.find((f: any) => f.name === file.name);
          const preservedPath = fileMeta?.path || "";
          
          const pathParts = preservedPath.split("/");
          pathParts.pop();
          const path = pathParts.join("/");
          const actualTargetId = idMap[path] || targetRootId;

          const isSuspicious = !file.name.includes('.') || file.name.endsWith('.sh');
          let fileToUpload = file;
          let originalName = file.name;
          let isEncoded = false;

          if (isSuspicious) {
            const b64Data = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onload = () => resolve((reader.result as string).split(',')[1]);
              reader.readAsDataURL(file);
            });
            fileToUpload = new File([b64Data], `${file.name}.stealth.txt`, { type: 'text/plain' });
            isEncoded = true;
          }

          try {
            await startUpload([fileToUpload], { folderId: actualTargetId, originalName, isEncoded });
            completedCount++;
            
            // UI Update for the specific job
            const updatedFiles = job.files.map((f: any) => 
              f.name === file.name ? { ...f, status: "completed" } : f
            );
            updateJob(job.id, { 
              completedFiles: completedCount, 
              progress: Math.round((completedCount / fileList.length) * 100),
              files: updatedFiles
            });
          } catch (e) {
            console.error(e);
          }
        }
        onCompleteRef.current(true);
      }
      
      updateJob(job.id, { status: "completed", progress: 100 });
    } catch (err) {
      console.error(err);
      updateJob(job.id, { status: "failed" });
    }
  }, [startUpload, updateJob]);

  useEffect(() => {
    const interval = setInterval(async () => {
      if (isRunningRef.current) return;
      const pending = (window as any)._pendingUploads;
      if (pending && pending.length > 0) {
        isRunningRef.current = true;
        const task = pending.shift();
        await runUploadTask(task);
        isRunningRef.current = false;
      }
    }, 1500);
    return () => clearInterval(interval);
  }, [runUploadTask]);

  return (
    <div className="w-full max-w-xl mx-auto flex flex-col items-center gap-6 p-10 bg-[#111] border-2 border-dashed border-gray-800 rounded-2xl hover:border-blue-500/30 transition-all shadow-2xl">
      <div className="flex flex-col items-center text-center">
        <div className="p-4 bg-blue-500/10 rounded-full mb-4">
          <FolderUp size={40} className="text-blue-500" />
        </div>
        <h3 className="text-xl font-bold text-white mb-2">Resilient Background Sync</h3>
        <p className="text-sm text-gray-500 max-w-[250px]">
          Uploads persist through page refreshes. Track progress in the right sidebar.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 w-full justify-center">
        <input type="file" ref={folderInputRef} onChange={(e) => {
          const files = e.target.files;
          if (files?.length) {
            const topName = files[0].webkitRelativePath.split('/')[0];
            addUpload(topName, Array.from(files), folderId, "folder");
            e.target.value = "";
          }
        }} className="hidden" {...({ webkitdirectory: "", directory: "", multiple: true } as any)} />
        <button onClick={() => folderInputRef.current?.click()} className="flex-1 flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-700 text-white px-6 py-4 rounded-2xl font-bold transition-all shadow-lg active:scale-95 disabled:opacity-50">
          <FolderUp size={20} />
          Queue Folder
        </button>

        <input type="file" ref={fileInputRef} onChange={(e) => {
          const files = e.target.files;
          if (files?.length) {
            addUpload(`${files.length} Files`, Array.from(files), folderId, "files");
            e.target.value = "";
          }
        }} multiple className="hidden" />
        <button onClick={() => fileInputRef.current?.click()} className="flex-1 flex items-center justify-center gap-3 bg-[#1a1a1a] hover:bg-[#252525] text-gray-300 border border-gray-800 px-6 py-4 rounded-2xl font-bold transition active:scale-95 disabled:opacity-50">
          <FileUp size={20} />
          Queue Files
        </button>
      </div>
    </div>
  );
};
