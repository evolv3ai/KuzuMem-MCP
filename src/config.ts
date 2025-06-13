export interface Config {
  dbName: string;
  version: string;
}

export const defaultConfig: Config = {
  dbName: 'kuzumem',
  version: '3.0.0',
};
