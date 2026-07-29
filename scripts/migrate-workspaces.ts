/**
 * Migration script: migrate existing workspaces to container-based model.
 *
 * For each existing workspace:
 * 1. Updates workDir to auto-assigned pattern {workspaceRoot}/{tenantId}/{sanitizedName}
 * 2. Creates a Docker container (if Docker is available)
 * 3. Injects GITHUB_TOKEN/GITHUB_USER from tenant into container env
 *
 * Usage: npx tsx scripts/migrate-workspaces.ts
 */
import { PrismaClient } from '@prisma/client';
import { mkdirSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const prisma = new PrismaClient();

const WORKSPACE_ROOT = process.env['WORKSPACE_ROOT'] ?? '/data/workspaces';
const WORKSPACE_IMAGE = process.env['WORKSPACE_IMAGE'] ?? 'opencode-cloud-agent/workspace:latest';

async function main() {
  console.log('Starting workspace migration...');

  const workspaces = await prisma.workspace.findMany({
    include: { tenant: true },
  });

  console.log(`Found ${workspaces.length} workspace(s) to migrate.`);

  for (const ws of workspaces) {
    const sanitizedName = ws.name.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const newPath = resolve(join(WORKSPACE_ROOT, ws.tenantId, sanitizedName));

    console.log(`\nWorkspace "${ws.name}":`);
    console.log(`  Old path: ${ws.workDir}`);
    console.log(`  New path: ${newPath}`);

    // 1. Ensure new directory exists
    mkdirSync(newPath, { recursive: true });

    // 2. Update DB record with new workDir
    await prisma.workspace.update({
      where: { id: ws.id },
      data: { workDir: newPath },
    });
    console.log(`  ✅ workDir updated in DB`);

    // 3. Try to create Docker container
    try {
      const { stdout } = await execFileAsync('docker', ['info']);
      console.log(`  Docker available, creating container...`);

      const env: string[] = ['TERM=xterm-256color'];
      if (ws.tenant.githubToken) {
        env.push(`GITHUB_TOKEN=${ws.tenant.githubToken}`);
        if (ws.tenant.githubLogin) env.push(`GITHUB_USER=${ws.tenant.githubLogin}`);
      }
      if (ws.providerId) {
        // env for provider would need the API key which isn't stored in DB
        // this must be configured manually after migration
      }

      const name = `opencode-ws-${ws.id}`.replace(/[^a-zA-Z0-9_.-]/g, '-');

      // Remove old container if exists
      try {
        await execFileAsync('docker', ['rm', '-f', name]);
      } catch { /* no old container */ }

      const createArgs = [
        'create',
        '--name', name,
        '-w', '/workspace',
        '-e', env.join(' -e '),
        '--label', `opencode-cloud-agent.workspaceId=${ws.id}`,
        '--label', `opencode-cloud-agent.tenantId=${ws.tenantId}`,
        '-v', `${newPath}:/workspace`,
        WORKSPACE_IMAGE,
        'sleep', 'infinity',
      ];
      await execFileAsync('docker', createArgs);
      await execFileAsync('docker', ['start', name]);

      // Configure git credentials
      if (ws.tenant.githubLogin && ws.tenant.githubToken) {
        await execFileAsync('docker', [
          'exec', name,
          'git', 'config', '--global', 'credential.helper',
          `!f() { echo "username=${ws.tenant.githubLogin}"; echo "password=${ws.tenant.githubToken}"; }; f`,
        ]);
      }

      // Update containerId in DB
      await prisma.workspace.update({
        where: { id: ws.id },
        data: { containerId: name },
      });
      console.log(`  ✅ Container created: ${name}`);
    } catch (err) {
      console.log(`  ⚠️  Docker container creation skipped: ${(err as Error).message}`);
      console.log(`  Container can be created later on first session.`);
    }
  }

  console.log('\nMigration complete!');
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
