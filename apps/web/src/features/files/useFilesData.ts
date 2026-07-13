import { useCallback, useEffect, useRef, useState } from "react";
import type { FileListPayload } from "@stackpilot/contracts";
import { fetchFiles } from "../../api/filesApi";

export function useFilesData(path:string){const[data,setData]=useState<FileListPayload|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState("");const requestRef=useRef(0),controllerRef=useRef<AbortController|null>(null);
  const load=useCallback(async()=>{controllerRef.current?.abort();const controller=new AbortController(),request=++requestRef.current;controllerRef.current=controller;setLoading(true);setError("");try{const next=await fetchFiles(path,controller.signal);if(request===requestRef.current)setData(next);}catch(reason){if(controller.signal.aborted)return;if(request===requestRef.current)setError(reason instanceof Error?reason.message:"目录读取失败");}finally{if(request===requestRef.current)setLoading(false);}},[path]);
  useEffect(()=>{void load();return()=>controllerRef.current?.abort();},[load]);
  return{data:data?.path===path?data:null,loading,error,reload:load};
}
