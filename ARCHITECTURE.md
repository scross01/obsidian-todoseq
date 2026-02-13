# Architecture Documentation

## Overview

TODOseq is a lightweight, keyword-based task tracker for Obsidian that provides advanced task management capabilities while preserving users' original Markdown formatting. The architecture is designed around principles of **centralized state management**, **event-driven updates**, and **layered separation of concerns**.

### Core Philosophy

1. **Non-intrusive Integration**: Tasks exist as plain text in Markdown files - no special syntax required
2. **Performance First**: Incremental scanning, optimistic updates, and efficient parsing
3. **Reactive UI**: Immediate feedback with async persistence for smooth user experience
4. **Type Safety**: Comprehensive TypeScript interfaces throughout the codebase

## High-Level System Architecture

```mermaid
graph TB
    subgraph "Obsidian Platform"
        ObsidianAPI["Obsidian APIs"]
        Workspace["Workspace Manager"]
        FileSystem["File System"]
        Editor["Editor (CodeMirror)"]
    end

    subgraph "TODOseq Plugin"
        Main[Main Plugin Class<br/>TodoTracker]

        subgraph "Service Layer"
            StateManager["TaskStateManager<br/>Central State"]
            VaultScanner["VaultScanner<br/>File Monitoring"]
            UpdateCoordinator["TaskUpdateCoordinator<br/>Update Pipeline"]
            EditorController["EditorController<br/>Editor Operations"]
            TaskWriter["TaskWriter<br/>File Operations"]
        end

        subgraph "UI Layer"
            UIManager["UIManager<br/>UI Coordination"]
            TaskListView["TaskListView<br/>Main Task Panel"]
            ReaderFormatter["ReaderViewFormatter<br/>Reader Mode"]
            StatusBarManager["StatusBarManager<br/>Status Bar"]
            EditorKeywordMenu["EditorKeywordMenu<br/>Keyword Menu"]
            StateMenuBuilder["StateMenuBuilder<br/>State Menu"]
            EmbeddedProcessor["TodoseqCodeBlockProcessor<br/>Embedded Lists"]
        end

        subgraph "Parser Layer"
            TaskParser["TaskParser<br/>Markdown Engine"]
            OrgModeParser["OrgModeTaskParser<br/>Org-mode Engine"]
            ParserRegistry["ParserRegistry<br/>Parser Router"]
            LanguageRegistry["LanguageRegistry<br/>Multi-language Support"]
            DateParser["DateParser<br/>Date Recognition"]
        end

        subgraph "Search Layer"
            Search["Search System<br/>Query Engine"]
            SearchParser["Search Parser<br/>AST Builder"]
            SearchEvaluator["Search Evaluator<br/>Task Filtering"]
            SearchTokenizer["SearchTokenizer<br/>Lexical Analysis"]
            SearchSuggestions["SearchSuggestions<br/>Auto-complete"]
        end

        subgraph "Utilities"
            TaskUtils["Task Utilities"]
            DateUtils["Date Utilities"]
            SettingsUtils["Settings Utils"]
            RegexCache["RegexCache<br/>Pattern Caching"]
            Patterns["Regex Patterns"]
            TaskSort["Task Sorting"]
            TaskUrgency["Task Urgency"]
            DailyNoteUtils["Daily Note Utils"]
        end

        subgraph "Lifecycle"
            LifecycleManager["PluginLifecycleManager<br/>Plugin Lifecycle"]
        end
    end

    subgraph "External Dependencies"
        DailyNotes["Daily Notes Interface"]
    end

    %% Connections
    Main --> StateManager
    Main --> VaultScanner
    Main --> UpdateCoordinator
    Main --> UIManager

    StateManager --> TaskListView
    StateManager --> EmbeddedProcessor
    StateManager --> Search

    VaultScanner --> ParserRegistry
    ParserRegistry --> TaskParser
    ParserRegistry --> OrgModeParser
    TaskParser --> LanguageRegistry
    TaskParser --> DateParser
    OrgModeParser --> DateParser
    VaultScanner --> FileSystem

    UpdateCoordinator --> StateManager
    UpdateCoordinator --> TaskEditor
    UpdateCoordinator --> UIManager

    UIManager --> Editor
    UIManager --> TaskListView
    UIManager --> ReaderFormatter

    TaskListView --> Search
    TaskEditor --> FileSystem

    Search --> SearchParser
    Search --> SearchEvaluator
    Search --> StateManager

    TaskParser --> DateParser
    TaskParser --> LanguageRegistry
    TaskParser --> TaskUtils

    %% External connections
    Main --> ObsidianAPI
    Main --> Workspace
    VaultScanner --> FileSystem
    TaskEditor --> FileSystem
    DateUtils --> DailyNotes

    %% Styling
    classDef pluginLayer fill:#e1f5fe
    classDef serviceLayer fill:#f3e5f5
    classDef uiLayer fill:#e8f5e8
    classDef parserLayer fill:#fff3e0
    classDef searchLayer fill:#fce4ec
    classDef external fill:#f5f5f5

    class Main pluginLayer
    class StateManager,VaultScanner,UpdateCoordinator serviceLayer
    class UIManager,TaskListView,TaskEditor,ReaderFormatter,EmbeddedProcessor uiLayer
    class TaskParser,OrgModeParser,ParserRegistry,LanguageRegistry,DateParser parserLayer
    class Search,SearchParser,SearchEvaluator searchLayer
    class ObsidianAPI,Workspace,FileSystem,Editor,DailyNotes external
```

## Component Layering and Separation of Concerns

### 1. Service Layer (Business Logic)

**TaskStateManager** (`src/services/task-state-manager.ts`)

- **Responsibility**: Single source of truth for all task data
- **Key Patterns**: Observer pattern for reactive updates
- **Interface**: `getTasks()`, `setTasks()`, `subscribe(callback)`, `findTaskByPathAndLine()`

**VaultScanner** (`src/services/vault-scanner.ts`)

- **Responsibility**: File system monitoring and incremental scanning
- **Key Patterns**: Event-driven architecture, performance optimization, yielding to event loop
- **Interface**: `scanVault()`, `updateSettings()`, event emission

**TaskUpdateCoordinator** (`src/services/task-update-coordinator.ts`)

- **Responsibility**: Centralized update pipeline with optimistic UI
- **Key Patterns**: Command pattern, optimistic updates
- **Interface**: `updateTaskState()`, `createTask()`, coordinate updates

**EditorController** (`src/services/editor-controller.ts`)

- **Responsibility**: Editor operations, task parsing under cursor, intent detection
- **Key Patterns**: Bridge pattern, command delegation
- **Interface**: Task cycling, priority changes, keyword toggling

**TaskWriter** (`src/services/task-writer.ts`)

- **Responsibility**: Atomic file operations, state preservation, formatting
- **Key Patterns**: Strategy pattern, atomic operations
- **Interface**: `updateFile()`, `generateTaskLine()`, file persistence

### 2. UI Layer (User Interaction)

**UIManager** (`src/ui-manager.ts`)

- **Responsibility**: Central UI coordination, extension registration
- **Key Patterns**: Extension system, event delegation
- **Interface**: UI component lifecycle, event coordination

**TaskListView** (`src/view/task-list/task-list-view.ts`)

- **Responsibility**: Main task panel with search, filtering, sorting
- **Key Patterns**: Observer pattern, component-based rendering
- **Interface**: Obsidian View API implementation

**ReaderViewFormatter** (`src/view/markdown-renderers/reader-formatting.ts`)

- **Responsibility**: Task keyword formatting in reader/preview mode
- **Key Patterns**: Double-click detection, settings change detection
- **Interface**: `refreshReaderViewFormatter()`, keyword styling, state menus

**StatusBarManager** (`src/view/editor-extensions/status-bar.ts`)

- **Responsibility**: Status bar integration with task count display
- **Key Patterns**: Event subscription, UI updates
- **Interface**: `setupStatusBarItem()`, task count display

**EditorKeywordMenu** (`src/view/editor-extensions/editor-keyword-menu.ts`)

- **Responsibility**: In-editor keyword interaction and menu display
- **Key Patterns**: Context menu, keyword detection
- **Interface**: Keyword menu management

**StateMenuBuilder** (`src/view/components/state-menu-builder.ts`)

- **Responsibility**: Context menu generation for task state changes
- **Key Patterns**: Dynamic menu building, state categorization
- **Interface**: `getSelectableStatesForMenu()`, menu generation

**TodoseqCodeBlockProcessor** (`src/view/embedded-task-list/code-block-processor.ts`)

- **Responsibility**: Embedded task list processing in markdown blocks
- **Key Patterns**: Post-processor registration, separate lifecycle
- **Interface**: Code block parsing, embedded list rendering

### 3. Parser Layer (Data Extraction)

**ITaskParser Interface** (`src/parser/types.ts`)

- **Responsibility**: Defines the contract for all task parsers
- **Key Patterns**: Interface segregation, strategy pattern
- **Interface**: `parseFile()`, `parseLine()`, `supportsFile()`, `getFileExtensions()`

**ParserRegistry** (`src/parser/parser-registry.ts`)

- **Responsibility**: Manages multiple parsers and routes files to appropriate parser
- **Key Patterns**: Registry pattern, factory pattern, file extension routing
- **Interface**: `registerParser()`, `getParserForFile()`, `parseFile()`

**TaskParser** (`src/parser/task-parser.ts`)

- **Responsibility**: Complex regex-based task extraction for Markdown files
- **Key Patterns**: State machine, builder pattern, security-first design
- **Interface**: Implements `ITaskParser`, `parseFile()`, `parseLine()`, language-aware parsing

**OrgModeTaskParser** (`src/parser/org-mode-task-parser.ts`)

- **Responsibility**: Parse tasks from Org-mode files (`.org` extension)
- **Key Patterns**: Headline-based parsing, org-mode syntax support
- **Interface**: Implements `ITaskParser`, supports priorities, scheduled/deadline dates

**LanguageRegistry** (`src/parser/language-registry.ts`)

- **Responsibility**: Multi-language comment pattern management
- **Key Patterns**: Registry pattern, factory pattern
- **Interface**: Language definition storage and resolution

### 4. Search Layer (Query Processing)

**Search System** (`src/search/search.ts`)

- **Responsibility**: Query parsing and evaluation
- **Key Patterns**: Compiler pattern (parsing → AST → evaluation)
- **Interface**: `search()`, query validation, error handling

**SearchParser** (`src/search/search-parser.ts`)

- **Responsibility**: AST building from query tokens
- **Key Patterns**: Parser combinators, syntax tree construction
- **Interface**: Query parsing, AST generation

**SearchEvaluator** (`src/search/search-evaluator.ts`)

- **Responsibility**: Task matching and filtering based on query AST
- **Key Patterns**: Visitor pattern, filter chain execution
- **Interface**: Task evaluation, result filtering

**SearchTokenizer** (`src/search/search-tokenizer.ts`)

- **Responsibility**: Lexical analysis of search queries
- **Key Patterns**: Tokenization, pattern matching
- **Interface**: Token generation, lexical analysis

**SearchSuggestions** (`src/search/search-suggestions.ts`)

- **Responsibility**: Auto-complete functionality for search queries
- **Key Patterns**: Suggestion ranking, prefix matching
- **Interface**: Suggestion generation, completion lists

## Component Dependency Diagram

```mermaid
graph TD
    subgraph "Core Components"
        Main[TodoTracker<br/>Main Plugin]
    end

    subgraph "Service Layer Dependencies"
        StateManager[TaskStateManager]
        VaultScanner[VaultScanner]
        UpdateCoordinator[TaskUpdateCoordinator]
    end

    subgraph "UI Layer Dependencies"
        UIManager[UIManager]
        TaskListView[TaskListView]
        ReaderFormatter[ReaderViewFormatter]
        StatusBar[StatusBarManager]
        EditorKeywordMenu[EditorKeywordMenu]
        StateMenuBuilder[StateMenuBuilder]
        EmbeddedProcessor[TodoseqCodeBlockProcessor]
    end

    subgraph "Parser Dependencies"
        TaskParser[TaskParser]
        OrgModeParser[OrgModeTaskParser]
        ParserRegistry[ParserRegistry]
        LanguageRegistry[LanguageRegistry]
        DateParser[DateParser]
    end

    subgraph "Search Dependencies"
        Search[Search]
        SearchParser[SearchParser]
        SearchEvaluator[SearchEvaluator]
        SearchTokenizer[SearchTokenizer]
        SearchSuggestions[SearchSuggestions]
    end

    subgraph "Utility Dependencies"
        TaskUtils[TaskUtils]
        DateUtils[DateUtils]
        SettingsUtils[SettingsUtils]
        Patterns[Patterns]
        RegexCache[RegexCache]
        TaskSort[TaskSort]
        TaskUrgency[TaskUrgency]
        DailyNoteUtils[DailyNoteUtils]
    end

    subgraph "Service Layer Dependencies"
        EditorController[EditorController]
        TaskWriter[TaskWriter]
    end

    subgraph "Lifecycle Dependencies"
        LifecycleManager[PluginLifecycleManager]
    end

    subgraph "External APIs"
        Obsidian[Obsidian API]
        DailyNotes[Daily Notes Interface]
    end

    %% Dependency arrows (A depends on B)
    Main --> StateManager
    Main --> VaultScanner
    Main --> UpdateCoordinator
    Main --> UIManager
    Main --> EditorController
    Main --> TaskWriter
    Main --> LifecycleManager

    StateManager -.-> Main
    VaultScanner -.-> Main
    UpdateCoordinator -.-> Main
    UIManager -.-> Main
    EditorController -.-> Main
    TaskWriter -.-> Main
    LifecycleManager -.-> Main

    UpdateCoordinator --> StateManager
    UpdateCoordinator --> TaskWriter

    UIManager --> TaskListView
    UIManager --> ReaderFormatter
    UIManager --> StatusBar
    UIManager --> EditorKeywordMenu
    UIManager --> StateMenuBuilder

    TaskListView --> StateManager
    TaskListView --> Search

    VaultScanner --> ParserRegistry
    ParserRegistry --> TaskParser
    ParserRegistry --> OrgModeParser
    TaskParser --> LanguageRegistry
    TaskParser --> DateParser
    OrgModeParser --> DateParser
    TaskParser --> TaskUtils
    TaskParser --> Patterns

    Search --> SearchParser
    Search --> SearchEvaluator
    SearchParser --> SearchTokenizer
    Search --> SearchSuggestions
    Search --> StateManager

    EditorController --> TaskWriter
    EditorController --> StateManager

    TaskWriter --> Obsidian
    VaultScanner --> Obsidian
    DateUtils --> DailyNotes

    TaskListView --> Obsidian
    ReaderFormatter --> Obsidian

    %% Utility dependencies
    TaskWriter --> TaskUtils
    TaskListView --> TaskUtils
    SearchEvaluator --> TaskUtils
    EditorController --> Patterns

    %% RegexCache dependencies
    VaultScanner --> RegexCache
    SearchEvaluator --> RegexCache

    %% Lifecycle dependencies
    LifecycleManager --> VaultScanner
    LifecycleManager --> TaskWriter
    LifecycleManager --> EditorKeywordMenu
    LifecycleManager --> StatusBar
    LifecycleManager --> TaskListView

    %% Styling for dependency direction
    linkStyle 0,1,2,3,4,5,6 stroke:#2196f3,stroke-width:2px
    linkStyle 7,8,9,10,11,12 stroke:#4caf50,stroke-width:2px
    linkStyle 13,14,15,16,17,18,19,20,21,22 stroke:#ff9800,stroke-width:2px
    linkStyle 23,24,25,26,27,28,29,30,31 stroke:#9c27b0,stroke-width:2px
    linkStyle 32,33,34,35,36 stroke:#f44336,stroke-width:2px
    linkStyle 37,38,39,40,41 stroke:#607d8b,stroke-width:2px

    %% Class styling for component types
    class Main,LifecycleManager pluginLayer
    class StateManager,VaultScanner,UpdateCoordinator,EditorController,TaskWriter serviceLayer
    class UIManager,TaskListView,ReaderFormatter,StatusBar,EditorKeywordMenu,StateMenuBuilder,EmbeddedProcessor uiLayer
    class TaskParser,OrgModeParser,ParserRegistry,LanguageRegistry,DateParser parserLayer
    class Search,SearchParser,SearchEvaluator,SearchTokenizer,SearchSuggestions searchLayer
    class TaskUtils,DateUtils,SettingsUtils,Patterns,RegexCache,TaskSort,TaskUrgency,DailyNoteUtils utilityLayer
    class Obsidian,DailyNotes external
```

## Data Flow Architecture: Task Updates

```mermaid
sequenceDiagram
    participant User
    participant UI as UI Component
    participant Coordinator as TaskUpdateCoordinator
    participant StateMgr as TaskStateManager
    participant EditorCtrl as EditorController
    participant TaskWriter as TaskWriter
    participant FileSys as File System
    participant VaultScan as VaultScanner
    participant Views as All Views

    User->>UI: Click task keyword / edit task
    UI->>Coordinator: requestTaskUpdate()

    Note over Coordinator: Phase 1: Intent Detection
    Coordinator->>EditorCtrl: detectIntent()
    EditorCtrl->>StateMgr: findTaskByPathAndLine()
    Note over Coordinator: Phase 2: Optimistic Update
    Coordinator->>StateMgr: optimisticUpdate()
    StateMgr->>StateMgr: Update internal state
    StateMgr->>Views: notifySubscribers()
    Views->>Views: Update UI immediately
    Coordinator->>UI: Return success (optimistic)

    Note over Coordinator: Phase 3: File Persistence
    Coordinator->>TaskWriter: updateFile()
    TaskWriter->>FileSys: Write changes to disk
    FileSys-->>TaskWriter: Success/Failure
    TaskWriter-->>Coordinator: Success/Failure

    alt File Update Success
        Note over Coordinator: Phase 4: View Synchronization
        Coordinator->>VaultScan: notifyFileChanged()
        VaultScan->>VaultScan: Re-parse affected file
        VaultScan->>StateMgr: updateTasks()
        StateMgr->>Views: notifySubscribers()
        Views->>Views: Refresh with confirmed state
    else File Update Failure
        Coordinator->>StateMgr: rollbackUpdate()
        StateMgr->>Views: notifySubscribers()
        Views->>Views: Revert to original state
        Coordinator->>UI: Return error
    end

    Note over Coordinator: Additional Updates
    Coordinator->>Views: refreshEmbeddedTaskLists()
    Coordinator->>UI: refreshEditorDecorations()
```

## Search System Architecture

```mermaid
graph LR
    subgraph "Query Input"
        UserInput[User Search Query]
        PrefixFilters[Prefix Filters<br/>title:, tag:, etc.]
    end

    subgraph "Parsing Pipeline"
        Tokenizer[SearchTokenizer<br/>Lexical Analysis]
        Parser[SearchParser<br/>AST Building]
        Validator[Query Validator<br/>Error Checking]
    end

    subgraph "Evaluation Engine"
        Evaluator[SearchEvaluator<br/>Task Matching]
        FilterChain[Filter Chain<br/>Multi-criteria]
        SortEngine[Sort Engine<br/>Results Ordering]
    end

    subgraph "Integration Points"
        TaskSource[TaskStateManager<br/>Task Data Source]
        ViewUpdater[TaskListView<br/>UI Updates]
        EmbeddedUpdater[EmbeddedTaskLists<br/>In-note Updates]
    end

    UserInput --> Tokenizer
    PrefixFilters --> Tokenizer

    Tokenizer --> Parser
    Parser --> Validator
    Validator --> Evaluator

    TaskSource --> Evaluator
    Evaluator --> FilterChain
    FilterChain --> SortEngine
    SortEngine --> ViewUpdater
    SortEngine --> EmbeddedUpdater

    subgraph "AST Node Types"
        AND[AND Operation]
        OR[OR Operation]
        NOT[NOT Operation]
        TEXT[Text Match]
        TAG[Tag Match]
        DATE[Date Range]
        PRIORITY[Priority Filter]
        STATE[State Filter]
    end

    Parser -.-> AND
    Parser -.-> OR
    Parser -.-> NOT
    Parser -.-> TEXT
    Parser -.-> TAG
    Parser -.-> DATE
    Parser -.-> PRIORITY
    Parser -.-> STATE

    classDef input fill:#e3f2fd
    classDef parser fill:#f3e5f5
    classDef evaluator fill:#e8f5e8
    classDef integration fill:#fff3e0
    classDef ast fill:#fce4ec

    class UserInput,PrefixFilters input
    class Tokenizer,Parser,Validator parser
    class Evaluator,FilterChain,SortEngine evaluator
    class TaskSource,ViewUpdater,EmbeddedUpdater integration
    class AND,OR,NOT,TEXT,TAG,DATE,PRIORITY,STATE ast
```

## Core Architectural Patterns

### 1. Centralized State Management

- **Single Source of Truth**: `TaskStateManager` holds all task data
- **Observer Pattern**: Components subscribe to state changes
- **Immutable Updates**: State changes return new arrays, prevent mutation
- **Optimistic Updates**: UI updates immediately, persists asynchronously

### 2. Event-Driven Architecture

- **File Change Events**: `VaultScanner` monitors vault for changes
- **State Change Events**: `TaskStateManager` notifies subscribers
- **UI Events**: `UIManager` coordinates user interactions
- **Error Events**: Graceful error handling and recovery

### 3. Plugin Architecture

- **Language Registry**: Extensible language support via `LanguageRegistry`
- **Editor Extensions**: Pluggable CodeMirror decorations and commands
- **Search Extensions**: Customizable search filters and evaluators
- **Format Extensions**: Configurable task formatting options

### 4. Performance Patterns

- **Incremental Scanning**: Only re-scan changed files
- **Yielding to Event Loop**: Prevent UI freezing during large operations
- **Lazy Loading**: Components created on-demand
- **Efficient Parsing**: Optimized regex patterns and caching
- **Regex Caching**: `RegexCache` utility caches compiled regex patterns to avoid repeated compilation during vault scans and searches

### 5. Security Patterns

- **Input Validation**: All user inputs validated before processing
- **Regex Injection Prevention**: User input sanitized before regex compilation
- **File Path Validation**: Prevents path traversal attacks
- **Type Safety**: Comprehensive TypeScript interfaces

## Parser Architecture

The parser layer uses a strategy pattern with a registry to support multiple file formats. This allows TODOseq to parse tasks from both Markdown and Org-mode files using a unified interface.

### ITaskParser Interface

All parsers implement the `ITaskParser` interface defined in [`src/parser/types.ts`](src/parser/types.ts):

```typescript
interface ITaskParser {
  parseFile(content: string, filePath: string): Task[];
  parseLine(line: string, lineNumber: number, filePath: string): Task | null;
  supportsFile(filePath: string): boolean;
  getFileExtensions(): string[];
}
```

### ParserRegistry

The [`ParserRegistry`](src/parser/parser-registry.ts) manages multiple parsers and routes files to the appropriate parser based on file extension:

- **Registration**: Parsers are registered with `registerParser(parser: ITaskParser)`
- **Routing**: `getParserForFile(filePath)` returns the appropriate parser
- **Delegation**: `parseFile()` and `parseLine()` delegate to the correct parser

### Parser Lifecycle

1. **Initialization**: Parsers are created and registered during plugin lifecycle (`src/plugin-lifecycle.ts`)
2. **Settings Updates**: When settings change, parsers are recreated with new configuration
3. **File Scanning**: `VaultScanner` uses `ParserRegistry` to parse files based on extension

### Supported Parsers

| Parser              | File Extensions    | Features                                                 |
| ------------------- | ------------------ | -------------------------------------------------------- |
| `TaskParser`        | `.md`, `.markdown` | Markdown tasks, checkboxes, code blocks, comments        |
| `OrgModeTaskParser` | `.org`             | Org-mode headlines, priorities, scheduled/deadline dates |

> **Note**: The `OrgModeTaskParser` is registered conditionally based on the `detectOrgModeFiles` experimental feature setting. When disabled (default), `.org` files are not parsed. Enable it in Settings → TODOseq → Experimental Features.

### Extending with New Parsers

To add support for a new file format:

1. Implement the `ITaskParser` interface
2. Register the parser in `PluginLifecycleManager.registerParsers()`
3. Add tests following the patterns in `tests/org-mode-parser.test.ts`

## Data Models and Type System

### Core Task Interface

```typescript
interface Task {
  path: string; // File path in vault
  line: number; // Line number in file
  rawText: string; // Original full line
  indent: string; // Leading whitespace
  listMarker: string; // List marker (+ space)
  footnoteMarker?: string; // Footnote marker
  text: string; // Task content (without keywords/priority)
  state: string; // Current state (TODO, DOING, etc.)
  completed: boolean; // Completion status
  priority: 'high' | 'med' | 'low' | null;
  scheduledDate: Date | null;
  deadlineDate: Date | null;
  tail?: string; // Trailing characters
  urgency: number | null; // Calculated urgency score
  file?: TFile; // Obsidian file reference
  tags?: string[]; // Extracted tags
  isDailyNote: boolean; // Daily note detection
  dailyNoteDate: Date | null;
  embedReference?: string;
  footnoteReference?: string;
}
```

### Key Type Definitions

- **State Transitions**: `NEXT_STATE` and `CYCLE_TASK_STATE` maps
- **Search AST**: `SearchNode` interface for query representation
- **Event Types**: Typed event interfaces for file changes and state updates
- **Configuration**: `TodoTrackerSettings` with validation

## Extension Points and Plugin Architecture

### 1. Language Support Extensions

- **Language Definition**: Add new programming languages to `LanguageRegistry`
- **Comment Patterns**: Define language-specific comment syntax
- **Keyword Mappings**: Map language-specific keywords to standard states

### 2. Search Extension Points

- **Custom Filters**: Implement new search criteria
- **AST Node Types**: Add new query syntax elements
- **Evaluation Functions**: Custom task matching logic

### 3. UI Extension Points

- **Editor Decorations**: Add new visual indicators
- **Context Menu Items**: Extend task interaction menus
- **View Modes**: Create new task display formats

### 4. Parser Extensions

- **ITaskParser Interface**: Implement new parsers for different file formats
- **ParserRegistry**: Register custom parsers for file extensions
- **Format Handlers**: Support new task formats
- **Date Parsers**: Add new date format recognition
- **Priority Systems**: Custom priority token parsing

## Development Guidelines

### For Developers

1. **State Management**: Always use `TaskStateManager` for task data access
2. **File Operations**: Use `TaskEditor` for atomic file updates
3. **Event Handling**: Subscribe to state changes, don't poll
4. **Error Handling**: Implement proper error boundaries and recovery
5. **Performance**: Use `yieldToEventLoop()` for long-running operations

### For AI Coding Assistants

1. **Dependency Injection**: Components receive dependencies via constructors
2. **Interface Compliance**: Implement required interfaces for new components
3. **Type Safety**: Use TypeScript interfaces for all public APIs
4. **Testing Patterns**: Mock `Obsidian` API using provided test utilities
5. **Build Process**: Use `npm run build`

### Critical Gotchas

1. **Circular Dependencies**: Avoid importing components that depend on each other
2. **Parser Recreation**: Call `recreateParser()` when settings change via `src/main.ts`
3. **State Consistency**: Use `TaskUpdateCoordinator` for all state changes
4. **Editor Operations**: Use `EditorController` for intent detection and `TaskWriter` for file operations
5. **File Race Conditions**: Use atomic operations and proper error handling
6. **Performance Testing**: Test with large vaults (1000+ files, 10000+ tasks)
7. **Embedded Lists**: Use `TodoseqCodeBlockProcessor` with separate lifecycle from main plugin
8. **Parser Registry**: Use `ParserRegistry` for file parsing - never call parsers directly from VaultScanner
9. **Org-Mode Limitations**: Org-mode files support vault scanning only; editor styling is not supported

### Testing Architecture

- **Unit Tests**: Comprehensive Jest test suite in `/tests` directory
- **Mock Setup**: Global test setup in `tests/test-setup.ts`
- **Language Tests**: Separate test files for each supported language
- **Performance Tests**: Utility tests for parsing and scanning performance
- **Coverage**: Excludes `src/main.ts` from coverage reporting

## Performance Characteristics

### Optimizations Built Into Architecture

1. **Incremental Updates**: Only re-scan changed files
2. **Optimistic UI**: Immediate feedback with async persistence
3. **Efficient Parsing**: Optimized regex patterns and state machines
4. **Yielding**: `yieldToEventLoop()` prevents UI freezing during vault scans
5. **Lazy Loading**: Components created when needed
6. **Regex Caching**: `RegexCache` utility caches compiled regex patterns to avoid repeated compilation during vault scans and searches
7. **Shared Parser**: Single parser instance reused across vault scans, recreated only when settings change

### Performance Bottlenecks to Monitor

1. **Large Vault Scans**: Initial vault scan can be slow
2. **Regex Compilation**: Complex regex patterns for parsing (mitigated by `RegexCache` utility)
3. **DOM Updates**: Frequent view updates can impact performance
4. **File I/O**: Synchronous file operations during updates
5. **Search Evaluation**: Complex queries on large task sets
6. **Editor Refresh**: Complex `requestMeasure()` + `dispatch()` + `setTimeout` sequence for decoration updates

This architecture provides a robust, maintainable, and extensible foundation for task management while ensuring optimal performance and user experience through careful design patterns, performance optimizations, and a well-structured component hierarchy.
