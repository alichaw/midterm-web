import { z } from "zod";
import { createTRPCRouter, publicProcedure, protectedProcedure } from "~/server/api/trpc";
import { hash } from "bcryptjs";
import { db } from "~/server/db";
import { v2 as cloudinary } from "cloudinary";


cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export const userRouter = createTRPCRouter({
  // 註冊 (40分)
  register: publicProcedure
    .input(z.object({ username: z.string().min(3), password: z.string().min(6) }))
    .mutation(async ({ input }) => {
      // 檢查帳號是否已存在 (避免重複註冊報錯)
      const existingUser = await db.user.findUnique({ where: { username: input.username } });
      if (existingUser) throw new Error("此帳號已被註冊");

      const hashedPassword = await hash(input.password, 12);
      return db.user.create({
        data: { username: input.username, password: hashedPassword },
      });
    }),

  uploadAvatar: protectedProcedure
    .input(z.object({ imageBase64: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (input.imageBase64.length > 4000000) {
        throw new Error("圖片檔案過大，請選擇更小的圖片");
      }

      console.log("上傳前綴檢查:", input.imageBase64.substring(0, 50));

      try {
        const uploadResponse = await cloudinary.uploader.upload(
          input.imageBase64,
          {
            folder: "midterm_avatars",
            transformation: [{ width: 256, height: 256, crop: "fill" }],
            timeout: 60000,
          }
        );

        return db.user.update({
          where: { id: ctx.session.user.id },
          data: { avatar: uploadResponse.secure_url },
        });
      } catch (error) {
        console.error("Cloudinary 上傳失敗:", error);
        throw new Error("圖片上傳失敗，請稍後再試");
      }
    }),

  createMessage: protectedProcedure
    .input(z.object({ content: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      return db.message.create({
        data: {
          content: input.content,
          userId: ctx.session.user.id,
        },
      });
    }),

  deleteMessage: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const message = await db.message.findUnique({ where: { id: input.id } });
      if (!message) {
        throw new Error("找不到該留言");
      }
      if (message.userId !== ctx.session.user.id) {
        throw new Error("無法刪除他人的留言");
      }
      return db.message.delete({ where: { id: input.id } });
    }),

  getMessages: publicProcedure.query(async () => {
    return db.message.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { id: true, username: true, avatar: true } },
      },
    });
  }),
});