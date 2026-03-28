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

    if (!name) {
      return NextResponse.json({ message: "Folder name is required" }, { status: 400 });
    }

    const folder = await prisma.folder.create({
      data: {
        name,
        parentId,
        ownerId: (session.user as any).id,
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
