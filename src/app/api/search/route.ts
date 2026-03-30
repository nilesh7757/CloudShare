import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const query = searchParams.get("q") || "";
    const userId = (session.user as any).id;

    if (!query) return NextResponse.json({ folders: [], files: [] });

    const [folders, files] = await Promise.all([
      prisma.folder.findMany({
        where: {
          name: { contains: query, mode: 'insensitive' },
          OR: [
            { ownerId: userId },
            { accessList: { some: { userId } } }
          ]
        },
        take: 10
      }),
      prisma.file.findMany({
        where: {
          name: { contains: query, mode: 'insensitive' },
          OR: [
            { ownerId: userId },
            { folder: { accessList: { some: { userId } } } }
          ]
        },
        take: 20
      })
    ]);

    return NextResponse.json({ folders, files });
  } catch (error) {
    console.error("Search error:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}
