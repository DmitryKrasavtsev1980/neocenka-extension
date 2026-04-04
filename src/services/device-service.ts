const DEVICE_ID_KEY = 'ret_device_id';

export async function getDeviceId(): Promise<string> {
  return new Promise((resolve) => {
    chrome.storage.local.get(DEVICE_ID_KEY, (result: any) => {
      const stored = result?.[DEVICE_ID_KEY];
      if (stored) {
        resolve(stored as string);
        return;
      }

      const newId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return c === 'x' ? r.toString(16) : (r & 0x3 | 0x8).toString(16);
      });
      chrome.storage.local.set({ [DEVICE_ID_KEY]: newId }, () => {
        resolve(newId);
      });
    });
  });
}
