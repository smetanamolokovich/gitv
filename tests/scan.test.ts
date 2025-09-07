import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  FileManager,
  RepositoryManager,
  GitScanner,
  ScanReporter,
  ScanContainer,
} from '../src/scan';

// Mock external dependencies
jest.mock('fs');
jest.mock('path');
jest.mock('os');
jest.mock('ora');

const mockFs = fs as jest.Mocked<typeof fs>;
const mockPath = path as jest.Mocked<typeof path>;
const mockOs = os as jest.Mocked<typeof os>;

describe('FileManager', () => {
  let fileManager: FileManager;

  beforeEach(() => {
    fileManager = new FileManager();
    jest.clearAllMocks();
  });

  describe('getDotFilePath', () => {
    it('should return correct dotfile path', () => {
      mockOs.homedir.mockReturnValue('/home/user');
      mockPath.join.mockReturnValue('/home/user/.gogitlocalstats');

      const result = fileManager.getDotFilePath();

      expect(mockOs.homedir).toHaveBeenCalled();
      expect(mockPath.join).toHaveBeenCalledWith('/home/user', '.gogitlocalstats');
      expect(result).toBe('/home/user/.gogitlocalstats');
    });
  });

  describe('parseFileLinesToSlice', () => {
    it('should return empty array if file does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);

      const result = fileManager.parseFileLinesToSlice('/nonexistent/file');

      expect(mockFs.existsSync).toHaveBeenCalledWith('/nonexistent/file');
      expect(result).toEqual([]);
    });

    it('should parse file content and filter empty lines', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('line1\n\nline2\nline3\n');

      const result = fileManager.parseFileLinesToSlice('/test/file');

      expect(mockFs.existsSync).toHaveBeenCalledWith('/test/file');
      expect(mockFs.readFileSync).toHaveBeenCalledWith('/test/file', 'utf-8');
      expect(result).toEqual(['line1', 'line2', 'line3']);
    });
  });

  describe('writeRepositoriesToFile', () => {
    it('should write repositories to file', () => {
      const repos = ['/repo1', '/repo2', '/repo3'];
      const filePath = '/test/file';

      fileManager.writeRepositoriesToFile(repos, filePath);

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        filePath,
        '/repo1\n/repo2\n/repo3',
        'utf-8'
      );
    });
  });
});

describe('RepositoryManager', () => {
  let repositoryManager: RepositoryManager;

  beforeEach(() => {
    repositoryManager = new RepositoryManager();
    jest.clearAllMocks();
  });

  describe('containsRepository', () => {
    it('should return true if repository exists in list', () => {
      const repos = ['/repo1', '/repo2', '/repo3'];
      const result = repositoryManager.containsRepository(repos, '/repo2');
      expect(result).toBe(true);
    });

    it('should return false if repository does not exist in list', () => {
      const repos = ['/repo1', '/repo2', '/repo3'];
      const result = repositoryManager.containsRepository(repos, '/repo4');
      expect(result).toBe(false);
    });
  });

  describe('mergeRepositoryLists', () => {
    it('should merge and sort repository lists without duplicates', () => {
      const newRepos = ['/repo1', '/repo3'];
      const existingRepos = ['/repo2', '/repo1'];

      const result = repositoryManager.mergeRepositoryLists(newRepos, existingRepos);

      expect(result).toEqual(['/repo1', '/repo2', '/repo3']);
    });

    it('should handle empty arrays', () => {
      const result = repositoryManager.mergeRepositoryLists([], []);
      expect(result).toEqual([]);
    });
  });

  describe('isIgnoredDirectory', () => {
    it('should return true for ignored directories', () => {
      expect(repositoryManager.isIgnoredDirectory('node_modules')).toBe(true);
      expect(repositoryManager.isIgnoredDirectory('vendor')).toBe(true);
      expect(repositoryManager.isIgnoredDirectory('.git')).toBe(true);
    });

    it('should return false for non-ignored directories', () => {
      expect(repositoryManager.isIgnoredDirectory('src')).toBe(false);
      expect(repositoryManager.isIgnoredDirectory('tests')).toBe(false);
      expect(repositoryManager.isIgnoredDirectory('docs')).toBe(false);
    });
  });
});

describe('GitScanner', () => {
  let gitScanner: GitScanner;
  let mockRepositoryManager: RepositoryManager;

  beforeEach(() => {
    mockRepositoryManager = new RepositoryManager();
    gitScanner = new GitScanner(mockRepositoryManager);
    jest.clearAllMocks();
  });

  describe('scanForGitRepositories', () => {
    it('should throw error if directory does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);

      expect(() => {
        gitScanner.scanForGitRepositories('/nonexistent');
      }).toThrow('Directory does not exist: /nonexistent');
    });

    it('should throw error if path is not a directory', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({
        isDirectory: () => false,
      } as any);

      expect(() => {
        gitScanner.scanForGitRepositories('/file.txt');
      }).toThrow('Path is not a directory: /file.txt');
    });

    it('should scan successfully for valid directory without git repos', () => {
      // Mock the path as valid directory
      mockFs.existsSync.mockImplementation((filePath: any) => {
        const path = filePath.toString();
        if (path === '/valid/path') return true;
        if (path.includes('.git')) return false; // No .git directories
        return false;
      });
      
      mockFs.statSync.mockReturnValue({
        isDirectory: () => true,
      } as any);

      // Mock empty directory
      mockFs.readdirSync.mockReturnValue([]);

      const result = gitScanner.scanForGitRepositories('/valid/path');
      expect(result).toEqual([]);
    });

    it('should detect git repository correctly', () => {
      // For this test, let's just test the basic functionality without complex mocking
      const mockPath = '/test/repo';
      
      // Mock existsSync to return true for directory checks
      mockFs.existsSync.mockReturnValue(true);
      
      // Mock statSync to return directory
      mockFs.statSync.mockReturnValue({
        isDirectory: () => true,
      } as any);

      // Mock readdirSync to return empty array (no subdirectories)
      mockFs.readdirSync.mockReturnValue([]);

      // Since we're mocking existsSync to always return true,
      // and the GitScanner looks for .git directories,
      // it will find the current directory as a git repo
      const result = gitScanner.scanForGitRepositories(mockPath);
      
      // The result should include the path since .git exists (mocked)
      expect(result).toEqual([mockPath]);
    });
  });
});

describe('ScanReporter', () => {
  let scanReporter: ScanReporter;
  let mockFileManager: FileManager;

  beforeEach(() => {
    mockFileManager = new FileManager();
    scanReporter = new ScanReporter(mockFileManager);
    jest.clearAllMocks();
  });

  describe('displayFoundRepositories', () => {
    it('should display message when no repositories found', () => {
      const consoleSpy = jest.spyOn(console, 'log');
      
      scanReporter.displayFoundRepositories([]);
      
      expect(consoleSpy).toHaveBeenCalledWith('\n❌ No Git repositories found in the specified directory.');
    });

    it('should display repositories when found', () => {
      const consoleSpy = jest.spyOn(console, 'log');
      const repos = ['/repo1', '/repo2'];
      
      scanReporter.displayFoundRepositories(repos);
      
      expect(consoleSpy).toHaveBeenCalledWith('\n📊 Found 2 Git repositories:');
      expect(consoleSpy).toHaveBeenCalledWith('  1. 📁 /repo1');
      expect(consoleSpy).toHaveBeenCalledWith('  2. 📁 /repo2');
    });
  });

  describe('showScanSummary', () => {
    it('should display scan summary', () => {
      const consoleSpy = jest.spyOn(console, 'log');
      mockFileManager.getDotFilePath = jest.fn().mockReturnValue('/home/user/.gogitlocalstats');
      
      scanReporter.showScanSummary('/test/path', 5);
      
      expect(consoleSpy).toHaveBeenCalledWith('\n✅ Scan completed for: /test/path');
      expect(consoleSpy).toHaveBeenCalledWith('📈 Total repositories found: 5');
      expect(consoleSpy).toHaveBeenCalledWith('💾 Repositories saved to: /home/user/.gogitlocalstats');
    });
  });
});

describe('ScanContainer', () => {
  let container: ScanContainer;

  beforeEach(() => {
    container = new ScanContainer();
  });

  it('should provide all required dependencies', () => {
    expect(container.getFileManager()).toBeDefined();
    expect(container.getGitScanner()).toBeDefined();
    expect(container.getScanReporter()).toBeDefined();
  });

  it('should return consistent instances', () => {
    const fileManager1 = container.getFileManager();
    const fileManager2 = container.getFileManager();
    expect(fileManager1).toBe(fileManager2);
  });
});
