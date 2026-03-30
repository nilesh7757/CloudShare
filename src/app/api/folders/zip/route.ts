import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

async function getFolderManifest(folderId: string, currentPath: string = ""): Promise<any[]> {
  const [folders, files] = await Promise.all([
    prisma.folder.findMany({ where: { parentId: folderId } }),
    prisma.file.findMany({ where: { folderId: folderId } })
  ]);

  let manifest: any[] = [];

  // Add files in this folder
  for (const file of files) {
    manifest.push({
      name: file.name,
      url: file.url,
      isEncoded: file.isEncoded,
      path: currentPath ? `${currentPath}/${file.name}` : file.name
    });
  }

  // Recurse into subfolders
  for (const folder of folders) {
    const subManifest = await getFolderManifest(folder.id, currentPath ? `${currentPath}/${folder.name}` : folder.name);
    manifest = [...manifest, ...subManifest];
  }

  return manifest;
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const folderId = searchParams.get("id");

    if (!folderId) return NextResponse.json({ message: "Missing id" }, { status: 400 });

    const userId = (session.user as any).id;
    const folder = await prisma.folder.findUnique({
      where: { id: folderId },
      include: { accessList: { where: { userId } } }
    });

    if (!folder) return NextResponse.json({ message: "Not found" }, { status: 404 });
    const isOwner = folder.ownerId === userId;
    const hasAccess = folder.accessList.length > 0 || folder.isPublic;

    if (!isOwner && !hasAccess) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
    }

    const manifest = await getFolderManifest(folderId);
    return NextResponse.json(manifest);
  } catch (error) {
    console.error("ZIP manifest error:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}
