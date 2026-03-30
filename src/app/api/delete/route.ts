import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { deleteDriveFile } from "@/lib/googleDrive";
import { hasFolderPermission, hasFilePermission } from "@/lib/permissions";

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
    if (!session || !session.user) return new Response("Unauthorized", { status: 401 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const type = searchParams.get("type"); 

    if (!id || !type) return new Response("Missing id or type", { status: 400 });

    const userId = (session.user as any).id;

    if (type === "folder") {
      const folderExists = await prisma.folder.findUnique({ where: { id } });
      if (!folderExists) return new Response("Not found", { status: 404 });

      const hasEditAccess = await hasFolderPermission(id, userId, "EDIT");
      if (!hasEditAccess) {
        return new Response("Only owners and editors can delete folders", { status: 403 });
      }

      // 1. Get EVERY nested item recursively
      const { folderIds, fileKeys, fileIds } = await getAllNestedItems(id);
      
      // 2. Delete all files from Google Drive cloud (Parallel & Resilient)
      if (fileKeys.length > 0) {
        await Promise.all(
          fileKeys.map(key => 
            deleteDriveFile(key).catch(e => console.error(`Failed to delete Drive file ${key}:`, e.message))
          )
        );
      }

      // 3. Delete everything from DB
      await prisma.$transaction([
        prisma.folderAccess.deleteMany({ where: { folderId: { in: folderIds } } }),
        prisma.file.deleteMany({ where: { id: { in: fileIds } } }),
        prisma.folder.deleteMany({ where: { id: { in: folderIds } } }),
      ]);
      
    } else {
      const file = await prisma.file.findUnique({ where: { id } });
      if (!file) return new Response("Not found", { status: 404 });

      const hasEditAccess = await hasFilePermission(id, userId, "EDIT");
      if (!hasEditAccess) {
        return new Response("Unauthorized", { status: 403 });
      }

      if (file.key) {
        await deleteDriveFile(file.key).catch(e => console.error("Drive delete error:", e.message));
      }

      await prisma.file.delete({ where: { id } });
    }

    return NextResponse.json({ message: "Deleted successfully" });
  } catch (error: any) {
    console.error("Delete error:", error);
    return new Response(`Delete failed: ${error.message}`, { status: 500 });
  }
}
