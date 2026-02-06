
# Property Search Examples

This page contains embedded task list code blocks that demonstrate various property search scenarios. Use these examples to test and validate the property search feature.
## Basic Property Matching

### String Properties

Find tasks on pages with property `type: Test Page`:
```todoseq
search: [type:Test Page]
```

Find tasks on pages with `type: Project`
```todoseq
search: [type:Project]
```

### Array Properties

Find tasks on pages with "urgent" in tags:
```todoseq
search: [tags:urgent]
```

Find tasks on pages with "feature" in tags:
```todoseq
search: [tags:feature]
```

### Numeric Properties

Find tasks on pages with size exactly 100:
```todoseq
search: [size:100]
```

Find tasks on pages with size
```todoseq
search: [size]
```

Find tasks on pages with size >=99:
```todoseq
search: [size:>=99]
```

### Boolean Properties

Find tasks on pages that are not archived:
```todoseq
search: [archived:false]
```

### Date Properties

Find tasks on pages with target date 2026-03-31:
```todoseq
search: [target:2026-03-31]
```

Find tasks on pages with partial target date 2026-03:
```todoseq
search: [target:2026-03]
```

## Negation

Find tasks on with page by not "Test Page":
```todoseq
search: [type] -[type:Test Page]
```

Find tasks on pages that do NOT have "urgent" in tags:
```todoseq
search: [tags] -[tags:urgent]
```

Find tasks on pages that do NOT have status "Active":
```todoseq
search: [status] -[status:Active]
```

## OR Operator

Find tasks on pages with status "Draft" OR "Active":
```todoseq
search: [status:Draft OR Active]
```

Find tasks on pages with tags "urgent" OR "feature":
```todoseq
search: [tags:urgent OR feature]
```

## Different Property Types

### String Properties

Find tasks on pages with status "Active":
```todoseq
search: [status:Active]
```

Find tasks on pages with status "Draft":
```todoseq
search: [status:Draft]
```

### Numeric Properties

Find tasks on pages with size greater than 99:
```todoseq
search: [size:>99]
```

Find tasks on pages with size less than 101:
```todoseq
search: [size:<101]
```

Find tasks on pages with priority 1:
```todoseq
search: [priority:1]
```

### Boolean Properties

Find tasks on pages that are not archived (false):
```todoseq
search: [archived:false]
```

### Array Properties

Find tasks on pages with "urgent" in tags:
```todoseq
search: [category:test]
```

## Null/Empty Values

Find tasks on pages with empty status:
```todoseq
search: [status:]
```

Find tasks on pages with empty status (explicit empty string):
```todoseq
search: [status:""]
```

Find tasks on pages with null status (property doesn't exist or is null):
```todoseq
search: [status:""]
```

## Case Sensitivity Variations

Find tasks on pages with type "Test Page" (case sensitive):
```todoseq
search: [type:Test Page]
```

Find tasks on pages with type "test page" (lowercase):
```todoseq
search: [type:test page]
```

Find tasks on pages with type "TEST PAGE" (uppercase):
```todoseq
search: [type:TEST PAGE]
```

## Partial vs Exact Matching

Find tasks on pages with type containing "Test" (partial matching):
```todoseq
search: [type:Test]
```

Find tasks on pages with type exactly "Test Page" (exact matching):
```todoseq
search: [type:"Test Page"]
```

Find tasks on pages with status containing "Active" (partial matching):
```todoseq
search: [status:Active]
```

## Comparison Operators

### Greater Than

Find tasks on pages with size greater than 50:
```todoseq
search: [size:>50]
```

Find tasks on pages with size greater than 99:
```todoseq
search: [size:>99]
```

Find tasks on pages with target date after 2026-01-01:
```todoseq
search: [target:>2026-01-01]
```

### Less Than

Find tasks on pages with size less than 150:
```todoseq
search: [size:<150]
```

Find tasks on pages with size less than 101:
```todoseq
search: [size:<101]
```

Find tasks on pages with target date before 2026-12-31:
```todoseq
search: [target:<2026-12-31]
```

### Greater Than or Equal

Find tasks on pages with size greater than or equal to 100:
```todoseq
search: [size:>=100]
```

### Less Than or Equal

Find tasks on pages with size less than or equal to 100:
```todoseq
search: [size:<=100]
```

## Combined Filters

### AND Operations

Find tasks on pages with type "Test Page" AND status "Active":
```todoseq
search: [type:Test Page] AND [status:Active]
```

Find tasks on pages with type "Test Page" AND status "Draft":
```todoseq
search: [type:Test Page] AND [status:Draft]
```

Find tasks on pages with type "Test Page" AND size greater than 50:
```todoseq
search: [type:Test Page] AND [size:>50]
```

### Negation with AND

Find tasks on pages with type "Test Page" AND NOT status "Active":
```todoseq
search: [type:Test Page] AND -[status:Active]
```

Find tasks on pages with type "Test Page" AND NOT archived:
```todoseq
search: [type:Test Page] AND -[archived:true]
```

### Complex Combinations

Find tasks on pages with type "Test Page" AND (status "Draft" OR "Active"):
```todoseq
search: [type:Test Page] AND [status:Draft OR Active]
```

Find tasks on pages with type "Test Page" AND size greater than 50 AND NOT archived:
```todoseq
search: [type:Test Page] AND [size:>50] AND -[archived:true]
```

## State and Property Combinations

Find tasks with state "TODO" on pages with type "Test Page":
```todoseq
search: state:TODO [type:Test Page]
```

Find tasks with state "DONE" on pages with status "Active":
```todoseq
search: state:DONE [status:Active]
```

Find tasks with state "TODO" on pages with tags "urgent":
```todoseq
search: state:TODO [tags:urgent]
```

## Advanced Scenarios

### Multiple Array Values

Find tasks on pages with both "urgent" AND "feature" in tags:
```todoseq
search: [tags:urgent] AND [tags:feature]
```

### Date Ranges

Find tasks on pages with target date in March 2026:
```todoseq
search: [target:>=2026-03-01] AND [target:<=2026-03-31]
```

### Complex Query Example

Find active, non-archived project tasks with high priority:
```todoseq
search: [status:Active] AND -[archived:true] AND [type:Project] AND [priority:>3]
```

## Testing Notes

1. Each embedded task list above should display the tasks that match the property search query
2. Compare the results in the embedded lists with the results when using the same query in the search bar
3. Verify that negation, OR operations, and comparison operators work as expected
4. Test case sensitivity by trying both uppercase and lowercase values
5. Test partial vs exact matching by using quoted and unquoted values
