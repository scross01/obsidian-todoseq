import { App, TFile } from 'obsidian';

export class PropertySearchEngine {
  private static instance: PropertySearchEngine;
  private propertyCache = new Map<string, Map<unknown, Set<string>>>();
  private propertyKeys = new Set<string>();
  private isInitialized = false;
  private startupScanEnabled = true;
  private pendingUpdates = new Set<string>();
  private isUpdating = false;
  
  private constructor(private app: App) {}
  
  public static getInstance(app: App): PropertySearchEngine {
    if (!PropertySearchEngine.instance) {
      PropertySearchEngine.instance = new PropertySearchEngine(app);
    }
    return PropertySearchEngine.instance;
  }
  
  // Initialize on first use
  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    // Get all property keys by scanning all markdown files
    await this.scanAllPropertyKeys();
    
    // Build cache for each property key
    this.propertyKeys.forEach((key) => {
      this.buildPropertyCache(key);
    });
    
    this.isInitialized = true;
  }
  
  // Scan all markdown files to get property keys
  private async scanAllPropertyKeys(): Promise<void> {
    const files = this.app.vault.getMarkdownFiles();
    
    for (const file of files) {
      const cache = this.app.metadataCache.getFileCache(file);
      if (cache?.frontmatter) {
        Object.keys(cache.frontmatter).forEach(key => {
          this.propertyKeys.add(key);
        });
      }
    }
  }
  
  // Build cache for a specific property key
  private buildPropertyCache(key: string): void {
    const cache = new Map<unknown, Set<string>>();
    
    // Get all markdown files
    const files = this.app.vault.getMarkdownFiles();
    
    // Build index: value -> set of file paths
    for (const file of files) {
      const fileCache = this.app.metadataCache.getFileCache(file);
      if (fileCache?.frontmatter && key in fileCache.frontmatter) {
        const value = fileCache.frontmatter[key];
        
        if (Array.isArray(value)) {
          // For arrays, add each element as a separate key in the cache
          value.forEach(item => {
            if (!cache.has(item)) {
              cache.set(item, new Set());
            }
            cache.get(item)!.add(file.path);
          });
        } else {
          // For non-array values, add directly to cache
          if (!cache.has(value)) {
            cache.set(value, new Set());
          }
          cache.get(value)!.add(file.path);
        }
      }
    }
    
    this.propertyCache.set(key, cache);
  }
  
  // Search for files matching property query
  async searchProperties(query: string): Promise<Set<string>> {
    await this.initialize();
    
    // Parse query: [key:value] or [key]
    let key: string;
    let value: string | null;
    
    if (query.startsWith('[') && query.endsWith(']')) {
      const content = query.slice(1, -1);
      const colonIndex = content.indexOf(':');
      
      if (colonIndex !== -1) {
        key = content.slice(0, colonIndex);
        value = content.slice(colonIndex + 1);
      } else {
        key = content;
        value = null;
      }
    } else {
      return new Set();
    }
    
    const cache = this.propertyCache.get(key);
    if (!cache) return new Set();
    
    if (value === null) {
      // Key-only search: return all files with this property
      const files = new Set<string>();
      Array.from(cache.values()).forEach(fileSet => {
        Array.from(fileSet).forEach(filePath => {
          files.add(filePath);
        });
      });
      return files;
    }
    
    // Value search: return files with this value
    return cache.get(value) || new Set();
  }
  
  // Get all files with a specific property key (any value)
  getFilesWithPropertyKey(key: string): Set<string> {
    const valueMap = this.propertyCache.get(key);
    const files = new Set<string>();
    if (valueMap) {
      Array.from(valueMap.values()).forEach(fileSet => {
        Array.from(fileSet).forEach(filePath => {
          files.add(filePath);
        });
      });
    }
    return files;
  }
  
  // Get all files with a specific property key and value
  getFilesWithProperty(key: string, value: unknown): Set<string> {
    const valueMap = this.propertyCache.get(key);
    return valueMap?.get(value) || new Set();
  }
  
  // Get all property keys that have been indexed
  getPropertyKeys(): Set<string> {
    return this.propertyKeys;
  }
  
  // Check if a property key exists in the index
  hasPropertyKey(key: string): boolean {
    return this.propertyKeys.has(key);
  }
  
  // Check if the engine is initialized
  isReady(): boolean {
    return this.isInitialized;
  }
  
  // Invalidate cache for a file
  invalidateFile(file: TFile): void {
    this.pendingUpdates.add(file.path);
    
    // Debounce updates
    if (!this.isUpdating) {
      this.isUpdating = true;
      setTimeout(() => this.processPendingUpdates(), 100);
    }
  }
  
  // Handle file change event
  onFileChanged(file: TFile): void {
    this.invalidateFile(file);
  }
  
  // Handle file deleted event
  onFileDeleted(file: TFile): void {
    this.invalidateFile(file);
  }
  
  // Handle file renamed event
  onFileRenamed(file: TFile, oldPath: string): void {
    this.pendingUpdates.add(oldPath);
    this.pendingUpdates.add(file.path);
    
    // Debounce updates
    if (!this.isUpdating) {
      this.isUpdating = true;
      setTimeout(() => this.processPendingUpdates(), 100);
    }
  }
  
  private processPendingUpdates(): void {
    if (this.pendingUpdates.size === 0) {
      this.isUpdating = false;
      return;
    }
    
    // Clear all caches and rebuild
    this.rebuildAll();
    
    this.pendingUpdates.clear();
    this.isUpdating = false;
  }
  
  // Force rebuild of all caches
  rebuildAll(): void {
    this.propertyCache.clear();
    this.propertyKeys.clear();
    this.isInitialized = false;
    
    // Reinitialize if startup scan is enabled
    if (this.startupScanEnabled) {
      this.initialize().catch(console.error);
    }
  }
  
  // Enable or disable startup scan
  setStartupScanEnabled(enabled: boolean): void {
    this.startupScanEnabled = enabled;
    
    if (enabled && !this.isInitialized) {
      this.initialize().catch(console.error);
    }
  }
  
  // Get startup scan status
  isStartupScanEnabled(): boolean {
    return this.startupScanEnabled;
  }
  
  // Get the number of property keys indexed
  getPropertyCount(): number {
    return this.propertyKeys.size;
  }
  
  // Get the number of files with a specific property
  getFileCountForProperty(key: string): number {
    const valueMap = this.propertyCache.get(key);
    if (!valueMap) return 0;
    
    let count = 0;
    Array.from(valueMap.values()).forEach(fileSet => {
      count += fileSet.size;
    });
    return count;
  }
  
  // Clear all caches and reset
  reset(): void {
    this.propertyCache.clear();
    this.propertyKeys.clear();
    this.isInitialized = false;
    this.pendingUpdates.clear();
    this.isUpdating = false;
  }

  /**
   * Initialize startup scan based on settings
   * @param settings TodoTracker settings containing startup scan configuration
   */
  async initializeStartupScan(settings?: any): Promise<void> {
    if (!settings) return;

    // Check if startup scan is enabled
    const runStartupScan = settings.runStartupScan || false;
    const startupScanDelay = settings.startupScanDelay || 3000;
    const showStartupScanProgress = settings.showStartupScanProgress || false;

    if (runStartupScan) {
      // Set startup scan enabled
      this.setStartupScanEnabled(true);

      // Delay the startup scan to allow the plugin to fully load
      setTimeout(async () => {
        try {
          await this.initialize();
        } catch (error) {
          console.error('TODOseq: Failed to initialize property search index:', error);
        }
      }, startupScanDelay);
    }
  }

  /**
   * Destroy the property search engine and clean up resources
   */
  destroy(): void {
    this.reset();
    // Clear any pending timeouts
    // Note: In a real implementation, you'd want to track and clear any pending timeouts
  }
}