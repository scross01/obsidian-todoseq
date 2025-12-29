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

### 6. Date Filters

Filter tasks by scheduled or deadline dates:

```
// Exact dates
scheduled:2024-01-31      // Tasks scheduled on January 31, 2024
scheduled:2024-01         // Tasks scheduled in January 2024
scheduled:2024            // Tasks scheduled in 2024
deadline:2024-01-31       // Tasks with deadline on January 31, 2024

// Relative date expressions
scheduled:overdue         // Tasks with scheduled dates in the past
deadline:due              // Tasks due today
deadline:today            // Tasks due today
deadline:tomorrow         // Tasks due tomorrow
scheduled:"this week"      // Tasks scheduled this week
scheduled:"next week"      // Tasks scheduled next week
deadline:"this month"      // Tasks due this month
deadline:"next month"      // Tasks due next month
scheduled:"next 7 days"    // Tasks scheduled in the next 7 days

// Natural language date expressions
scheduled:"next Monday"     // Tasks scheduled next Monday
deadline:"end of month"    // Tasks due at end of current month

// Date ranges
scheduled:2024-01-01..2024-01-31  // Tasks scheduled in January 2024
deadline:2024-06-01..2024-06-30   // Tasks due in June 2024

// Special cases
scheduled:none            // Tasks without scheduled dates
deadline:none             // Tasks without deadlines
```

### 7. Combining Date Filters with Other Filters

```
// Find urgent tasks due today
priority:high deadline:today

// Find tasks scheduled this week that are not completed
scheduled:"this week" -state:DONE

// Find tasks with deadlines this month or scheduled for next week
(deadline:"this month" OR scheduled:"next week")

// Find important tasks without deadlines
priority:high deadline:none
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

## Prefix Filters (IMPLEMENTED)

TODOseq now supports Obsidian-style prefix filters for targeted field-specific searching:

### Available Prefix Filters

- **Path filter**: `path:Journal` - Filter tasks by file path
- **File filter**: `file:meeting` - Filter tasks by filename
- **Tag filter**: `tag:#urgent` - Filter tasks by tags
- **State filter**: `state:DOING` - Filter tasks by state
- **Priority filter**: `priority:high` or `priority:A` - Filter tasks by priority
- **Content filter**: `content:"project action"` - Filter tasks by content

### Token Types (Extended)

- `prefix`: Prefix keywords (path:, file:, tag:, state:, priority:, content:)
- `prefix_value`: Values associated with prefix filters

### AST Node Types (Extended)

- `prefix_filter`: Prefix-based filtering operations

### Prefix Filter Examples

```
path:Journal/                    // Tasks in Journal folder
file:meeting                     // Tasks in files containing "meeting"
tag:#urgent                      // Tasks with #urgent tag
state:DOING                      // Tasks in DOING state
priority:high                    // High priority tasks
priority:A                       // Same as priority:high
content:"project action"         // Tasks containing exact phrase
```

### Combined Prefix Filters

```
path:Journal/ tag:#urgent        // Implicit AND: urgent tasks in Journal
state:TODO OR state:DOING       // OR logic with prefix filters
priority:high -state:DOING      // High priority excluding DOING state
file:meeting content:project    // Project tasks in meeting files
```

### Implementation Details

- **Context-aware tokenization**: Words following prefix tokens are automatically treated as prefix values
- **Implicit AND**: Consecutive prefix filters are combined with AND logic
- **Full boolean support**: Prefix filters work with OR, AND, NOT operators
- **Case sensitivity**: Respects global case sensitivity setting
- **Quoted values**: Supports multi-word values with quotes (e.g., `path:"Folder Name"`)

## Future Enhancements

Potential features for future versions:

- Date range search: `scheduled:2023-2024`
- Regular expressions: `/pattern/`
- Fuzzy search: `~approximate`
- Search highlighting in results
- Search history and suggestions
- Autocomplete dropdown for prefix values