import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { createResumableUploadSession } from "@/lib/googleDrive";

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const { action, name, uploadUrl, chunk, range, totalSize } = await req.json();

    // ACTION 1: Initialize the session
    if (action === "INIT") {
      const url = await createResumableUploadSession(name);
      return NextResponse.json({ uploadUrl: url });
    }

    // ACTION 2: Forward a chunk to Google
    if (action === "CHUNK") {
      // Convert base64 chunk back to binary
      const buffer = Buffer.from(chunk, 'base64');
      
      const response = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Range": range,
          "Content-Length": buffer.length.toString(),
        },
        body: buffer
      });

      if (response.status === 308 || response.ok) {
        // 308 Resume Incomplete or 200/201 OK
        const data = response.status === 308 ? {} : await response.json();
        return NextResponse.json({ status: response.status, data });
      } else {
        const err = await response.text();
        return NextResponse.json({ message: "Google rejected chunk", details: err }, { status: 500 });
      }
    }

    return NextResponse.json({ message: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    console.error("Bridge Error:", error);
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}
