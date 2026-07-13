import { useCallback, useEffect, useRef, useState } from "react";
import type { FileListPayload } from "@stackpilot/contracts";
import { fetchFiles } from "../../api/filesApi";

export function useFilesData(path:string){const[dataState,setDataState]=useState<{requestedPath:string;payload:FileListPayload}|null>(null),[errorState,setErrorState]=useState<{path:string;message:string}|null>(null);const requestRef=useRef(0),controllerRef=useRef<AbortController|null>(null);
  const run=useCallback(async(controller:AbortController,request:number)=>{try{const next=await fetchFiles(path,controller.signal);if(request===requestRef.current){setDataState({requestedPath:path,payload:next});setErrorState(null);}}catch(reason){if(controller.signal.aborted)return;if(request===requestRef.current)setErrorState({path,message:reason instanceof Error?reason.message:"目录读取失败"});}},[path]);
  const start=useCallback(()=>{controllerRef.current?.abort();const controller=new AbortController(),request=++requestRef.current;controllerRef.current=controller;void run(controller,request);},[run]);
  useEffect(()=>{const controller=new AbortController(),request=++requestRef.current;controllerRef.current=controller;void run(controller,request);return()=>controller.abort();},[run]);
  const currentData=dataState?.requestedPath===path?dataState.payload:null,error=errorState?.path===path?errorState.message:"";
  return{data:currentData,loading:!currentData&&!error,error,reload:start};
}
