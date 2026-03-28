import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const { folders, rootFolderId } = await req.json(); 
    const userId = (session.user as any).id;
    
    // pathMap tracks: "folder/subfolder" -> "database_id"
    const pathMap: Record<string, string> = { "": rootFolderId || "" };

    // Sort by depth (number of slashes) to ensure parents exist before children
    const sortedFolders = folders.sort((a: any, b: any) => 
      (a.path.match(/\//g) || []).length - (b.path.match(/\//g) || []).length
    );

    for (const f of sortedFolders) {
      const parentId = pathMap[f.parentPath] || rootFolderId || null;
      
      // Look for existing folder first to prevent duplicates
      let folder = await prisma.folder.findFirst({
        where: {
          name: f.name,
          parentId: parentId === "" ? null : parentId,
          ownerId: userId
        }
      });

      if (!folder) {
        folder = await prisma.folder.create({
          data: {
            name: f.name,
            parentId: parentId === "" ? null : parentId,
            ownerId: userId,
          }
        });
      }

      pathMap[f.path] = folder.id;
    }

    return NextResponse.json(pathMap);
  } catch (error) {
    console.error("Batch folder error:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}
