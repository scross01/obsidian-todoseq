/**
 * Chinese (simplified) locale. Structural parity with `en.ts` is enforced at
 * compile time via `WidenStrings<typeof en>` — a missing or extra key is a
 * type error.
 *
 * Text baseline: the FEI352 fork's Simplified Chinese translation
 * (src/i18n/base.ts), reconciled to the current English strings; strings the
 * fork did not cover are translated fresh.
 */
import { en, type WidenStrings } from './en';

export const zh: WidenStrings<typeof en> = {
  settings: {
    general: {
      formatTaskKeywords: {
        name: '高亮任务关键词',
        desc: '在编辑器中将任务关键词（如 TODO、DOING 等）以加粗加色彩的形式高亮显示。',
      },
    },
    headings: {
      taskDetection: '任务检测',
      smartDates: '智能日期识别',
      searchFilter: '任务列表搜索与过滤',
      taskKeywords: '任务关键词',
      transitions: '任务状态转换',
      warningPeriod: '警告期限',
      experimental: '⚠︎ 实验性功能',
    },
    taskDetection: {
      includeCalloutBlocks: {
        name: '包含引用和标注块内的任务',
        desc: '启用后扫描引用块 (>) 和标注块内的任务。',
      },
      includeCommentBlocks: {
        name: '包含注释内的任务',
        desc: '启用后扫描注释 (%%...%%) 内的任务。',
      },
      includeCodeBlocks: {
        name: '包含代码块内的任务',
        desc: '启用后扫描代码块内的任务。',
      },
      languageCommentSupport: {
        name: '启用语言注释支持',
        desc: '启用后扫描编程语言注释中的 TODO 标记（如 // TODO）。',
      },
    },
    smartDates: {
      enableSmartDateRecognition: {
        name: '启用智能日期识别',
        desc: '自动将自然语言日期（如"今天"、"明天"、"下周三"）转换为结构化日期。',
      },
      smartDateRemoveKeywords: {
        name: '转换后移除日期关键词',
        desc: '将自然语言日期（如"今天"、"明天"）转换为结构化日期后，删除原有的自然语言文本。',
      },
    },
    searchFilter: {
      weekStartsOn: {
        name: '每周起始日',
        desc: '选择日期过滤器的每周起始日。',
      },
      taskListViewMode: {
        name: '已完成任务',
        desc: '选择任务列表中已完成项目的显示方式。',
      },
      futureTaskSorting: {
        name: '未来日期任务',
        desc: '选择未来日期任务的显示方式。',
      },
      taskDescriptionDisplay: {
        name: '任务描述',
        desc: '控制任务描述（description: 行）在任务列表中的显示方式。',
      },
      upcomingPeriod: {
        name: '即将到来的天数',
        desc: '任务列表中显示多少天内即将到来的任务。',
      },
      defaultSortMethod: {
        name: '默认排序方式',
        desc: '选择任务列表的默认排序方式。',
      },
    },
    keywords: {
      inactive: {
        name: '未激活关键词',
        desc: '尚未开始的任务的关键词（如 FIXME、HACK）。内置：TODO、LATER。',
      },
      active: {
        name: '进行中关键词',
        desc: '正在进行中的任务的关键词（如 STARTED）。内置：DOING、NOW、IN-PROGRESS。',
      },
      waiting: {
        name: '等待关键词',
        desc: '被阻塞或暂停任务的关键词（如 ON-HOLD）。内置：WAIT、WAITING。',
      },
      completed: {
        name: '已完成关键词',
        desc: '已完成或已放弃任务的关键词（如 NEVER）。内置：DONE、CANCELLED、CANCELED。',
      },
      archived: {
        name: '已归档关键词',
        desc: '已归档任务的关键词（如 OLD）。这些任务会被设置样式，但不会在库扫描时收集。内置：ARCHIVED。',
      },
      migratedState: {
        name: '迁移后状态关键词',
        desc: '迁移任务到今日后源任务设置的状态关键词。留空则禁用。',
      },
    },
    transitions: {
      stateTransitions: {
        name: '状态转换',
        desc: '每行一个转换规则。格式：关键词A -> 关键词B。使用 | 分隔多个目标。',
      },
      defaultInactive: {
        name: '默认未激活状态',
        desc: '未显式定义转换时未激活任务的默认状态。',
      },
      defaultActive: {
        name: '默认进行中状态',
        desc: '未显式定义转换时进行中任务的默认状态。',
      },
      defaultCompleted: {
        name: '默认已完成状态',
        desc: '未显式定义转换时已完成任务的默认状态。',
      },
      trackClosedDate: {
        name: '记录完成时间',
        desc: '任务完成时添加 closed: 时间戳。',
      },
      trackStartedDate: {
        name: '记录开始时间',
        desc: '任务首次进入进行中状态时添加 started: 时间戳。只写入一次，之后不会自动移除。',
      },
    },
    warningPeriod: {
      defaultDeadlineWarningPeriod: {
        name: '截止前提醒天数',
        desc: '任务接近截止日期时提前多少天开始警告。设为 0 禁用。',
      },
      defaultScheduledWarningPeriod: {
        name: '延迟警告天数',
        desc: '任务超过计划日期时延迟多少天后开始警告。设为 0 禁用。',
      },
      skipScheduledWarningPeriodIfDeadline: {
        name: '有截止日期时忽略计划延迟',
        desc: '勾选后，如果任务已设置截止日期，则不再触发计划日期延迟警告。',
      },
      skipDeadlinePrewarningIfScheduled: {
        name: '有计划日期时忽略截止前提醒',
        desc: '勾选后，如果任务已设置计划日期，则不再触发截止前提醒。',
      },
    },
    experimental: {
      experimentalFeatures: {
        name: '实验性功能',
        desc: '实验性功能可能会在未来版本中大幅更改或完全移除。',
      },
      detectOrgModeFiles: {
        name: '检测 org-mode 文件',
        desc: '启用后将 org-mode 文件视为任务来源文件。',
      },
      scanCodeFiles: {
        name: '扫描代码文件注释',
        desc: '启用后扫描编程语言源代码中的注释（// TODO、# TODO 等）。支持多行注释，并跳过字符串字面量中的关键词。',
      },
      useExtendedCheckboxStyles: {
        name: '使用扩展复选框样式',
        desc: '启用后进行中显示 - [/]，已取消显示 - [-]（需要主题支持）。',
      },
    },
    options: {
      monday: '星期一',
      sunday: '星期日',
      showAllTasks: '显示所有任务',
      sortCompletedToEnd: '已完成排到最后',
      hideCompleted: '隐藏已完成',
      showUpcoming: '显示即将到来',
      sortFutureToEnd: '未来任务排到最后',
      hideFuture: '隐藏未来任务',
      hide: '隐藏',
      show: '显示',
      defaultFilePath: '默认（文件路径）',
      scheduledDate: '计划日期',
      deadlineDate: '截止日期',
      closedDate: '完成日期',
      startedDate: '开始日期',
      priority: '优先级',
      urgency: '紧急度',
      keyword: '关键词',
    },
    placeholders: {
      keyword: 'KEYWORD',
      disabled: '（已禁用）',
    },
  },
  notices: {
    failedToRefreshTaskList: '刷新任务列表失败',
  },
};
