import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Seed script: creates a default repository and a couple of prompt templates
 * so the bot is usable out of the box.
 */
async function main(): Promise<void> {
  // Default repository (adjust path to your project)
  const defaultRepo = await prisma.repository.upsert({
    where: { slug: 'my-project' },
    update: {},
    create: {
      slug: 'my-project',
      name: 'My Project',
      path: process.env['DEFAULT_REPO_PATH'] ?? '/Users/bahram/Public/Code/nestjs/nestjs-automation-api',
      branch: 'main',
      buildCommand: 'npm run build',
      testCommand: 'npm test',
      lintCommand: 'npm run lint',
      typecheckCommand: 'npm run typecheck',
      installCommand: 'npm install',
      approvalPolicy: 'required',
      enabled: true,
    },
  });

  console.log('Seeded repository:', defaultRepo.slug);

  // Prompt templates
  await prisma.promptTemplate.upsert({
    where: { name: 'fix-issue' },
    update: {},
    create: {
      name: 'fix-issue',
      description: 'Fix a GitHub issue by number',
      template: 'Fix issue #{{issue}} in the repository. Read the issue description and implement the fix. Run the tests to verify.',
      variables: '{"issue":"number"}',
      category: 'github',
      enabled: true,
    },
  });

  await prisma.promptTemplate.upsert({
    where: { name: 'implement-feature' },
    update: {},
    create: {
      name: 'implement-feature',
      description: 'Implement a feature from a description',
      template: 'Implement the following feature: {{feature}}. Follow existing code conventions. Add tests.',
      variables: '{"feature":"text"}',
      category: 'development',
      enabled: true,
    },
  });

  await prisma.promptTemplate.upsert({
    where: { name: 'refactor' },
    update: {},
    create: {
      name: 'refactor',
      description: 'Refactor a specific file or module',
      template: 'Refactor {{target}}. Improve code quality, remove duplication, and ensure tests pass.',
      variables: '{"target":"path"}',
      category: 'maintenance',
      enabled: true,
    },
  });

  await prisma.promptTemplate.upsert({
    where: { name: 'update-deps' },
    update: {},
    create: {
      name: 'update-deps',
      description: 'Update project dependencies',
      template: 'Update all dependencies in the project. Run npm install, lint, typecheck, and tests to verify nothing breaks.',
      variables: '{}',
      category: 'maintenance',
      enabled: true,
    },
  });

  // Default configuration
  await prisma.configuration.upsert({
    where: { key: 'opencode.defaultProfile' },
    update: {},
    create: {
      key: 'opencode.defaultProfile',
      value: 'default',
      scope: 'global',
    },
  });

  console.log('Seed completed.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
