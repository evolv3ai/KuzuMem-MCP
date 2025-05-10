/**
 * Thread-safe Singleton Metaclass implementation
 * Uses TypeScript design patterns to ensure singleton behavior
 */
import threading from 'node:worker_threads';

/**
 * Simple mutex implementation for thread safety
 */
class Mutex {
  private _locking: Promise<void> = Promise.resolve();
  private _locked = false;

  async acquire(): Promise<() => void> {
    // Create a new promise that will be resolved when the lock is released
    let releaseFunction: () => void;
    
    // Wait for any previous lock to be released
    const waitForPreviousLock = this._locking.then(() => {
      this._locked = true;
    });
    
    // Set up the next lock
    let resolver: () => void;
    this._locking = new Promise<void>(resolve => {
      resolver = resolve;
    });
    
    // Create release function
    releaseFunction = () => {
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

/**
 * Singleton metaclass implementation
 * Following the user's Python best practices adapted to TypeScript
 */
export class SingletonMeta {
  private static _instances: Record<string, any> = {};
  private static _lock = new Mutex();

  static async getInstance<T>(
    classConstructor: new (...args: any[]) => T,
    ...args: any[]
  ): Promise<T> {
    const className = classConstructor.name;
    
    // Acquire lock for thread safety
    const release = await SingletonMeta._lock.acquire();
    
    try {
      if (!SingletonMeta._instances[className]) {
        SingletonMeta._instances[className] = new classConstructor(...args);
      }
      
      return SingletonMeta._instances[className] as T;
    } finally {
      // Always release the lock
      release();
    }
  }
}
