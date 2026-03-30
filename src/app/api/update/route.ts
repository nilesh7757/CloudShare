import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const { id, type, updates } = await req.json(); // type: "folder" | "file", updates: { isStarred, color, parentId, folderId }
    const userId = (session.user as any).id;

    if (type === "folder") {
      const folder = await prisma.folder.findUnique({ where: { id } });
      if (!folder || folder.ownerId !== userId) return NextResponse.json({ message: "Unauthorized" }, { status: 403 });

      const updated = await prisma.folder.update({
        where: { id },
        data: {
          isStarred: updates.isStarred !== undefined ? updates.isStarred : undefined,
          color: updates.color !== undefined ? updates.color : undefined,
          parentId: updates.parentId !== undefined ? updates.parentId : undefined,
        }
      });
      return NextResponse.json(updated);
    } else {
      const file = await prisma.file.findUnique({ where: { id }, include: { folder: true } });
      if (!file || (file.ownerId !== userId && file.folder.ownerId !== userId)) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
      }

      const updated = await prisma.file.update({
        where: { id },
        data: {
          isStarred: updates.isStarred !== undefined ? updates.isStarred : undefined,
          folderId: updates.folderId !== undefined ? updates.folderId : undefined,
        }
      });
      return NextResponse.json(updated);
    }
  } catch (error) {
    console.error("Update error:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}
