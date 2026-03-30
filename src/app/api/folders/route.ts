import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { name, parentId } = await req.json();
    const userId = (session.user as any).id;

    if (!name) {
      return NextResponse.json({ message: "Folder name is required" }, { status: 400 });
    }

    // Permission check if creating inside another folder
    if (parentId) {
      const parent = await prisma.folder.findUnique({
        where: { id: parentId },
        include: { accessList: { where: { userId } } }
      });
      if (!parent) return NextResponse.json({ message: "Parent not found" }, { status: 404 });
      const isOwner = parent.ownerId === userId;
      const isEditor = parent.accessList.some(a => a.permission === "EDIT");
      if (!isOwner && !isEditor) {
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

    return NextResponse.json(folder, { status: 201 });
  } catch (error) {
    console.error("Folder creation error:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const { searchParams } = new URL(req.url);
    const parentId = searchParams.get("parentId");
    const userId = (session?.user as any)?.id;

    // If a specific folder ID is requested (Public Link View)
    if (parentId) {
      const folders = await prisma.folder.findMany({
        where: { parentId },
        include: { owner: { select: { name: true, email: true } } },
      });
      const files = await prisma.file.findMany({
        where: { folderId: parentId },
      });
      return NextResponse.json({ folders, files });
    }

    // Root view requires authentication
    if (!session || !session.user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const folders = await prisma.folder.findMany({
      where: {
        parentId: null,
        OR: [
          { ownerId: userId },
          { accessList: { some: { userId: userId } } },
        ],
      },
      include: {
        owner: { select: { name: true, email: true } },
      },
    });

    return NextResponse.json({ folders, files: [] });
  } catch (error) {
    console.error("Fetch folders error:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}
