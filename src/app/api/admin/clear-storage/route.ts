import { NextResponse } from "next/server";
import { UTApi } from "uploadthing/server";

const utapi = new UTApi();

export async function GET() {
  try {
    // 1. List all files currently in the cloud
    const { files } = await utapi.listFiles();
    const keys = files.map((f) => f.key);

    if (keys.length === 0) {
      return NextResponse.json({ message: "Storage is already empty" });
    }

    // 2. Delete them all
    await utapi.deleteFiles(keys);

    return NextResponse.json({ 
      message: `Successfully cleared ${keys.length} files from UploadThing`,
      clearedKeys: keys 
    });
  } catch (error) {
    console.error("Cleanup error:", error);
    return NextResponse.json({ message: "Failed to clear storage" }, { status: 500 });
  }
}
