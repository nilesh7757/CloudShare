import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { google } from "googleapis";

async function getAuthClient() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return oauth2Client;
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      console.error("Download Proxy: Unauthorized access attempt");
      return new Response("Unauthorized", { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const fileId = searchParams.get("key");
    
    if (!fileId || fileId === "undefined") {
      console.error("Download Proxy: Missing or invalid file key (ID)");
      return new Response("Missing file key", { status: 400 });
    }

    console.log(`Download Proxy: Fetching file ID ${fileId} from Google Drive...`);

    const auth = await getAuthClient();
    const drive = google.drive({ version: "v3", auth });

    // 1. Get metadata
    const metadata = await drive.files.get({ fileId, fields: "mimeType, name" });
    console.log(`Download Proxy: Metadata found - ${metadata.data.name} (${metadata.data.mimeType})`);

    // 2. Fetch data
    const driveRes = await drive.files.get(
      { fileId, alt: "media" },
      { responseType: "stream" }
    );

    return new Response(driveRes.data as any, {
      headers: {
        "Content-Type": metadata.data.mimeType || "application/octet-stream",
        "Content-Disposition": "inline", // Allow browser preview
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error: any) {
    console.error("Download Proxy Error:", error.message);
    return new Response(`Failed to fetch file: ${error.message}`, { status: 500 });
  }
}
