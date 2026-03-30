import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const folderId = searchParams.get("id");
    const userId = (session.user as any).id;

    if (!folderId) return NextResponse.json({ message: "Missing id" }, { status: 400 });

    const folder = await prisma.folder.findUnique({
      where: { id: folderId },
      include: { 
        accessList: { include: { user: { select: { name: true, email: true } } } },
        owner: { select: { name: true, email: true } }
      }
    });

    if (!folder || folder.ownerId !== userId) return NextResponse.json({ message: "Unauthorized" }, { status: 403 });

    return NextResponse.json(folder.accessList);
  } catch (error) {
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const accessId = searchParams.get("id");
    const userId = (session.user as any).id;

    const access = await prisma.folderAccess.findUnique({
      where: { id: accessId as string },
      include: { folder: true }
    });

    if (!access || access.folder.ownerId !== userId) return NextResponse.json({ message: "Unauthorized" }, { status: 403 });

    await prisma.folderAccess.delete({ where: { id: accessId as string } });
    return NextResponse.json({ message: "Access removed" });
  } catch (error) {
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}
