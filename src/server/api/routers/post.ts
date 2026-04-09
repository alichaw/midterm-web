// src/server/api/routers/post.ts
import { z } from "zod";
import { env } from "~/env.js";
import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// 🛡️ 終極殺招：手動注入 env，絕對不讓 Next.js 優化掉
const globalRedis = new Redis({
  url: env.UPSTASH_REDIS_REST_URL,
  token: env.UPSTASH_REDIS_REST_TOKEN,
});

const publicRateLimit = new Ratelimit({
  redis: globalRedis,
  limiter: Ratelimit.slidingWindow(10, "10 s"),
  analytics: true,
  prefix: "ratelimit:public",
});

const strictCloudinaryPath = new RegExp(
  `^/${env.CLOUDINARY_CLOUD_NAME}/image/upload/(?:v\\d+/)?[-_a-zA-Z0-9]+\\.(jpg|jpeg|png|webp|gif)$`,
  "i"
);

const isSafeCloudinaryUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "res.cloudinary.com") return false;
    return strictCloudinaryPath.test(parsed.pathname);
  } catch {
    return false;
  }
};

const escapeHtml = (unsafe: string) => {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

export const postRouter = createTRPCRouter({
  
  hello: publicProcedure
    .input(z.object({ 
      text: z.string().max(100, "輸入長度過長，請限制在 100 字以內") 
    }))
    .query(async ({ ctx, input }) => {
      const ip = ctx.ip ?? "127.0.0.1";
      const { success } = await publicRateLimit.limit(ip);
      
      if (!success) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "您的請求過於頻繁，請稍後再試。",
        });
      }

      return {
        greeting: `Hello ${escapeHtml(input.text)}`,
      };
    }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string()
          .min(1, "內容不能為空")
          .max(500, "內容長度不能超過 500 字") 
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.post.create({
        data: {
          name: input.name, 
          createdBy: { connect: { id: ctx.session.user.id } },
        },
      });
    }),

  updateAvatar: protectedProcedure
    .input(
      z.object({
        imageUrl: z.string()
          .url("必須是有效的網址格式")
          .refine(isSafeCloudinaryUrl, "圖片來源不合法、包含危險路徑或非支援的副檔名！")
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.user.update({
        where: { id: ctx.session.user.id },
        data: { image: input.imageUrl },
      });
    }),

  getLatest: protectedProcedure.query(async ({ ctx }) => {
    const post = await ctx.db.post.findFirst({
      orderBy: { createdAt: "desc" },
      where: { createdBy: { id: ctx.session.user.id } },
    });

    return post ?? null;
  }),

  getSecretMessage: protectedProcedure.query(() => {
    return "you can now see this secret message!";
  }),
});
