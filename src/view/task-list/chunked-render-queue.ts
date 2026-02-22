import { Task } from '../../types/task';

const CHUNK_BATCH_SIZE = 15;
const YIELD_EVERY_N_TASKS = 5;
const PRIORITY_FIRST_BATCH = 10;

export class ChunkedRenderQueue {
  private pending: Task[] = [];
  private isProcessing = false;
  private renderFn: ((task: Task) => HTMLLIElement) | null = null;
  private container: Element | null = null;
  private generation = 0;
  private currentRenderPromise: Promise<void> | null = null;

  async enqueue(
    tasks: Task[],
    renderFn: (task: Task) => HTMLLIElement,
    container: Element,
  ): Promise<void> {
    this.generation++;
    this.pending = [];
    this.isProcessing = false;

    this.renderFn = renderFn;
    this.container = container;
    this.pending = tasks;

    this.isProcessing = true;
    this.currentRenderPromise = this.processQueue();
    await this.currentRenderPromise;
    this.currentRenderPromise = null;
  }

  private async processQueue(): Promise<void> {
    const renderFn = this.renderFn;
    const container = this.container;
    const currentGeneration = this.generation;
    if (!renderFn || !container) return;

    let priorityRendered = 0;
    let renderedInBatch = 0;

    while (this.pending.length > 0) {
      if (this.generation !== currentGeneration) {
        return;
      }

      const isFirstBatch = priorityRendered < PRIORITY_FIRST_BATCH;
      const batchSize = isFirstBatch
        ? Math.min(CHUNK_BATCH_SIZE, PRIORITY_FIRST_BATCH - priorityRendered)
        : CHUNK_BATCH_SIZE;

      const batch = this.pending.splice(0, batchSize);

      for (const task of batch) {
        if (this.generation !== currentGeneration) {
          return;
        }

        const element = renderFn(task);
        container.appendChild(element);
        priorityRendered++;
        renderedInBatch++;

        if (renderedInBatch >= YIELD_EVERY_N_TASKS) {
          renderedInBatch = 0;
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }
    }

    this.isProcessing = false;
  }

  clear(): void {
    this.generation++;
    this.pending = [];
    this.isProcessing = false;
  }

  get isEmpty(): boolean {
    return this.pending.length === 0 && !this.isProcessing;
  }

  async renderToFragment(
    tasks: Task[],
    renderFn: (task: Task) => HTMLLIElement,
    yieldDuringRender = true,
  ): Promise<DocumentFragment> {
    const fragment = document.createDocumentFragment();

    for (let i = 0; i < tasks.length; i++) {
      const element = renderFn(tasks[i]);
      fragment.appendChild(element);

      if (yieldDuringRender && i > 0 && i % YIELD_EVERY_N_TASKS === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    return fragment;
  }
}
