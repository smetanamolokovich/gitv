import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const execAsync = promisify(exec);

describe('Integration Tests', () => {
  const testDir = path.join(os.tmpdir(), 'git-visual-test');
  const dotFilePath = path.join(os.homedir(), '.gogitlocalstats');
  let originalDotFile: string | null = null;

  beforeAll(async () => {
    // Backup original dotfile if it exists
    if (fs.existsSync(dotFilePath)) {
      originalDotFile = fs.readFileSync(dotFilePath, 'utf-8');
    }

    // Create test directory structure
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    // Create a mock git repository
    const gitRepo = path.join(testDir, 'test-repo');
    fs.mkdirSync(gitRepo, { recursive: true });
    fs.mkdirSync(path.join(gitRepo, '.git'), { recursive: true });

    // Create a non-git directory
    const nonGitDir = path.join(testDir, 'non-git');
    fs.mkdirSync(nonGitDir, { recursive: true });

    // Create a node_modules directory (should be ignored)
    const nodeModules = path.join(testDir, 'node_modules');
    fs.mkdirSync(nodeModules, { recursive: true });
    fs.mkdirSync(path.join(nodeModules, '.git'), { recursive: true });
  });

  afterAll(async () => {
    // Restore original dotfile
    if (originalDotFile !== null) {
      fs.writeFileSync(dotFilePath, originalDotFile, 'utf-8');
    } else if (fs.existsSync(dotFilePath)) {
      fs.unlinkSync(dotFilePath);
    }

    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    // Clear dotfile before each test
    if (fs.existsSync(dotFilePath)) {
      fs.unlinkSync(dotFilePath);
    }
  });

  describe('CLI Integration', () => {
    it('should show help when no command provided', async () => {
      try {
        await execAsync('yarn ts-node src/main.ts');
      } catch (error: any) {
        expect(error.stdout || error.stderr).toContain('You must specify a command');
      }
    });

    it('should show help with --help flag', async () => {
      const { stdout } = await execAsync('yarn ts-node src/main.ts --help');
      
      expect(stdout).toContain('Usage: gitv <command> [options]');
      expect(stdout).toContain('gitv add <folder>');
      expect(stdout).toContain('gitv stats <email>');
    });

    it('should scan directories and find git repositories', async () => {
      const { stdout } = await execAsync(`yarn ts-node src/main.ts add ${testDir}`);
      
      expect(stdout).toContain('Found 1 Git repositories');
      expect(stdout).toContain('test-repo');
      expect(stdout).not.toContain('node_modules');
      expect(stdout).not.toContain('non-git');
    });

    it('should handle stats command with email', async () => {
      // First add some repositories
      await execAsync(`yarn ts-node src/main.ts add ${testDir}`);
      
      // Then try to get stats (will show no repositories message since no real git history)
      const { stdout } = await execAsync('yarn ts-node src/main.ts stats test@example.com');
      
      expect(stdout).toContain('Analyzing contributions for: test@example.com');
    });

    it('should handle non-existent directory gracefully', async () => {
      try {
        await execAsync('yarn ts-node src/main.ts add /nonexistent/directory');
      } catch (error: any) {
        expect(error.stderr || error.stdout).toContain('Directory does not exist');
      }
    });
  });

  describe('End-to-End Workflow', () => {
    it('should complete full scan and stats workflow', async () => {
      // Step 1: Scan for repositories
      const scanResult = await execAsync(`yarn ts-node src/main.ts add ${testDir}`);
      expect(scanResult.stdout).toContain('Successfully saved repositories');

      // Step 2: Verify dotfile was created
      expect(fs.existsSync(dotFilePath)).toBe(true);
      const dotFileContent = fs.readFileSync(dotFilePath, 'utf-8');
      expect(dotFileContent).toContain('test-repo');

      // Step 3: Generate stats
      const statsResult = await execAsync('yarn ts-node src/main.ts stats test@example.com');
      expect(statsResult.stdout).toContain('Analyzing contributions');

      // Step 4: Scan again (should merge with existing)
      const secondScanResult = await execAsync(`yarn ts-node src/main.ts add ${testDir}`);
      expect(secondScanResult.stdout).toContain('Found 1 Git repositories');
    });
  });
});
