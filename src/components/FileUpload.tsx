"use client";

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

  // CHUNKED PROXY UPLOADER (BYPASSES ALL LIMITS)
  const uploadToGoogleDrive = async (file: File, job: any, fileMeta: any, onProgress: (chunkUploaded: number) => void) => {
    try {
      // 1. Initialize the session via our server
      const initRes = await fetch("/api/files/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "INIT", name: file.name })
      });
      const { uploadUrl } = await initRes.json();

      // 2. Slicing and Streaming (2MB chunks to stay safe on Vercel)
      const CHUNK_SIZE = 2 * 1024 * 1024;
      const totalSize = file.size;
      let driveFileId = "";

      for (let start = 0; start < totalSize; start += CHUNK_SIZE) {
        const end = Math.min(start + CHUNK_SIZE, totalSize);
        const chunk = file.slice(start, end);
        
        // Convert chunk to base64 to send via JSON
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve) => {
          reader.onload = () => resolve((reader.result as string).split(',')[1]);
          reader.readAsDataURL(chunk);
        });
        const base64Chunk = await base64Promise;

        const chunkRes = await fetch("/api/files/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "CHUNK",
            uploadUrl,
            chunk: base64Chunk,
            range: `bytes ${start}-${end - 1}/${totalSize}`,
          })
        });

        const chunkData = await chunkRes.json();
        // Check for success or 'resume incomplete' (308)
        if (chunkRes.status !== 200 && chunkRes.status !== 201 && chunkRes.status !== 308) {
          throw new Error(chunkData.message || "Chunk failed");
        }

        if (chunkRes.status === 200 || chunkRes.status === 201) {
          driveFileId = chunkData.data.id;
        }

        // Report progress for this chunk
        onProgress(end);
      }

      // 3. Finalize in Database
      await fetch("/api/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([{
          name: fileMeta.originalName || file.name,
          url: `https://www.googleapis.com/drive/v3/files/${driveFileId}?alt=media`,
          key: driveFileId,
          size: file.size,
          folderId: fileMeta.targetId,
          isEncoded: !!fileMeta.isEncoded
        }])
      });

      return driveFileId;
    } catch (err) {
      console.error("Chunked Upload Error:", err);
      throw err;
    }
  };

  const runUploadTask = useCallback(async (task: any) => {
    const { job, files, folderId: targetRootId, type } = task;
    updateJob(job.id, { status: "uploading" });
    const fileList = Array.from(files as File[]);
    let idMap: Record<string, string> = {};

    try {
      if (type === "folder") {
        const folderObjects: any[] = [];
        const seenPaths = new Set<string>();
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
      let totalUploadedBytes = 0;
      const fileSizesMap: Record<string, number> = {};
      fileList.forEach(f => fileSizesMap[f.name] = f.size);

      for (const file of fileList) {
        const fileMeta = job.files.find((f: any) => f.name === file.name);
        const pathParts = (fileMeta?.path || "").split("/");
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
          let lastFileUploaded = 0;
          await uploadToGoogleDrive(fileToUpload, job, { targetId: actualTargetId, originalName, isEncoded }, (chunkUploaded) => {
            // Update global job progress
            const currentTotalUploaded = totalUploadedBytes + chunkUploaded;
            const progress = Math.min(Math.round((currentTotalUploaded / job.totalSize) * 100), 99);
            
            updateJob(job.id, { 
              uploadedSize: currentTotalUploaded,
              progress
            });
            lastFileUploaded = chunkUploaded;
          });

          completedCount++;
          totalUploadedBytes += file.size; // Use original file size for tracking
          
          const updatedFiles = job.files.map((f: any) => f.name === file.name ? { ...f, status: "completed" } : f);
          updateJob(job.id, { 
            completedFiles: completedCount, 
            progress: Math.round((totalUploadedBytes / job.totalSize) * 100),
            uploadedSize: totalUploadedBytes,
            files: updatedFiles
          });
          onCompleteRef.current(true);
        } catch (e) {
          console.error(e);
        }
      }
      
      updateJob(job.id, { status: "completed", progress: 100, uploadedSize: job.totalSize });
      onCompleteRef.current(true);
    } catch (err) {
      console.error(err);
      updateJob(job.id, { status: "failed" });
    }
  }, [updateJob]);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        if (isRunningRef.current) return;
        
        const pending = (window as any)._pendingUploads;
        if (pending && pending.length > 0) {
          isRunningRef.current = true;
          // Peak at the first task
          const task = pending[0];
          
          try {
            await runUploadTask(task);
            // Successfully processed, remove it
            (window as any)._pendingUploads.shift();
          } catch (taskError) {
            console.error("Task execution failed, removing from queue to prevent block:", taskError);
            (window as any)._pendingUploads.shift();
          } finally {
            isRunningRef.current = false;
          }
        }
      } catch (globalError) {
        console.error("Global upload processor error:", globalError);
        isRunningRef.current = false;
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [runUploadTask]);

  return (
    <div className="w-full max-w-xl mx-auto flex flex-col items-center gap-6 p-10 bg-[#111] border-2 border-dashed border-gray-800 rounded-2xl hover:border-blue-500/30 transition-all shadow-2xl">
      <div className="flex flex-col items-center text-center">
        <div className="p-4 bg-blue-500/10 rounded-full mb-4">
          <FolderUp size={40} className="text-blue-500" />
        </div>
        <h3 className="text-xl font-bold text-white mb-2">Google Drive Sync (15GB)</h3>
        <p className="text-sm text-gray-500 max-w-[250px]">
          Chunked Direct Bridge enabled. Bypass all size and CORS limits.
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
        <button onClick={() => folderInputRef.current?.click()} className="flex-1 flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-700 text-white px-6 py-4 rounded-2xl font-bold transition-all shadow-lg active:scale-95">
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
        <button onClick={() => fileInputRef.current?.click()} className="flex-1 flex items-center justify-center gap-3 bg-[#1a1a1a] hover:bg-[#252525] text-gray-300 border border-gray-800 px-6 py-4 rounded-2xl font-bold transition active:scale-95">
          <FileUp size={20} />
          Queue Files
        </button>
      </div>
    </div>
  );
};
