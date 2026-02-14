type QueueTask<T> = () => Promise<T>;

export class CommandQueue {
  private chain: Promise<unknown> = Promise.resolve();
  private lastPowerCommandAt = 0;
  private queuedPowerCommands = 0;

  constructor(
    private readonly minPowerIntervalMs: number = 500,
    private readonly now: () => number = () => Date.now(),
  ) {}

  enqueue<T>(task: QueueTask<T>): Promise<T> {
    const next = this.chain.then(task, task);
    this.chain = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  enqueuePowerCommand<T>(task: QueueTask<T>): Promise<T> {
    this.queuedPowerCommands += 1;
    return this.enqueue(async () => {
      this.queuedPowerCommands = Math.max(0, this.queuedPowerCommands - 1);
      const elapsed = this.now() - this.lastPowerCommandAt;
      if (elapsed < this.minPowerIntervalMs) {
        await new Promise<void>((resolve) =>
          setTimeout(resolve, this.minPowerIntervalMs - elapsed),
        );
      }
      const result = await task();
      this.lastPowerCommandAt = this.now();
      return result;
    });
  }
}
