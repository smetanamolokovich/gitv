import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import ora from 'ora';

// ===== CONSTANTS =====
const CONFIG = {
  DOTFILE: '.gogitlocalstats',
  IGNORED_DIRECTORIES: ['node_modules', 'vendor', '.git'],
  GIT_DIRECTORY: '.git',
} as const;

// ===== INTERFACES =====
interface IFileManager {
  getDotFilePath(): string;
  parseFileLinesToSlice(filePath: string): string[];
  writeRepositoriesToFile(repos: string[], filePath: string): void;
  mergeRepositoriesInFile(filePath: string, newRepos: string[]): void;
}

interface IRepositoryManager {
  containsRepository(repositories: string[], repoPath: string): boolean;
  mergeRepositoryLists(newRepos: string[], existingRepos: string[]): string[];
  isIgnoredDirectory(directoryName: string): boolean;
}

interface IGitScanner {
  scanForGitRepositories(rootPath: string): string[];
}

interface IScanReporter {
  displayFoundRepositories(repositories: string[]): void;
  showScanSummary(rootPath: string, repositoryCount: number): void;
}

// ===== IMPLEMENTATIONS =====
class FileManager implements IFileManager {
  getDotFilePath(): string {
    return path.join(os.homedir(), CONFIG.DOTFILE);
  }

  parseFileLinesToSlice(filePath: string): string[] {
    if (!fs.existsSync(filePath)) {
      return [];
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    return content.split('\n').filter(line => line.length > 0);
  }

  writeRepositoriesToFile(repos: string[], filePath: string): void {
    const content = repos.join('\n');
    fs.writeFileSync(filePath, content, 'utf-8');
  }

  mergeRepositoriesInFile(filePath: string, newRepos: string[]): void {
    const existingRepos = this.parseFileLinesToSlice(filePath);
    const repositoryManager = new RepositoryManager();
    const mergedRepos = repositoryManager.mergeRepositoryLists(newRepos, existingRepos);
    this.writeRepositoriesToFile(mergedRepos, filePath);
  }
}

class RepositoryManager implements IRepositoryManager {
  containsRepository(repositories: string[], repoPath: string): boolean {
    return repositories.includes(repoPath);
  }

  mergeRepositoryLists(newRepos: string[], existingRepos: string[]): string[] {
    const repoSet = new Set(newRepos);
    for (const repo of existingRepos) {
      repoSet.add(repo);
    }
    return Array.from(repoSet).sort();
  }

  isIgnoredDirectory(directoryName: string): boolean {
    return (CONFIG.IGNORED_DIRECTORIES as readonly string[]).includes(directoryName);
  }
}

// ===== SCANNING ENGINE =====
class GitScanner implements IGitScanner {
  constructor(private repositoryManager: IRepositoryManager) {}

  private isGitRepository(directoryPath: string): boolean {
    try {
      const gitPath = path.join(directoryPath, CONFIG.GIT_DIRECTORY);
      return fs.existsSync(gitPath) && fs.statSync(gitPath).isDirectory();
    } catch (error) {
      return false;
    }
  }

  private shouldSkipDirectory(directoryName: string): boolean {
    return this.repositoryManager.isIgnoredDirectory(directoryName);
  }

  private scanDirectoryRecursively(directoryPath: string): string[] {
    let repositories: string[] = [];

    try {
      // Check if current directory is a Git repository
      if (this.isGitRepository(directoryPath)) {
        repositories.push(directoryPath);
        return repositories; // Don't scan subdirectories of Git repos
      }

      // Scan subdirectories
      const items = fs.readdirSync(directoryPath);
      
      for (const item of items) {
        if (this.shouldSkipDirectory(item)) {
          continue;
        }

        const itemPath = path.join(directoryPath, item);
        
        try {
          const stat = fs.statSync(itemPath);
          if (stat.isDirectory()) {
            const foundRepos = this.scanDirectoryRecursively(itemPath);
            repositories = repositories.concat(foundRepos);
          }
        } catch (error) {
          // Silently ignore permission errors and continue scanning
          continue;
        }
      }
    } catch (error) {
      // Handle directory access errors gracefully
      console.warn(`⚠️  Could not access directory: ${directoryPath}`);
    }

    return repositories;
  }

  scanForGitRepositories(rootPath: string): string[] {
    if (!fs.existsSync(rootPath)) {
      throw new Error(`Directory does not exist: ${rootPath}`);
    }

    const stat = fs.statSync(rootPath);
    if (!stat.isDirectory()) {
      throw new Error(`Path is not a directory: ${rootPath}`);
    }

    return this.scanDirectoryRecursively(rootPath);
  }
}

// ===== REPORTING =====
class ScanReporter implements IScanReporter {
  constructor(private fileManager: IFileManager) {}

  displayFoundRepositories(repositories: string[]): void {
    if (repositories.length === 0) {
      console.log('\n❌ No Git repositories found in the specified directory.');
      return;
    }

    console.log(`\n📊 Found ${repositories.length} Git repositories:`);
    repositories.forEach((repo, index) => {
      console.log(`  ${index + 1}. 📁 ${repo}`);
    });
  }

  showScanSummary(rootPath: string, repositoryCount: number): void {
    console.log(`\n✅ Scan completed for: ${rootPath}`);
    console.log(`📈 Total repositories found: ${repositoryCount}`);
    console.log(`💾 Repositories saved to: ${this.fileManager.getDotFilePath()}`);
  }
}

// ===== DEPENDENCY INJECTION CONTAINER =====
class ScanContainer {
  private fileManager: IFileManager;
  private repositoryManager: IRepositoryManager;
  private gitScanner: IGitScanner;
  private scanReporter: IScanReporter;

  constructor() {
    this.fileManager = new FileManager();
    this.repositoryManager = new RepositoryManager();
    this.gitScanner = new GitScanner(this.repositoryManager);
    this.scanReporter = new ScanReporter(this.fileManager);
  }

  getFileManager(): IFileManager {
    return this.fileManager;
  }

  getGitScanner(): IGitScanner {
    return this.gitScanner;
  }

  getScanReporter(): IScanReporter {
    return this.scanReporter;
  }
}


// ===== MAIN EXPORT =====
export function scan(folder: string): void {
  const container = new ScanContainer();
  const fileManager = container.getFileManager();
  const gitScanner = container.getGitScanner();
  const scanReporter = container.getScanReporter();
  
  const spinner = ora('Scanning for Git repositories...').start();
  
  try {
    const repositories = gitScanner.scanForGitRepositories(folder);
    spinner.succeed(`Found ${repositories.length} Git repositories`);
    
    scanReporter.displayFoundRepositories(repositories);
    
    if (repositories.length > 0) {
      const saveSpinner = ora('Saving repositories to local database...').start();
      const filePath = fileManager.getDotFilePath();
      fileManager.mergeRepositoriesInFile(filePath, repositories);
      saveSpinner.succeed('Successfully saved repositories');
      
      scanReporter.showScanSummary(folder, repositories.length);
    }
  } catch (error) {
    spinner.fail('Failed to scan directories');
    console.error(`❌ Error: ${error}`);
    process.exit(1);
  }
}

// ===== EXPORTS FOR TESTING =====
export {
  FileManager,
  RepositoryManager,
  GitScanner,
  ScanReporter,
  ScanContainer,
  IFileManager,
  IRepositoryManager,
  IGitScanner,
  IScanReporter,
};
