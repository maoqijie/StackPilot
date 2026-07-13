import type { LoginResponse, SessionStatus } from "./authTypes";
import { requestJson, setCsrfToken } from "./client";
let sessionRestore: Promise<SessionStatus> | null = null;
export async function restoreSession(){sessionRestore??=requestJson<SessionStatus>("/auth/session").finally(()=>{sessionRestore=null;});const result=await sessionRestore;if(!result.authenticated)return null;setCsrfToken(result.csrfToken);return result.user;}
export async function login(username:string,password:string){const result=await requestJson<LoginResponse>("/auth/login",{method:"POST",body:JSON.stringify({username,password})});setCsrfToken(result.csrfToken);return result.user;}
export async function logout(){await requestJson("/auth/logout",{method:"POST",body:"{}"});setCsrfToken("");window.dispatchEvent(new Event("stackpilot:session-expired"));}
