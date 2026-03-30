"use client";

import { useUploadQueue } from "./providers/UploadContext";
import { X, ChevronRight, CheckCircle2, Clock, Loader2, FileText, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { useState } from "react";

export const UploadSidebar = () => {
  const { queue, isSidebarOpen, setIsSidebarOpen, clearQueue } = useUploadQueue();
  const [expandedJob, setExpandedJob] = useState<string | null>(null);

  return (
    <div className={`fixed top-0 right-0 h-full w-full sm:w-80 bg-[#0a0a0a] border-l border-gray-800 shadow-2xl z-[100] transition-transform duration-300 transform ${isSidebarOpen ? 'translate-x-0 pointer-events-auto' : 'translate-x-full pointer-events-none'}`}>
      <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-[#111]">
        <h3 className="font-bold text-white flex items-center gap-2">
          <Clock size={18} className="text-blue-500" />
          Queue
        </h3>
        <div className="flex items-center gap-2">
          <button 
            onClick={clearQueue}
            className="p-2.5 sm:p-1.5 hover:bg-red-500/10 text-gray-500 hover:text-red-500 rounded-lg transition"
            title="Clear Finished"
          >
            <Trash2 size={20} className="sm:w-4 sm:h-4" />
          </button>
          <button onClick={() => setIsSidebarOpen(false)} className="p-2 sm:p-1 hover:bg-gray-800 rounded-lg text-gray-400">
            <X size={24} className="sm:w-5 sm:h-5" />
          </button>
        </div>
      </div>

      <div className="overflow-y-auto h-[calc(100%-60px)] p-4 space-y-4 scrollbar-thin">
        {queue.length === 0 ? (
          <div className="text-center py-10 text-gray-600 text-sm">No active uploads</div>
        ) : (
          queue.map((job) => (
            <div key={job.id} className="bg-[#111] border border-gray-800 rounded-xl overflow-hidden shadow-lg">
              <div 
                className="p-3 cursor-pointer hover:bg-[#1a1a1a] transition"
                onClick={() => setExpandedJob(expandedJob === job.id ? null : job.id)}
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-200 truncate">{job.name}</p>
                    <p className="text-[10px] text-gray-500 uppercase tracking-widest">
                      {job.completedFiles} / {job.totalFiles} Files • {job.status}
                    </p>
                  </div>
                  {job.status === "uploading" ? (
                    <Loader2 size={16} className="text-blue-500 animate-spin" />
                  ) : job.status === "completed" ? (
                    <CheckCircle2 size={16} className="text-green-500" />
                  ) : (
                    <Clock size={16} className="text-gray-600" />
                  )}
                </div>

                <div className="w-full bg-gray-900 h-1 rounded-full overflow-hidden">
                  <div 
                    className={`h-full transition-all duration-500 ${job.status === 'completed' ? 'bg-green-500' : 'bg-blue-600 shadow-[0_0_10px_rgba(37,99,235,0.5)]'}`}
                    style={{ width: `${job.progress}%` }}
                  />
                </div>
                
                <div className="mt-2 flex justify-between items-center">
                  <span className="text-[10px] font-mono text-blue-400 font-bold">{job.progress}%</span>
                  {expandedJob === job.id ? <ChevronUp size={14} className="text-gray-600" /> : <ChevronDown size={14} className="text-gray-600" />}
                </div>
              </div>

              {expandedJob === job.id && (
                <div className="border-t border-gray-800 bg-[#0d0d0d] max-h-48 overflow-y-auto p-2 space-y-1">
                  {job.files.map((file, idx) => (
                    <div key={idx} className="flex items-center gap-2 p-1.5 rounded hover:bg-[#1a1a1a]">
                      <FileText size={12} className="text-gray-500" />
                      <span className="text-[10px] text-gray-400 truncate flex-1">{file.name}</span>
                      {file.status === "completed" ? (
                        <CheckCircle2 size={10} className="text-green-500" />
                      ) : file.status === "uploading" ? (
                        <Loader2 size={10} className="text-blue-500 animate-spin" />
                      ) : (
                        <div className="w-2 h-2 rounded-full bg-gray-800" />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
