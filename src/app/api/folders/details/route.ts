import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ message: "Missing id" }, { status: 400 });
    }

    const userId = (session.user as any).id;

    const folder = await prisma.folder.findUnique({
      where: { id },
      include: {
        owner: { select: { email: true, name: true } },
        accessList: { where: { userId: userId || "none" } },
      },
    });

    if (!folder) {
      return NextResponse.json({ message: "Folder not found" }, { status: 404 });
    }

    return NextResponse.json(folder);
  } catch (error) {
    console.error("Folder details error:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}
