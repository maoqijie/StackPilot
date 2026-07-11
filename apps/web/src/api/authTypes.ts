import type { PublicUser } from "@stackpilot/contracts";
export type CurrentUserResponse={user:PublicUser;csrfToken:string};
export type LoginResponse=CurrentUserResponse&{expiresAt:string};
export type SessionStatus={authenticated:false}|({authenticated:true}&CurrentUserResponse);
