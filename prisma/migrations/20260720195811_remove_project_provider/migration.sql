-- Drop provider column from WorkspaceProject (model config is now workspace-level only)
ALTER TABLE "WorkspaceProject" DROP COLUMN "provider";
