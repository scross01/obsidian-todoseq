import { Vault } from 'obsidian';
import { Task } from '../task';

/**
 * Utility class for collecting and filtering search suggestions
 * Provides data for the prefix filter autocomplete dropdown
 */
export class SearchSuggestions {
    
    /** Cache for vault data to improve performance */
    private static pathCache: string[] | null = null;
    private static fileCache: string[] | null = null;
    private static lastCacheTime: number = 0;
    private static CACHE_TTL = 600; // 10 seconds
    
    /**
     * Get all unique paths from tasks
     * @param tasks Array of tasks to analyze
     * @returns Array of unique paths, sorted alphabetically
     */
    static getAllPathsFromTasks(tasks: Task[]): string[] {
        const pathsSet = new Set<string>();
         
        tasks.forEach(task => {
            const path = task.path;
            // Extract parent directories
            const parts = path.split('/');
            if (parts.length > 1) {
                // Add full path segments (without trailing slashes for display)
                for (let i = 1; i < parts.length; i++) {
                    const segment = parts.slice(0, i).join('/');
                    pathsSet.add(segment);
                }
            }
        });
         
        // Convert to array and sort alphabetically
        const paths = Array.from(pathsSet);
        paths.sort((a, b) => a.localeCompare(b));
        return paths;
    }
     
    /**
     * Get all unique paths in the vault (fallback method)
     * @param vault Obsidian vault instance
     * @returns Array of unique paths, sorted alphabetically
     */
    static async getAllPaths(vault: Vault): Promise<string[]> {
        // Return cached data if still valid
        if (this.pathCache && Date.now() - this.lastCacheTime < this.CACHE_TTL) {
            return this.pathCache;
        }
         
        const paths: string[] = [];
        const files = vault.getMarkdownFiles();
         
        files.forEach(file => {
            const path = file.path;
            // Extract parent directories
            const parts = path.split('/');
            if (parts.length > 1) {
                // Add full path segments (without trailing slashes for display)
                for (let i = 1; i < parts.length; i++) {
                    const segment = parts.slice(0, i).join('/');
                    if (!paths.includes(segment)) {
                        paths.push(segment);
                    }
                }
            }
        });
         
        // Sort alphabetically
        paths.sort((a, b) => a.localeCompare(b));
        this.pathCache = paths;
        this.lastCacheTime = Date.now();
         
        return paths;
    }
    
    /**
     * Get all unique filenames from tasks
     * @param tasks Array of tasks to analyze
     * @returns Array of unique filenames, sorted alphabetically
     */
    static getAllFilesFromTasks(tasks: Task[]): string[] {
        const filesSet = new Set<string>();
         
        tasks.forEach(task => {
            // Extract filename from path
            const parts = task.path.split('/');
            const filename = parts[parts.length - 1];
            filesSet.add(filename);
        });
         
        // Convert to array and sort alphabetically
        const files = Array.from(filesSet);
        files.sort((a, b) => a.localeCompare(b));
        return files;
    }
     
    /**
     * Get all unique filenames in the vault (fallback method)
     * @param vault Obsidian vault instance
     * @returns Array of unique filenames, sorted alphabetically
     */
    static async getAllFiles(vault: Vault): Promise<string[]> {
        // Return cached data if still valid
        if (this.fileCache && Date.now() - this.lastCacheTime < this.CACHE_TTL) {
            return this.fileCache;
        }
         
        const files: string[] = [];
        const markdownFiles = vault.getMarkdownFiles();
         
        markdownFiles.forEach(file => {
            const filename = file.name;
            if (!files.includes(filename)) {
                files.push(filename);
            }
        });
         
        // Sort alphabetically
        files.sort((a, b) => a.localeCompare(b));
        this.fileCache = files;
        this.lastCacheTime = Date.now();
         
        return files;
    }
    
    /**
     * Extract all unique tags from tasks
     * @param tasks Array of tasks to analyze
     * @returns Array of unique tags, sorted alphabetically
     */
    static getAllTags(tasks: Task[]): string[] {
        const tagsSet = new Set<string>();
        // Comprehensive tag regex that matches #tag, #multi-word-tag, etc.
        // Must come after URLs to avoid conflicts with URLs containing #
        const tagRegex = /#([^\s\)\]\}\>]+)/g;
         
        tasks.forEach(task => {
            if (task.rawText) {
                let matches;
                while ((matches = tagRegex.exec(task.rawText)) !== null) {
                    const tag = matches[1]; // Get the captured group
                    tagsSet.add(tag);
                }
            }
        });
         
        // Convert to array and sort alphabetically
        const tags = Array.from(tagsSet);
        tags.sort((a, b) => a.localeCompare(b));
        return tags;
    }
    
    /**
     * Get all configured task states
     * @returns Array of task states, sorted alphabetically
     */
    static getAllStates(): string[] {
        // Default states plus any additional configured states
        const defaultStates = ['TODO', 'DOING', 'DONE', 'NOW', 'LATER', 'WAIT', 'WAITING', 'IN-PROGRESS', 'CANCELED', 'CANCELLED'];
        
        // In a real implementation, we would get additional states from plugin settings
        // For now, return defaults
        return defaultStates.sort((a, b) => a.localeCompare(b));
    }
    
    /**
     * Get priority options
     * @returns Array of priority options
     */
    static getPriorityOptions(): string[] {
        return ['A', 'B', 'C', 'high', 'medium', 'low', 'none'];
    }
    
    /**
     * Filter suggestions based on user input
     * @param query User input text
     * @param suggestions Array of suggestions to filter
     * @returns Filtered suggestions
     */
    static filterSuggestions(query: string, suggestions: string[]): string[] {
        if (!query) return suggestions;
        
        const searchText = query.toLowerCase();
        return suggestions.filter(suggestion => 
            suggestion.toLowerCase().includes(searchText)
        );
    }
    
    /**
     * Clear cached data (useful when vault changes)
     */
    static clearCache(): void {
        this.pathCache = null;
        this.fileCache = null;
        this.lastCacheTime = 0;
    }
}