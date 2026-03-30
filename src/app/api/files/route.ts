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

    const body = await req.json();
    const files = Array.isArray(body) ? body : [body];
    const userId = (session.user as any).id;

    if (files.length === 0) {
      return NextResponse.json({ message: "No files provided" }, { status: 400 });
    }

    // Permission check for the target folder (assuming all files go to the same folder in a batch)
    const targetFolderId = files[0].folderId;
    const folder = await prisma.folder.findUnique({
      where: { id: targetFolderId },
      include: { accessList: { where: { userId } } }
    });

    if (!folder) return NextResponse.json({ message: "Folder not found" }, { status: 404 });
    const isOwner = folder.ownerId === userId;
    const isEditor = folder.accessList.some(a => a.permission === "EDIT");

    if (!isOwner && !isEditor) {
      return NextResponse.json({ message: "Only owners and editors can upload files" }, { status: 403 });
    }

    // Process in a transaction or loop (Prisma createMany is better for Postgres)
    const createdFiles = await prisma.$transaction(
      files.map((f: any) => 
        prisma.file.create({
          data: {
            name: f.name,
            url: f.url,
            key: f.key || "", // Fallback if key is missing from batch
            isEncoded: f.isEncoded || false,
            size: f.size,
            folderId: f.folderId,
            ownerId: userId,
          },
        })
      )
    );

    return NextResponse.json(createdFiles, { status: 201 });
  } catch (error) {
    console.error("File record creation error:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}
