import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { hasFolderPermission } from "@/lib/permissions";

async function isDescendantOf(childId: string, ancestorId: string): Promise<boolean> {
  let currentId: string | null = childId;
  while (currentId) {
    if (currentId === ancestorId) return true;
    const folderRecord: { parentId: string | null } | null = await prisma.folder.findUnique({
      where: { id: currentId },
      select: { parentId: true }
    });
    if (!folderRecord) break;
    currentId = folderRecord.parentId;
  }
  return false;
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { name, parentId: rawParentId } = await req.json();
    const parentId = rawParentId || null;
    const userId = (session.user as any).id;

    if (!name) {
      return NextResponse.json({ message: "Folder name is required" }, { status: 400 });
    }

    // Permission check if creating inside another folder
    if (parentId) {
      const hasEditAccess = await hasFolderPermission(parentId, userId, "EDIT");
      if (!hasEditAccess) {
        return NextResponse.json({ message: "Only owners and editors can create subfolders" }, { status: 403 });
      }
    }

    const folder = await prisma.folder.create({
      data: {
        name,
        parentId,
        ownerId: userId,
      },
    });

    console.log("Folder created successfully:", folder.id);
    return NextResponse.json(folder, { status: 201 });
  } catch (error: any) {
    console.error("Folder creation error details:", {
      message: error.message,
      stack: error.stack,
      code: error.code,
      meta: error.meta
    });
    return NextResponse.json({ 
      message: "Internal server error", 
      details: process.env.NODE_ENV === "development" ? error.message : undefined 
    }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const { searchParams } = new URL(req.url);
    const parentId = searchParams.get("parentId");
    const viewToken = searchParams.get("viewToken");
    const editToken = searchParams.get("editToken");
    const userId = (session?.user as any)?.id;

    // Handle token-based access (View or Edit)
    if (viewToken || editToken) {
      const rootFolderId = viewToken || editToken;
      const targetFolderId = parentId || rootFolderId;

      // Verify target is descendant of root or root itself
      const valid = await isDescendantOf(targetFolderId as string, rootFolderId as string);
      if (!valid) return NextResponse.json({ message: "Invalid access path" }, { status: 403 });

      const folder = await prisma.folder.findUnique({
        where: { id: targetFolderId as string },
        include: { owner: { select: { name: true, email: true } } }
      });
      
      if (!folder) return NextResponse.json({ message: "Not found" }, { status: 404 });
      
      const folders = await prisma.folder.findMany({
        where: { parentId: folder.id },
        include: { owner: { select: { name: true, email: true } } },
      });
      const files = await prisma.file.findMany({
        where: { folderId: folder.id },
      });

      return NextResponse.json({ 
        folders, 
        files, 
        currentFolder: folder,
        linkPermission: editToken ? "EDIT" : "VIEW" 
      });
    }

    // If a specific folder ID is requested
    if (parentId) {
      const hasAccess = await hasFolderPermission(parentId, userId || "none", "VIEW");
      if (!hasAccess) return NextResponse.json({ message: "Unauthorized" }, { status: 403 });

      const folder = await prisma.folder.findUnique({
        where: { id: parentId },
        include: { owner: { select: { name: true, email: true } } }
      });

      const folders = await prisma.folder.findMany({
        where: { parentId },
        include: { owner: { select: { name: true, email: true } } },
      });
      const files = await prisma.file.findMany({
        where: { folderId: parentId },
      });
      return NextResponse.json({ folders, files, currentFolder: folder });
    }

    // Root view requires authentication
    if (!session || !session.user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    // 1. Get all owned root folders
    const ownedRootFolders = await prisma.folder.findMany({
      where: { ownerId: userId, parentId: null },
      include: { owner: { select: { name: true, email: true } } },
    });

    // 2. Get all explicitly shared folders (at any level)
    const explicitAccess = await prisma.folderAccess.findMany({
      where: { userId },
      include: { 
        folder: { 
          include: { 
            owner: { select: { name: true, email: true } } 
          } 
        } 
      }
    });

    const rootSharedFolders: any[] = [];
    for (const access of explicitAccess) {
      const folder = access.folder;
      
      // If it's a root folder and not owned by the user, add it
      if (!folder.parentId) {
        if (folder.ownerId !== userId) rootSharedFolders.push(folder);
        continue;
      }

      // If it's a subfolder, check if the user has access to its parent
      // If the user does NOT have access to the parent, this subfolder should appear in the root!
      const hasParentAccess = await hasFolderPermission(folder.parentId, userId, "VIEW");
      if (!hasParentAccess) {
        rootSharedFolders.push(folder);
      }
    }

    // Combine and return (Deduplicate if necessary, though explicitAccess is unique per folderId_userId)
    const allFolders = [...ownedRootFolders, ...rootSharedFolders];

    return NextResponse.json({ folders: allFolders, files: [] });
  } catch (error) {
    console.error("Fetch folders error:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}
