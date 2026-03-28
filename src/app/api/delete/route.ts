import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { UTApi } from "uploadthing/server";

const utapi = new UTApi();

async function getAllNestedItems(folderId: string): Promise<{ folderIds: string[], fileKeys: string[], fileIds: string[] }> {
  let folderIds = [folderId];
  let fileKeys: string[] = [];
  let fileIds: string[] = [];

  const [subFolders, files] = await Promise.all([
    prisma.folder.findMany({ where: { parentId: folderId } }),
    prisma.file.findMany({ where: { folderId: folderId } })
  ]);

  fileKeys = files.map(f => f.key).filter(Boolean);
  fileIds = files.map(f => f.id);

  for (const subFolder of subFolders) {
    const nested = await getAllNestedItems(subFolder.id);
    folderIds = [...folderIds, ...nested.folderIds];
    fileKeys = [...fileKeys, ...nested.fileKeys];
    fileIds = [...fileIds, ...nested.fileIds];
  }

  return { folderIds, fileKeys, fileIds };
}

export async function DELETE(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const type = searchParams.get("type"); 

    if (!id || !type) {
      return NextResponse.json({ message: "Missing id or type" }, { status: 400 });
    }

    const userId = (session.user as any).id;

    if (type === "folder") {
      const folder = await prisma.folder.findUnique({
        where: { id },
      });

      if (!folder) return NextResponse.json({ message: "Not found" }, { status: 404 });
      if (folder.ownerId !== userId) {
        return NextResponse.json({ message: "Only owners can delete folders" }, { status: 403 });
      }

      // 1. Get EVERY nested item recursively
      const { folderIds, fileKeys, fileIds } = await getAllNestedItems(id);
      
      // 2. Delete all files from UploadThing cloud
      if (fileKeys.length > 0) {
        await utapi.deleteFiles(fileKeys);
      }

      // 3. Delete everything from DB in correct order
      await prisma.$transaction([
        prisma.folderAccess.deleteMany({ where: { folderId: { in: folderIds } } }),
        prisma.file.deleteMany({ where: { id: { in: fileIds } } }),
        prisma.folder.deleteMany({ where: { id: { in: folderIds } } }),
      ]);
      
    } else {
      const file = await prisma.file.findUnique({
        where: { id },
        include: { folder: true }
      });

      if (!file) return NextResponse.json({ message: "Not found" }, { status: 404 });

      if (file.ownerId !== userId && file.folder.ownerId !== userId) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
      }

      if (file.key) {
        await utapi.deleteFiles(file.key);
      }

      await prisma.file.delete({ where: { id } });
    }

    return NextResponse.json({ message: "Recursive deletion complete" });
  } catch (error) {
    console.error("Delete error:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}
