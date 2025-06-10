/**
 * Thread-safe mutex implementation
 * Used for ensuring singleton instances are created safely
 */
export class Mutex {
  private _locking: Promise<void> = Promise.resolve();
  private _locked = false;

  async acquire(): Promise<() => void> {
    // Wait for any previous lock to be released
    const waitForPreviousLock = this._locking.then(() => {
      this._locked = true;
    });

    // Set up the next lock
    let resolver: () => void;
    this._locking = new Promise<void>((resolve) => {
      resolver = resolve;
    });

    // Create release function
    const releaseFunction = (): void => {
      this._locked = false;
      resolver();
    };

    // Wait for previous lock and return the release function
    await waitForPreviousLock;
    return releaseFunction;
  }

  get locked(): boolean {
    return this._locked;
  }
}
