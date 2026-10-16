// scripts/hydration/create-tasks.ts
// Hydrate Tasks database from epic files

import { createNotionPage, DATABASE_IDS } from './notion-client';
import { findEpicFiles, parseEpicFile, Story } from './parse-epic-stories';
import { transformTaskToNotion } from './transform-to-notion';

const PROJECT_ID = '3381d9be-65b3-814d-a97e-c7edaf5722f0'; // Allura Memory project ID from Session 1

interface HydrationResult {
  totalTasks: number;
  created: number;
  errors: Array<{ story: string; error: string }>;
}

/**
 * Hydrate Tasks database from epic files
 */
export async function hydrateTasks(baseDir: string): Promise<HydrationResult> {
  console.log('📥 Finding epic files...');
  const epicFiles = findEpicFiles(baseDir);

  if (epicFiles.length === 0) {
    console.log('⚠️  No epic files found');
    return { totalTasks: 0, created: 0, errors: [] };
  }

  console.log(`📄 Found ${epicFiles.length} epic file(s)`);

  const result: HydrationResult = {
    totalTasks: 0,
    created: 0,
    errors: [],
  };

  for (const epicFile of epicFiles) {
    console.log(`\n📖 Processing ${epicFile}...`);

    try {
      const { epicId, epicTitle, stories } = parseEpicFile(epicFile);
      console.log(`   Epic ${epicId}: ${epicTitle}`);
      console.log(`   Stories: ${stories.length}`);

      result.totalTasks += stories.length;

      for (const story of stories) {
        try {
          // Transform story to Notion properties
          const taskProps = transformTaskToNotion({
            name: `Story ${story.id}: ${story.title}`,
            status: story.status,
            priority: story.priority,
            type: 'Code',
            tags: ['Memory System', 'Agent'],
            projectId: PROJECT_ID,
          });

          // Create Notion page
          const pageId = await createNotionPage(DATABASE_IDS.tasks, taskProps);

          console.log(`   ✅ Created task for Story ${story.id}: ${story.title}`);
          result.created++;
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          console.error(`   ❌ Error creating task for Story ${story.id}: ${errorMsg}`);
          result.errors.push({
            story: story.id,
            error: errorMsg,
          });
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`❌ Error parsing epic file: ${errorMsg}`);
      result.errors.push({
        story: 'N/A',
        error: errorMsg,
      });
    }
  }

  console.log('\n📊 Hydration Summary:');
  console.log(`   Total stories: ${result.totalTasks}`);
  console.log(`   Created: ${result.created}`);
  console.log(`   Errors: ${result.errors.length}`);

  if (result.errors.length > 0) {
    console.log('\n❌ Errors:');
    result.errors.forEach(({ story, error }) => {
      console.log(`   Story ${story}: ${error}`);
    });
  }

  return result;
}

// CLI entry point
if (import.meta.main) {
  const baseDir = process.cwd();
  hydrateTasks(baseDir)
    .then((result) => {
      if (result.errors.length > 0) {
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}
