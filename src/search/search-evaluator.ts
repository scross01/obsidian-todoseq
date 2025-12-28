import { SearchNode } from './search-types';
import { Task } from '../task';

export class SearchEvaluator {
  
  static evaluate(node: SearchNode, task: Task, caseSensitive: boolean): boolean {
    switch (node.type) {
      case 'term':
        return this.evaluateTerm(node.value!, task, caseSensitive);
      case 'phrase':
        return this.evaluatePhrase(node.value!, task, caseSensitive);
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