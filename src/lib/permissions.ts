import { prisma } from "./prisma";

export async function hasFolderPermission(folderId: string | null, userId: string, requiredPermission: "VIEW" | "EDIT"): Promise<boolean> {
  if (!folderId) return false;
  let currentId: string | null = folderId;

  while (currentId) {
    const folderRecord: any = await prisma.folder.findUnique({
      where: { id: currentId },
      include: {
        accessList: {
          where: { userId }
        }
      }
    });

    if (!folderRecord) break;

    // 1. Check Owner
    if (folderRecord.ownerId === userId) return true;

    // 2. Check explicit share
    const access = folderRecord.accessList[0];
    if (access) {
      if (requiredPermission === "VIEW") return true; // VIEW or EDIT allows VIEW
      if (access.permission === "EDIT") return true;  // EDIT allows everything
    }

    // 3. Go up
    currentId = folderRecord.parentId;
  }

  return false;
}

export async function hasFilePermission(fileId: string, userId: string, requiredPermission: "VIEW" | "EDIT"): Promise<boolean> {
  const file = await prisma.file.findUnique({
    where: { id: fileId },
    select: { folderId: true, ownerId: true }
  });

  if (!file) return false;
  if (file.ownerId === userId) return true;

  return hasFolderPermission(file.folderId, userId, requiredPermission);
}
