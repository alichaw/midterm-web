import { z } from "zod";
import { env } from "~/env.js";

import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "~/server/api/trpc";

// 🛡️ 升級版圖片驗證邏輯：徹底阻擋 Path Traversal 與 SVG 攻擊
const isSafeCloudinaryUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    
    if (parsed.hostname !== "res.cloudinary.com") return false;
    
    if (!parsed.pathname.startsWith(`/${env.CLOUDINARY_CLOUD_NAME}/image/upload/`)) return false;
    
    if (parsed.pathname.includes("..") || parsed.pathname.includes("./")) return false;
    
    if (!/\.(jpg|jpeg|png|webp|gif)$/i.test(parsed.pathname)) return false;
    
    return true;
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
    .query(({ input }) => {
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
      const sanitizedName = escapeHtml(input.name);

      return ctx.db.post.create({
        data: {
          name: sanitizedName, 
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
