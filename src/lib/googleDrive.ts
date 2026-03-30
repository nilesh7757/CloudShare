import { google } from "googleapis";

/**
 * GOOGLE DRIVE PERSONAL ENGINE (15GB)
 * Uses OAuth2 Refresh Token to act as the user.
 */

async function getAuthClient() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  });

  return oauth2Client;
}

export async function createResumableUploadSession(name: string) {
  const auth = await getAuthClient();
  const tokens = await auth.getAccessToken();
  
  const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${tokens.token}`,
      "Content-Type": "application/json",
      "X-Upload-Content-Type": "application/octet-stream",
    },
    body: JSON.stringify({ name })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Drive Session Error: ${err}`);
  }

  return response.headers.get("Location");
}

export async function deleteDriveFile(fileId: string) {
  const auth = await getAuthClient();
  const drive = google.drive({ version: "v3", auth });
  await drive.files.delete({ fileId });
}

export async function getDriveFileUrl(fileId: string) {
  return `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
}
