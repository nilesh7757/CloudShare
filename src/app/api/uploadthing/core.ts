import { createUploadthing, type FileRouter } from "uploadthing/next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const f = createUploadthing();

export const ourFileRouter = {
  fileUploader: f({
    blob: { maxFileSize: "4GB", maxFileCount: 2000 },
  })
    .input(z.object({ 
      folderId: z.string(),
      originalName: z.string().optional(),
      isEncoded: z.boolean().optional(),
    }))
    .middleware(async ({ input, req }) => {
      const session = await getServerSession(authOptions);
      if (!session || !session.user) throw new Error("Unauthorized");
      return { 
        userId: (session.user as any).id, 
        folderId: input.folderId,
        originalName: input.originalName,
        isEncoded: !!input.isEncoded,
      };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      try {
        const finalName = metadata.originalName || file.name;
        await prisma.file.create({
          data: {
            name: finalName,
            url: file.ufsUrl || file.url,
            key: file.key,
            isEncoded: metadata.isEncoded,
            size: file.size,
            folderId: metadata.folderId,
            ownerId: metadata.userId,
          },
        });
        console.log(`Cloud Sync Success: ${finalName} (Encoded: ${metadata.isEncoded})`);
      } catch (dbError) {
        console.error("Cloud Sync Database Error:", dbError);
      }
      return { uploadedBy: metadata.userId };
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
