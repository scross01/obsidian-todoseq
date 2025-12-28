import { SearchNode } from './search-types';
import { Task } from '../task';

export class SearchEvaluator {
  
  static evaluate(node: SearchNode, task: Task, caseSensitive: boolean): boolean {
    switch (node.type) {
      case 'term':
        return this.evaluateTerm(node.value!, task, caseSensitive);
      case 'phrase':
        return this.evaluatePhrase(node.value!, task, caseSensitive);
      case 'prefix_filter':
        return this.evaluatePrefixFilter(node, task, caseSensitive);
      case 'and':
        return this.evaluateAnd(node.children!, task, caseSensitive);
      case 'or':
        return this.evaluateOr(node.children!, task, caseSensitive);
      case 'not':
        return this.evaluateNot(node.children![0], task, caseSensitive);
      default:
        return false;
    }
  }

  private static evaluateTerm(term: string, task: Task, caseSensitive: boolean): boolean {
    const searchText = caseSensitive ? term : term.toLowerCase();
    const fields = this.getSearchableFields(task);

    return fields.some(fieldValue => {
      const target = caseSensitive ? fieldValue : fieldValue.toLowerCase();
      return target.includes(searchText);
    });
  }

  private static evaluatePhrase(phrase: string, task: Task, caseSensitive: boolean): boolean {
    // Escape regex special characters in the phrase
    const escapedPhrase = this.escapeRegex(phrase);
    const regexFlags = caseSensitive ? 'g' : 'gi';
    
    // Use word boundaries to ensure exact phrase matching
    const phraseRegex = new RegExp(`\\b${escapedPhrase}\\b`, regexFlags);

    const fields = this.getSearchableFields(task);

    return fields.some(fieldValue => {
      return phraseRegex.test(fieldValue);
    });
  }

  private static evaluateAnd(nodes: SearchNode[], task: Task, caseSensitive: boolean): boolean {
    // Short-circuit: return false on first false
    for (const node of nodes) {
      if (!this.evaluate(node, task, caseSensitive)) {
        return false;
      }
    }
    return true;
  }

  private static evaluateOr(nodes: SearchNode[], task: Task, caseSensitive: boolean): boolean {
    // Short-circuit: return true on first true
    for (const node of nodes) {
      if (this.evaluate(node, task, caseSensitive)) {
        return true;
      }
    }
    return false;
  }

  private static evaluateNot(node: SearchNode, task: Task, caseSensitive: boolean): boolean {
    return !this.evaluate(node, task, caseSensitive);
  }

  private static evaluatePrefixFilter(node: SearchNode, task: Task, caseSensitive: boolean): boolean {
    const field = node.field;
    const value = node.value;
    
    if (!field || !value) {
      return false;
    }

    switch (field) {
      case 'path':
        return this.evaluatePathFilter(value, task, caseSensitive);
      case 'file':
        return this.evaluateFileFilter(value, task, caseSensitive);
      case 'tag':
        return this.evaluateTagFilter(value, task, caseSensitive);
      case 'state':
        return this.evaluateStateFilter(value, task, caseSensitive);
      case 'priority':
        return this.evaluatePriorityFilter(value, task, caseSensitive);
      case 'content':
        return this.evaluateContentFilter(value, task, caseSensitive);
      default:
        return false;
    }
  }

  private static evaluatePathFilter(value: string, task: Task, caseSensitive: boolean): boolean {
    if (!task.path) return false;
    
    const searchText = caseSensitive ? value : value.toLowerCase();
    const targetPath = caseSensitive ? task.path : task.path.toLowerCase();
    
    // Check if the path starts with the search value followed by a slash
    // This matches both immediate parent and subfolders
    const expectedPrefix = searchText + '/';
    
    // Handle root-level case (e.g., "examples/File.md" where search is "examples")
    if (targetPath === searchText || targetPath.startsWith(expectedPrefix)) {
      return true;
    }
    
    // Also check if any parent directory in the path matches (for nested cases)
    const pathParts = targetPath.split('/');
    for (let i = 0; i < pathParts.length - 1; i++) { // Don't check the filename
      if (pathParts[i] === searchText) {
        return true;
      }
    }
    
    return false;
  }

  private static evaluateFileFilter(value: string, task: Task, caseSensitive: boolean): boolean {
    if (!task.path) return false;
    
    // Extract just the filename
    const lastSlash = task.path.lastIndexOf('/');
    const filename = lastSlash >= 0 ? task.path.slice(lastSlash + 1) : task.path;
    
    const searchText = caseSensitive ? value : value.toLowerCase();
    const targetFilename = caseSensitive ? filename : filename.toLowerCase();
    
    return targetFilename.includes(searchText);
  }

  private static evaluateTagFilter(value: string, task: Task, caseSensitive: boolean): boolean {
    if (!task.rawText) return false;
    
    const searchText = caseSensitive ? value : value.toLowerCase();
    const targetText = caseSensitive ? task.rawText : task.rawText.toLowerCase();
    
    // Look for tag patterns (#tag)
    const tagRegex = /#([\w\-]+)/g;
    const matches = targetText.match(tagRegex) || [];
    
    return matches.some(tag => {
      const tagContent = caseSensitive ? tag : tag.toLowerCase();
      return tagContent.includes(searchText);
    });
  }

  private static evaluateStateFilter(value: string, task: Task, caseSensitive: boolean): boolean {
    const searchText = caseSensitive ? value : value.toLowerCase();
    const taskState = caseSensitive ? task.state : task.state.toLowerCase();
    
    return taskState === searchText;
  }

  private static evaluatePriorityFilter(value: string, task: Task, caseSensitive: boolean): boolean {
    // Normalize the search value
    let normalizedSearch = value.toLowerCase();
    
    // Map priority keywords to standard values
    if (normalizedSearch === 'high' || normalizedSearch === 'a') {
      normalizedSearch = 'high';
    } else if (normalizedSearch === 'medium' || normalizedSearch === 'b') {
      normalizedSearch = 'med';
    } else if (normalizedSearch === 'low' || normalizedSearch === 'c') {
      normalizedSearch = 'low';
    } else if (normalizedSearch === 'none') {
      // Handle 'none' case separately
      return !task.priority;
    }

    const taskPriority = task.priority ? task.priority.toLowerCase() : null;
    return taskPriority === normalizedSearch;
  }

  private static evaluateContentFilter(value: string, task: Task, caseSensitive: boolean): boolean {
    if (!task.text) return false;
    
    const searchText = caseSensitive ? value : value.toLowerCase();
    const targetText = caseSensitive ? task.text : task.text.toLowerCase();
    
    return targetText.includes(searchText);
  }

  private static getSearchableFields(task: Task): string[] {
    const fields: string[] = [];
    
    if (task.rawText) fields.push(task.rawText);
    if (task.text) fields.push(task.text);
    if (task.path) {
      fields.push(task.path);
      // Also add just the filename
      const lastSlash = task.path.lastIndexOf('/');
      const filename = lastSlash >= 0 ? task.path.slice(lastSlash + 1) : task.path;
      fields.push(filename);
    }
    
    return fields;
  }

  private static escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}