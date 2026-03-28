# Cloud File Sharing Platform

## Features
- **User Authentication**: Secure registration and login using email/password (NextAuth.js + bcrypt).
- **File & Folder Management**: Create folders, upload files, and navigate through nested directories.
- **Collaborative Sharing**: Share any folder with a friend using their email.
- **Shared Access**: Users can see, upload to, and edit folders shared with them by others.
- **Modern UI**: Clean and responsive dashboard built with Tailwind CSS and Lucide icons.

## Quick Start

### 1. Prerequisites
- **PostgreSQL**: You need a running PostgreSQL database (e.g., from Neon, Supabase, or locally).
- **UploadThing**: Sign up at [uploadthing.com](https://uploadthing.com), create an app, and get your API keys.

### 2. Setup
1.  Create a `.env` file in the root directory and copy the contents from `.env.example`.
2.  Fill in your `DATABASE_URL`, `NEXTAUTH_SECRET`, `UPLOADTHING_SECRET`, and `UPLOADTHING_APP_ID`.
3.  Install dependencies:
    ```bash
    npm install
    ```
4.  Sync the database:
    ```bash
    npx prisma db push
    ```

### 3. Run
Start the development server:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

## How to use
1.  **Register**: Create an account for yourself and another for a friend.
2.  **Create a Folder**: Click the "+" button to create a folder (e.g., "Project Work").
3.  **Upload Files**: Enter the folder and use the "Choose File" button to upload documents or images.
4.  **Share**: Click the "Share" icon (visible when hovering over a folder) and enter your friend's email.
5.  **Collaborate**: Your friend logs in, sees the "Project Work" folder on their dashboard, and can now upload their own files there for you to see!
