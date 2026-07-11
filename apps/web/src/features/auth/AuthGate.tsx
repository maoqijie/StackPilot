import type { PublicUser } from "@stackpilot/contracts";
import { LogIn, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { login, restoreSession } from "../../api/authApi";

export function AuthGate({children}:{children:(user:PublicUser)=>React.ReactNode}){
 const [user,setUser]=useState<PublicUser|null>(null);const [checking,setChecking]=useState(true);const [username,setUsername]=useState("");const [password,setPassword]=useState("");const [error,setError]=useState("");const [busy,setBusy]=useState(false);
 useEffect(()=>{restoreSession().then(setUser).catch(()=>setUser(null)).finally(()=>setChecking(false));const expired=()=>setUser(null);window.addEventListener("stackpilot:session-expired",expired);return()=>window.removeEventListener("stackpilot:session-expired",expired);},[]);
 if(checking)return <main className="auth-screen"><div role="status">正在验证会话</div></main>;
 if(user)return <>{children(user)}</>;
 return <main className="auth-screen"><form className="auth-form" onSubmit={(event)=>{event.preventDefault();setBusy(true);setError("");login(username,password).then(setUser).catch((reason:unknown)=>setError(reason instanceof Error?reason.message:"登录失败")).finally(()=>setBusy(false));}}><ShieldCheck size={24}/><span>StackPilot</span><h1>登录控制台</h1><label><span>用户名</span><input autoFocus autoComplete="username" value={username} onChange={event=>setUsername(event.target.value)}/></label><label><span>密码</span><input type="password" autoComplete="current-password" value={password} onChange={event=>setPassword(event.target.value)}/></label>{error&&<p role="alert">{error}</p>}<button className="primary" type="submit" disabled={busy||!username||!password}><LogIn size={15}/>{busy?"正在登录":"登录"}</button></form></main>;
}
