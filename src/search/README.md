# TODOseq Advanced Search

This module implements advanced search functionality for TODOseq, providing powerful query capabilities that match Obsidian's standard search behavior.

## Features

### 1. Exact Phrase Matching

Surround phrases with quotes to search for exact matches:

```
"star wars"          // Matches tasks containing the exact phrase "star wars"
"project meeting"    // Matches tasks with this exact sequence
```

### 2. OR Logic

Use `OR` to find tasks matching either term:

```
meeting OR work       // Matches tasks containing "meeting" OR "work"
personal OR urgent    // Matches either personal tasks or urgent ones
```

### 3. Parentheses for Grouping

Control priority and grouping with parentheses:

```
meeting (work OR personal)    // Matches "meeting" AND ("work" OR "personal")
(project OR task) -urgent    // Matches non-urgent projects or tasks
```

### 4. Exclusion/Negation

Use `-` to exclude terms:

```
meeting -work         // Matches "meeting" but NOT "work"
project -urgent       // Matches "project" but excludes "urgent"
```

### 5. Multiple Exclusions

Exclude multiple terms:

```
meeting -work -urgent    // Matches "meeting" but neither "work" nor "urgent"
project -(urgent OR blocked)  // Excludes both urgent and blocked projects
```

### 6. AND Logic (Implicit)

Multiple terms without operators are ANDed by default:

```
meeting work          // Equivalent to: meeting AND work
project urgent        // Matches tasks with both "project" AND "urgent"
```

### 7. Complex Combinations

Combine all features for powerful queries:

```
(meeting OR call) project -urgent    // Non-urgent project meetings or calls
work (home OR office) -weekend       // Work tasks at home/office, not weekends
"star wars" (movie OR series) -spoiler  // Star Wars content without spoilers
```

## Implementation Details

### Architecture

```
Search (main)
├── SearchTokenizer (lexical analysis)
├── SearchParser (syntax analysis, AST generation)
└── SearchEvaluator (semantic evaluation)
```

### Token Types

- `word`: Regular search terms
- `phrase`: Quoted exact phrases  
- `or`: OR operator
- `and`: AND operator (implicit)
- `not`: NOT operator (`-`)
- `lparen`: Left parenthesis
- `rparen`: Right parenthesis

### AST Node Types

- `term`: Single word search
- `phrase`: Exact phrase search
- `and`: Boolean AND operation
- `or`: Boolean OR operation
- `not`: Boolean NOT operation

### Operator Precedence

1. Parentheses (highest)
2. NOT operators
3. AND operators (implicit or explicit)
4. OR operators (lowest)

## Error Handling

Invalid search queries display user-friendly error messages:

- Unmatched parentheses
- Unexpected operators
- Invalid syntax

Errors appear in a prominent red banner below the search input.

## Backward Compatibility

Simple word searches work exactly as before:

- `word` → Same behavior as original implementation
- `word1 word2` → AND behavior (same as before)
- Case sensitivity toggle preserved

## Performance

- **Tokenization**: O(n) - single pass through query
- **Parsing**: O(n) - Pratt parser efficiency  
- **Evaluation**: O(m*k) - m=AST nodes, k=fields searched
- **Overall**: O(n + t*m*k) - t=tasks, n=query length

Optimizations:
- Short-circuit boolean evaluation
- Word boundary regex for exact phrase matching
- Memoization of parsed queries

## Testing

Comprehensive test coverage includes:

- Tokenizer edge cases
- Parser precedence and grouping
- Evaluator boolean logic
- Case sensitivity
- Error conditions
- Performance benchmarks

## Future Enhancements

Potential features for future versions:

- Field-specific search: `path:word`, `text:"phrase"`
- Date range search: `scheduled:2023-2024`
- Regular expressions: `/pattern/`
- Fuzzy search: `~approximate`
- Search highlighting in results
- Search history and suggestions