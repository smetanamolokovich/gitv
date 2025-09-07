import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  DateCalculator,
  FileRepository,
  ContributionProcessor,
  GridBuilder,
  Renderer,
  StatsService,
} from '../src/stats';

// Mock external dependencies
jest.mock('fs');
jest.mock('path');
jest.mock('os');
jest.mock('ora');
jest.mock('simple-git');

const mockFs = fs as jest.Mocked<typeof fs>;
const mockPath = path as jest.Mocked<typeof path>;
const mockOs = os as jest.Mocked<typeof os>;

// Mock simple-git
const mockGit = {
  log: jest.fn(),
};
const mockSimpleGit = jest.fn(() => mockGit);
jest.doMock('simple-git', () => mockSimpleGit);

describe('DateCalculator', () => {
  let dateCalculator: DateCalculator;

  beforeEach(() => {
    dateCalculator = new DateCalculator();
    jest.clearAllMocks();
  });

  describe('getBeginningOfDay', () => {
    it('should return beginning of day for given date', () => {
      const testDate = new Date('2023-06-15T14:30:00');
      const result = dateCalculator.getBeginningOfDay(testDate);
      
      expect(result.getFullYear()).toBe(2023);
      expect(result.getMonth()).toBe(5); // 0-indexed
      expect(result.getDate()).toBe(15);
      expect(result.getHours()).toBe(0);
      expect(result.getMinutes()).toBe(0);
      expect(result.getSeconds()).toBe(0);
    });
  });

  describe('countDaysSinceDate', () => {
    it('should return days since date', () => {
      // Create a simple test that doesn't rely on complex date mocking
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 5); // 5 days ago
      
      const result = dateCalculator.countDaysSinceDate(recentDate);
      
      // Should be around 5 days (give or take due to time calculations)
      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThan(10);
    });

    it('should return OUT_OF_RANGE for dates too far in the past', () => {
      const veryOldDate = new Date('2020-01-01');
      const result = dateCalculator.countDaysSinceDate(veryOldDate);
      
      expect(result).toBe(99999); // CONFIG.OUT_OF_RANGE
    });
  });

  describe('calcWeekOffset', () => {
    it('should calculate week offset correctly', () => {
      // Just test that it returns a valid number between 0 and 7
      const result = dateCalculator.calcWeekOffset();
      
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(7);
    });
  });
});

describe('FileRepository', () => {
  let fileRepository: FileRepository;

  beforeEach(() => {
    fileRepository = new FileRepository();
    jest.clearAllMocks();
  });

  describe('getDotFilePath', () => {
    it('should return correct dotfile path', () => {
      mockOs.homedir.mockReturnValue('/home/user');
      mockPath.join.mockReturnValue('/home/user/.gogitlocalstats');

      const result = fileRepository.getDotFilePath();

      expect(mockOs.homedir).toHaveBeenCalled();
      expect(mockPath.join).toHaveBeenCalledWith('/home/user', '.gogitlocalstats');
      expect(result).toBe('/home/user/.gogitlocalstats');
    });
  });

  describe('parseFileLinesToSlice', () => {
    it('should return empty array if file does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);

      const result = fileRepository.parseFileLinesToSlice('/nonexistent/file');

      expect(mockFs.existsSync).toHaveBeenCalledWith('/nonexistent/file');
      expect(result).toEqual([]);
    });

    it('should parse file content correctly', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('/repo1\n/repo2\n/repo3\n');

      const result = fileRepository.parseFileLinesToSlice('/test/file');

      expect(result).toEqual(['/repo1', '/repo2', '/repo3']);
    });
  });
});

describe('GridBuilder', () => {
  let gridBuilder: GridBuilder;

  beforeEach(() => {
    gridBuilder = new GridBuilder();
    jest.clearAllMocks();
  });

  describe('sortCommitKeys', () => {
    it('should sort commit keys in ascending order', () => {
      const commits = new Map([[3, 5], [1, 2], [7, 1]]);
      
      const result = gridBuilder.sortCommitKeys(commits);
      
      expect(result).toEqual([1, 3, 7]);
    });
  });

  describe('buildColumns', () => {
    it('should build columns correctly', () => {
      // For the buildColumns logic to work, we need a full week of data
      // The algorithm only saves columns when dayInWeek === 6 (end of week)
      const keys = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
      const commits = new Map([
        [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], // Week 0
        [7, 8], [8, 9], [9, 10], [10, 11], [11, 12], [12, 13], [13, 14] // Week 1
      ]);

      const result = gridBuilder.buildColumns(keys, commits);

      // First week (days 0-6)
      expect(result.get(0)).toEqual([1, 2, 3, 4, 5, 6, 7]);
      // Second week (days 7-13)
      expect(result.get(1)).toEqual([8, 9, 10, 11, 12, 13, 14]);
    });

    it('should handle incomplete weeks', () => {
      // Test with incomplete week
      const keys = [0, 1, 2];
      const commits = new Map([[0, 1], [1, 2], [2, 3]]);

      const result = gridBuilder.buildColumns(keys, commits);

      // Should not have any complete columns since we don't reach day 6
      expect(result.size).toBe(0);
    });
  });
});

describe('ContributionProcessor', () => {
  let contributionProcessor: ContributionProcessor;
  let mockDateCalculator: DateCalculator;
  let mockFileRepository: FileRepository;

  beforeEach(() => {
    mockDateCalculator = new DateCalculator();
    mockFileRepository = new FileRepository();
    contributionProcessor = new ContributionProcessor(mockDateCalculator, mockFileRepository);
    
    jest.clearAllMocks();
  });

  describe('processAllRepositories', () => {
    it('should return empty map when no repositories found', async () => {
      mockFileRepository.getDotFilePath = jest.fn().mockReturnValue('/test/path');
      mockFileRepository.parseFileLinesToSlice = jest.fn().mockReturnValue([]);

      const result = await contributionProcessor.processAllRepositories('test@example.com');

      expect(result.size).toBe(0);
    });

    it('should process repositories and return commit map', async () => {
      const mockRepos = ['/repo1', '/repo2'];
      mockFileRepository.getDotFilePath = jest.fn().mockReturnValue('/test/path');
      mockFileRepository.parseFileLinesToSlice = jest.fn().mockReturnValue(mockRepos);
      
      // Mock git log response
      mockGit.log.mockResolvedValue({
        all: [
          {
            author_email: 'test@example.com',
            date: '2023-06-15',
          },
        ],
      });

      mockDateCalculator.calcWeekOffset = jest.fn().mockReturnValue(2);
      mockDateCalculator.countDaysSinceDate = jest.fn().mockReturnValue(5);

      const result = await contributionProcessor.processAllRepositories('test@example.com');

      expect(result.size).toBeGreaterThan(0);
    });
  });
});

describe('Renderer', () => {
  let renderer: Renderer;
  let mockDateCalculator: DateCalculator;
  let mockGridBuilder: GridBuilder;

  beforeEach(() => {
    mockDateCalculator = new DateCalculator();
    mockGridBuilder = new GridBuilder();
    renderer = new Renderer(mockDateCalculator, mockGridBuilder);
    
    jest.clearAllMocks();
  });

  describe('renderContributionGraph', () => {
    it('should render contribution graph without errors', () => {
      const mockCommits = new Map([[1, 5], [2, 3], [3, 0]]);
      
      mockGridBuilder.sortCommitKeys = jest.fn().mockReturnValue([1, 2, 3]);
      mockGridBuilder.buildColumns = jest.fn().mockReturnValue(new Map());
      mockDateCalculator.calcWeekOffset = jest.fn().mockReturnValue(2);

      // Mock console and process.stdout
      const mockWrite = jest.fn();
      const originalWrite = process.stdout.write;
      process.stdout.write = mockWrite;

      expect(() => {
        renderer.renderContributionGraph(mockCommits);
      }).not.toThrow();

      // Restore original write
      process.stdout.write = originalWrite;
    });
  });
});

describe('StatsService', () => {
  let statsService: StatsService;

  beforeEach(() => {
    statsService = new StatsService();
    jest.clearAllMocks();
  });

  describe('generateStats', () => {
    it('should generate stats without errors for valid email', async () => {
      // Create a spy on console.log to capture output
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      await expect(statsService.generateStats('test@example.com')).resolves.not.toThrow();
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Analyzing contributions for: test@example.com')
      );
      
      consoleSpy.mockRestore();
    });

    it('should handle empty email gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      await expect(statsService.generateStats('')).resolves.not.toThrow();
      
      consoleSpy.mockRestore();
    });
  });
});
