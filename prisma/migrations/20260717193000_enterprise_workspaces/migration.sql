-- Enterprise multi-tenant workspaces and Docker-backed opencode runtime.
PRAGMA foreign_keys=OFF;

CREATE TABLE "Tenant" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "telegramUserId" TEXT NOT NULL,
  "displayName" TEXT,
  "githubToken" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "Tenant_telegramUserId_key" ON "Tenant"("telegramUserId");

INSERT INTO "Tenant" ("id", "telegramUserId", "displayName", "createdAt", "updatedAt")
VALUES ('legacy-tenant', 'legacy', 'Legacy tenant', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

CREATE TABLE "new_Workspace" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenantId" TEXT NOT NULL DEFAULT 'legacy-tenant',
  "name" TEXT NOT NULL,
  "workDir" TEXT NOT NULL,
  "containerId" TEXT,
  "providerId" TEXT,
  "model" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Workspace_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Workspace" ("id", "tenantId", "name", "workDir", "active", "createdAt", "updatedAt")
SELECT "id", 'legacy-tenant', "name", "workDir", "active", "createdAt", "updatedAt" FROM "Workspace";
DROP TABLE "Workspace";
ALTER TABLE "new_Workspace" RENAME TO "Workspace";
CREATE UNIQUE INDEX "Workspace_tenantId_name_key" ON "Workspace"("tenantId", "name");
CREATE INDEX "Workspace_tenantId_active_idx" ON "Workspace"("tenantId", "active");

ALTER TABLE "WorkspaceProject" ADD COLUMN "provider" TEXT;
CREATE INDEX "WorkspaceProject_workspaceId_gitPath_idx" ON "WorkspaceProject"("workspaceId", "gitPath");

PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
