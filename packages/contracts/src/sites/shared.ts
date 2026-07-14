import { z } from "zod";

export const SiteOpaqueIdSchema = z.string().min(8).max(160).regex(/^[A-Za-z0-9:_-]+$/);
export const SiteIdempotencyKeySchema = z.string().min(8).max(160).regex(/^[A-Za-z0-9:_-]+$/);
export const NullableDateTimeSchema = z.string().datetime().nullable();

export const SiteDomainNameSchema = z.string().trim().min(1).max(253).toLowerCase().superRefine((value, context) => {
  if (value.startsWith("*.") || !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(value)) {
    context.addIssue({ code: "custom", message: "must be a non-wildcard DNS name" });
  }
});

export const PublicGithubRepositorySchema = z.url().max(512).superRefine((value, context) => {
  try {
    const url = new URL(value);
    const pathValid = /^\/[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}(?:\.git)?$/.test(url.pathname);
    if (url.protocol !== "https:" || url.hostname !== "github.com" || url.port || url.username || url.password || url.search || url.hash || !pathValid) {
      context.addIssue({ code: "custom", message: "must be a public github.com HTTPS repository URL" });
    }
  } catch {
    context.addIssue({ code: "custom", message: "must be a valid repository URL" });
  }
});
