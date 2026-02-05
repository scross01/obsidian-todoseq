# Property Search Manual Validation

This directory contains example pages for manual validation of the TODOseq Property Search feature. These pages can be used to test various property search scenarios.

## How to Use

1. Copy these example pages to your Obsidian vault
2. Use the TODOseq search bar to test various property search queries
3. Verify that the search results match the expected results described below

## Example Pages

### 1. Test Property Search - Status Active.md
- **Properties**: `type: Test Page`, `status: Active`
- **Purpose**: Test basic string property matching
- **Test Queries**:
  - `[status:Active]` - Should find this page
  - `[type:Test Page]` - Should find this page
  - `[status:Draft]` - Should NOT find this page

### 2. Test Property Search - Status Draft.md
- **Properties**: `type: Test Page`, `status: Draft`
- **Purpose**: Test different string property values
- **Test Queries**:
  - `[status:Draft]` - Should find this page
  - `[status:Active]` - Should NOT find this page
  - `[type:Test Page]` - Should find this page

### 3. Test Property Search - Status Empty.md
- **Properties**: `type: Test Page`, `status: ""`
- **Purpose**: Test empty string property values
- **Test Queries**:
  - `[status:]` - Should find this page (empty value)
  - `[status:""]` - Should find this page (explicit empty string)
  - `[status:null]` - Should find this page (null check)
  - `[status:Active]` - Should NOT find this page

### 4. Test Property Search - Numeric.md
- **Properties**: `type: Test Page`, `size: 100`, `priority: 1`
- **Purpose**: Test numeric property values and comparison operators
- **Test Queries**:
  - `[size:100]` - Should find this page (exact match)
  - `[size:>99]` - Should find this page (greater than)
  - `[size:<101]` - Should find this page (less than)
  - `[priority:1]` - Should find this page
  - `[size:200]` - Should NOT find this page

### 5. Test Property Search - Checkbox.md
- **Properties**: `type: Test Page`, `archived: false`
- **Purpose**: Test boolean property values
- **Test Queries**:
  - `[archived:false]` - Should find this page
  - `[archived:true]` - Should NOT find this page
  - `[type:Test Page]` - Should find this page

### 6. Test Property Search - Date.md
- **Properties**: `type: Test Page`, `target: 2026-03-31`
- **Purpose**: Test date property values
- **Test Queries**:
  - `[target:2026-03-31]` - Should find this page (exact match)
  - `[target:>2026-01-01]` - Should find this page (date comparison)
  - `[target:<2026-12-31]` - Should find this page (date comparison)
  - `[target:2025-01-01]` - Should NOT find this page

### 7. Test Property Search - Tags.md
- **Properties**: `type: Test Page`, `tags: ["urgent", "feature"]`
- **Purpose**: Test array property values
- **Test Queries**:
  - `[tags:urgent]` - Should find this page (array contains value)
  - `[tags:feature]` - Should find this page (array contains value)
  - `[tags:bug]` - Should NOT find this page (array doesn't contain value)
  - `[type:Test Page]` - Should find this page

### 8. Test Property Search - Complex.md
- **Properties**: `type: Project`, `status: Active`, `priority: 3`, `size: 150`, `archived: false`, `target: 2026-06-30`, `tags: ["urgent", "feature", "backend"]`, `assignee: "John Doe"`, `estimated_hours: 40`, `completed: false`
- **Purpose**: Test complex property combinations and different property types
- **Test Queries**:
  - `[type:Project]` - Should find this page
  - `[status:Active]` - Should find this page
  - `[priority:>2]` - Should find this page (priority is 3)
  - `[size:>100]` - Should find this page (size is 150)
  - `[archived:false]` - Should find this page
  - `[target:>2026-01-01]` - Should find this page
  - `[tags:backend]` - Should find this page (array contains value)
  - `[assignee:John Doe]` - Should find this page (string with space)
  - `[estimated_hours:>30]` - Should find this page
  - `[completed:false]` - Should find this page
  - `[type:Project] AND [status:Active] AND [priority:>2]` - Should find this page (combined filters)

### 9. Test Property Search - No Properties.md
- **Properties**: None (empty frontmatter)
- **Purpose**: Test pages with no properties
- **Test Queries**:
  - `[type:null]` - Should find this page (property doesn't exist)
  - `[status:null]` - Should find this page (property doesn't exist)
  - `[type:Test Page]` - Should NOT find this page (property doesn't exist)
  - `[status:Active]` - Should NOT find this page (property doesn't exist)

### 10. Test Property Search - Array Empty.md
- **Properties**: `type: Test Page`, `tags: []`, `categories: []`
- **Purpose**: Test pages with empty arrays
- **Test Queries**:
  - `[tags:[]]` - Should find this page (empty array)
  - `[categories:[]]` - Should find this page (empty array)
  - `[tags:null]` - Should NOT find this page (property exists but is empty array)
  - `[tags:urgent]` - Should NOT find this page (array is empty)
  - `[type:Test Page]` - Should find this page

## Advanced Test Scenarios

### Combined Filters
Test combining multiple property filters:
- `[type:Test Page] AND [status:Active]` - Should only find Status Active page
- `[type:Test Page] AND -[status:Active]` - Should find all Test Pages except Status Active
- `[type:Test Page] AND [status:null]` - Should find Status Empty page

### Case Sensitivity
Test case sensitivity in property values:
- `[status:active]` vs `[status:Active]` - Test case sensitivity behavior
- `[TYPE:Test Page]` vs `[type:Test Page]` - Test case sensitivity in property names

### OR Operator
Test the OR operator between property values:
- `[status:Draft OR Active]` - Should find both Status Draft and Status Active pages

### Partial vs Exact Matching
Test partial vs exact matching:
- `[type:Test]` - Test if this matches "Test Page" (partial matching)
- `[type:"Test Page"]` - Test exact matching with quotes

## Embedded Task List Views

The main `Test Property Search.md` file contains embedded task list code blocks that demonstrate various property search queries. You can use these to:

1. See how property search is used in embedded task lists
2. Test the queries in the search bar
3. Compare results between embedded lists and search bar

## Expected Behavior

When testing these examples, verify that:

1. Property search correctly filters pages based on their frontmatter properties
2. Comparison operators work as expected for numeric and date values
3. Array properties match when the array contains the specified value
4. Empty/null properties are handled correctly
5. Negation and OR operators work as expected
6. Case sensitivity behaves as documented

## Troubleshooting

If property search is not working as expected:

1. Check that the properties are correctly formatted in YAML frontmatter
2. Verify that property names and values match exactly (including case sensitivity)
3. Ensure that comparison operators are used correctly
4. Check that array properties are properly formatted as YAML arrays

## Feedback

If you find any issues or unexpected behavior during testing, please report them with:
1. The exact query used
2. The expected result
3. The actual result
4. The example page being tested