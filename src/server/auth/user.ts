import { z } from "zod";
import { createTRPCRouter, publicProcedure, protectedProcedure } from "~/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { hash } from "bcryptjs";
import { db } from "~/server/db";
import { v2 as cloudinary } from "cloudinary";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { env } from "~/env";

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const base64ImageRegex = /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/]+=*$/;

const globalRedis = new Redis({
  url: env.UPSTASH_REDIS_REST_URL,
  token: env.UPSTASH_REDIS_REST_TOKEN,
});

const authRateLimit = new Ratelimit({
  redis: globalRedis,
  limiter: Ratelimit.slidingWindow(100, "15 m"), 
  analytics: true,
  prefix: "ratelimit:auth",
});

const apiRateLimit = new Ratelimit({
  redis: globalRedis,
  limiter: Ratelimit.slidingWindow(30, "10 s"), 
  analytics: true,
  prefix: "ratelimit:api",
});

export const userRouter = createTRPCRouter({
  
  register: publicProcedure
    .input(
        z.object({
          username: z.string().trim()
            .min(3, "帳號至少需要 3 個非空白字元")
            .max(20, "帳號最長 20 字")
            .regex(/^[a-zA-Z0-9_]+$/, "帳號只能包含英文字母、數字與底線"),
          password: z.string().min(6, "密碼至少需要 6 個字元").max(100, "密碼過長")
        })
      )
    .mutation(async ({ ctx, input }) => {
      const ip = ctx.ip ?? "127.0.0.1";
      const { success } = await authRateLimit.limit(ip);
      if (!success) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "請求過於頻繁，請稍後再試。" });
      }

      const existingUser = await db.user.findUnique({ where: { username: input.username } });
      if (existingUser) {
        throw new TRPCError({ code: "CONFLICT", message: "此帳號已被註冊" });
      }

      const hashedPassword = await hash(input.password, 12);
      const user = await db.user.create({
        data: { username: input.username, password: hashedPassword },
      });
      return { id: user.id, username: user.username, avatar: user.avatar };
    }),

  uploadAvatar: protectedProcedure
    .input(
      z.object({ 
        imageBase64: z.string().regex(base64ImageRegex, "僅支援正確編碼的 PNG, JPG, WEBP 格式圖片")
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.imageBase64.length > 4000000) {
        throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "圖片檔案過大，請選擇更小的圖片" });
      }

      try {
        const uploadResponse = await cloudinary.uploader.upload(
          input.imageBase64,
          {
            folder: "midterm_avatars",
            transformation: [{ width: 256, height: 256, crop: "fill" }],
            timeout: 60000,
          }
        );

        const updated = await db.user.update({
          where: { id: ctx.session.user.id },
          data: { avatar: uploadResponse.secure_url },
        });
        return { id: updated.id, username: updated.username, avatar: updated.avatar };
      } catch (error) {
        console.error("Cloudinary 上傳失敗:", error);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "圖片上傳失敗，請稍後再試" });
      }
    }),

  createMessage: protectedProcedure
    .input(z.object({
      content: z.string()
        .min(1, "留言不能為空")
        .max(500, "留言請勿超過 500 字")
        .refine((v) => !/<[^>]*>/g.test(v), "留言內容不允許 HTML 標籤"),
    }))
    .mutation(async ({ ctx, input }) => {
      return db.message.create({
        data: {
          content: input.content,
          userId: ctx.session.user.id!,
        },
      });
    }),

  deleteMessage: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Atomic: only deletes when both id AND userId match, preventing TOCTOU and IDOR
      const deleted = await db.message.deleteMany({
        where: { id: input.id, userId: ctx.session.user.id! },
      });
      if (deleted.count === 0) {
        throw new TRPCError({ code: "FORBIDDEN", message: "找不到該留言或無權刪除" });
      }
    }),

  getMessages: protectedProcedure.query(async ({ ctx }) => {
    const ip = ctx.ip ?? "127.0.0.1";
    const { success } = await apiRateLimit.limit(ip);
    if (!success) {
      throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "請求過於頻繁，請稍後再試。" });
    }

    const messages = await db.message.findMany({
      take: 50,
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { username: true, avatar: true } },
      },
    });

    return messages.map((m) => ({
      ...m,
      user: {
        ...m.user,
        // Only pass through verified Cloudinary URLs; drop any data: / blob: / legacy values
        avatar: m.user.avatar?.startsWith("https://res.cloudinary.com/") ? m.user.avatar : null,
      },
    }));
  }),
});
