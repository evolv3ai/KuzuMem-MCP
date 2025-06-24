import { RepositoryProvider } from '../../db/repository-provider';

export class ValidationService {
  private repositoryProvider: RepositoryProvider;

  constructor(repositoryProvider: RepositoryProvider) {
    this.repositoryProvider = repositoryProvider;
  }

  public validateRepositoryProvider(methodName: string): void {
    if (!this.repositoryProvider) {
      throw new Error(`RepositoryProvider not initialized in ${methodName}`);
    }
  }

  public validateRequiredParams(
    params: Record<string, any>,
    required: string[],
    methodName: string,
  ): void {
    for (const param of required) {
      if (!params[param]) {
        throw new Error(`Missing required parameter "${param}" in ${methodName}`);
      }
    }
  }

  public handleServiceError(
    error: any,
    methodName: string,
    context: Record<string, any> = {},
    logger: any = console,
  ): void {
    logger.error(`Error in ${methodName}: ${error.message}`, {
      ...context,
      stack: error.stack,
    });
  }
}
