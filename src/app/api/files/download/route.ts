import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { google } from "googleapis";
import { prisma } from "@/lib/prisma";
import { hasFilePermission } from "@/lib/permissions";

async function getAuthClient() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return oauth2Client;
}

async function isDescendantOf(childId: string, ancestorId: string): Promise<boolean> {
  let currentId: string | null = childId;
  while (currentId) {
    if (currentId === ancestorId) return true;
    const folder = await prisma.folder.findUnique({
      where: { id: currentId },
      select: { parentId: true }
    });
    if (!folder) break;
    currentId = folder.parentId;
  }
  return false;
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const { searchParams } = new URL(req.url);
    const driveFileId = searchParams.get("key");
    const viewToken = searchParams.get("viewToken");
    const editToken = searchParams.get("editToken");
    
    if (!driveFileId || driveFileId === "undefined") {
      return new Response("Missing file key", { status: 400 });
    }

    const file = await prisma.file.findFirst({ where: { key: driveFileId } });
    if (!file) return new Response("File not found in database", { status: 404 });

    // 1. Check Link Access
    if (viewToken || editToken) {
      const rootFolderId = viewToken || editToken;
      const valid = await isDescendantOf(file.folderId, rootFolderId as string);
      if (!valid) return new Response("Unauthorized link access", { status: 403 });
    } 
    // 2. Check Session Access
    else {
      if (!session || !session.user) return new Response("Unauthorized", { status: 401 });
      const userId = (session.user as any).id;
      const hasAccess = await hasFilePermission(file.id, userId, "VIEW");
      if (!hasAccess) return new Response("Unauthorized", { status: 403 });
    }

    const auth = await getAuthClient();
    const drive = google.drive({ version: "v3", auth });

    const metadata = await drive.files.get({ fileId: driveFileId, fields: "mimeType, name" });
    const driveRes = await drive.files.get(
      { fileId: driveFileId, alt: "media" },
      { responseType: "stream" }
    );

    return new Response(driveRes.data as any, {
      headers: {
        "Content-Type": metadata.data.mimeType || "application/octet-stream",
        "Content-Disposition": "inline",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error: any) {
    console.error("Download Proxy Error:", error.message);
    return new Response(`Failed to fetch file: ${error.message}`, { status: 500 });
  }
}
