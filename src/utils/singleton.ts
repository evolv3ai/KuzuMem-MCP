/**
 * Thread-safe Singleton Metaclass implementation
 * Uses TypeScript design patterns to ensure singleton behavior
 */
// import threading from 'node:worker_threads'; // This import was present but not used
import { Mutex } from './mutex'; // Import Mutex from the dedicated file

/**
 * Singleton metaclass implementation
 * Following the user's Python best practices adapted to TypeScript
 */
export class SingletonMeta {
  private static _instances: Record<string, any> = {};
  private static _lock = new Mutex(); // Use the imported Mutex

  static async getInstance<T>(
    classConstructor: new (...args: any[]) => T,
    ...args: any[]
  ): Promise<T> {
    const className = classConstructor.name;

    const release = await SingletonMeta._lock.acquire();

    try {
      if (!SingletonMeta._instances[className]) {
        SingletonMeta._instances[className] = new classConstructor(...args);
      }

      return SingletonMeta._instances[className] as T;
    } finally {
      release();
    }
  }
}
