import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { email, folderId, permission } = await req.json();
    const userId = (session.user as any).id;

    if (!email || !folderId) {
      return NextResponse.json({ message: "Missing email or folderId" }, { status: 400 });
    }

    // Check if the user is the owner or editor of the folder
    const folder = await prisma.folder.findUnique({
      where: { id: folderId },
      include: { accessList: { where: { userId } } }
    });

    if (!folder) return NextResponse.json({ message: "Folder not found" }, { status: 404 });

    const isOwner = folder.ownerId === userId;
    const isEditor = folder.accessList.some(a => a.permission === "EDIT");

    if (!isOwner && !isEditor) {
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

export async function PATCH(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { folderId, type, action } = await req.json(); // type: "VIEW" | "EDIT", action: "ENABLE" | "DISABLE"
    const userId = (session.user as any).id;

    const folder = await prisma.folder.findUnique({
      where: { id: folderId },
      include: { accessList: { where: { userId } } }
    });

    if (!folder) return NextResponse.json({ message: "Folder not found" }, { status: 404 });

    const isOwner = folder.ownerId === userId;
    const isEditor = folder.accessList.some(a => a.permission === "EDIT");

    if (!isOwner && !isEditor) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
    }

    let updateData: any = {};
    if (type === "VIEW") {
      updateData.viewToken = action === "ENABLE" ? (folder.viewToken || crypto.randomBytes(16).toString("hex")) : null;
    } else if (type === "EDIT") {
      updateData.editToken = action === "ENABLE" ? (folder.editToken || crypto.randomBytes(16).toString("hex")) : null;
    }

    const updatedFolder = await prisma.folder.update({
      where: { id: folderId },
      data: updateData,
    });

    return NextResponse.json(updatedFolder);
  } catch (error) {
    console.error("Link share error:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}
