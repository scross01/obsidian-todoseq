/**
 * Seed for the generated-properties docs screenshots (docs/task-dependencies.md).
 *
 * One note, two tasks, neither with an identity or dependency drawer yet: the
 * capture performs the real **Copy ID** and **Add copied link as blocker**
 * workflow against it, so the resulting drawers are genuinely generated rather
 * than staged. A second note would only appear in the Task List and the editor
 * crop, so the vault holds nothing else.
 */
export const ORG_PROPERTIES_SEEDS: Record<string, string> = {
  'Release Plan.md': `Two steps of the same report, with the dependency not yet declared.

TODO Collect source data

TODO Draft the report
`,
};
