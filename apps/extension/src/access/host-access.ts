export interface HostAccess {
  granted(): Promise<string[]>;
  request(origins: string[]): Promise<boolean>;
  remove(origins: string[]): Promise<boolean>;
}

export const chromeHostAccess: HostAccess = {
  granted: async () => (await chrome.permissions.getAll()).origins ?? [],
  request: (origins) => chrome.permissions.request({ origins }),
  remove: (origins) => chrome.permissions.remove({ origins }),
};
