import type { IncomingMessage } from "node:http";
import type { IdentityService } from "../../identity/identityService.js";
import type { Principal } from "../../identity/types.js";
import { ApiError } from "../errors/ApiError.js";

export const SESSION_COOKIE = "stackpilot_session";
function cookie(request: IncomingMessage, name: string): string | null {
  const raw=request.headers.cookie; if(!raw)return null;
  for(const part of raw.split(";")){const [key,...rest]=part.trim().split("=");if(key===name)return decodeURIComponent(rest.join("="));}
  return null;
}
export function authenticateUser(request:IncomingMessage,identity:IdentityService|null):Principal {
  if(!identity)throw new ApiError(503,"NOT_READY","身份系统未配置");
  const authorization=request.headers.authorization;
  const bearer=typeof authorization==="string"?authorization.match(/^Bearer ([^\s]+)$/)?.[1]:undefined;
  const principal=bearer?identity.authenticateApiToken(bearer):(()=>{const value=cookie(request,SESSION_COOKIE);return value?identity.authenticateSession(value):null;})();
  if(!principal)throw new ApiError(401,"UNAUTHORIZED","需要登录",{"WWW-Authenticate":"Bearer"});
  return principal;
}
export function requireCsrf(request:IncomingMessage,principal:Principal,identity:IdentityService,allowedOrigins:readonly string[]):void {
  if(principal.type!=="session")return;
  const origin=request.headers.origin;if(typeof origin!=="string"||!allowedOrigins.includes(origin))throw new ApiError(403,"FORBIDDEN","请求来源校验失败");
  const csrf=request.headers["x-csrf-token"];identity.verifyCsrf(principal,typeof csrf==="string"?csrf:"");
}
export function sessionCookie(value:string,maxAge:number,secure:boolean):string{return `${SESSION_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure?"; Secure":""}`;}
export function clearSessionCookie(secure:boolean):string{return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure?"; Secure":""}`;}

