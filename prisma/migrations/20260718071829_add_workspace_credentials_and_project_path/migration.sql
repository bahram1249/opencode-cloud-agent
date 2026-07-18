-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN "apiKey" TEXT;
ALTER TABLE "Workspace" ADD COLUMN "githubLogin" TEXT;
ALTER TABLE "Workspace" ADD COLUMN "githubToken" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_WorkspaceProject" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gitPath" TEXT NOT NULL,
    "path" TEXT NOT NULL DEFAULT '.',
    "branch" TEXT NOT NULL DEFAULT 'main',
    "remoteUrl" TEXT,
    "provider" TEXT,
    "autoInstall" BOOLEAN NOT NULL DEFAULT true,
    "installCommand" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WorkspaceProject_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_WorkspaceProject" ("branch", "createdAt", "enabled", "gitPath", "id", "name", "provider", "remoteUrl", "updatedAt", "workspaceId") SELECT "branch", "createdAt", "enabled", "gitPath", "id", "name", "provider", "remoteUrl", "updatedAt", "workspaceId" FROM "WorkspaceProject";
DROP TABLE "WorkspaceProject";
ALTER TABLE "new_WorkspaceProject" RENAME TO "WorkspaceProject";
CREATE INDEX "WorkspaceProject_workspaceId_path_idx" ON "WorkspaceProject"("workspaceId", "path");
CREATE UNIQUE INDEX "WorkspaceProject_workspaceId_name_key" ON "WorkspaceProject"("workspaceId", "name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
