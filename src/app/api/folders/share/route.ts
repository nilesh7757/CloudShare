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

    const { email, folderId, permission } = await req.json();

    if (!email || !folderId) {
      return NextResponse.json({ message: "Missing email or folderId" }, { status: 400 });
    }

    // Check if the user is the owner of the folder
    const folder = await prisma.folder.findUnique({
      where: { id: folderId },
    });

    if (!folder || folder.ownerId !== (session.user as any).id) {
      return NextResponse.json({ message: "Unauthorized to share this folder" }, { status: 403 });
    }

    // Find the user to share with
    const targetUser = await prisma.user.findUnique({
      where: { email },
    });

    if (!targetUser) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }

    const access = await prisma.folderAccess.upsert({
      where: {
        folderId_userId: {
          folderId,
          userId: targetUser.id,
        },
      },
      update: {
        permission: permission || "VIEW", // Default to Viewer if not specified
      },
      create: {
        folderId,
        userId: targetUser.id,
        permission: permission || "VIEW",
      },
    });

    return NextResponse.json(access, { status: 201 });
  } catch (error) {
    console.error("Sharing error:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}
