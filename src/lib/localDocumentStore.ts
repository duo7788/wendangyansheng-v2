import { DocItem } from '../types';

const DATABASE_NAME = 'wendangyansheng-local-documents';
const STORE_NAME = 'documents';
const DATABASE_VERSION = 1;

export interface LocalDocumentRecord {
  libraryId: string;
  document: DocItem;
}

const openDatabase = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
  const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
  request.onerror = () => reject(request.error || new Error('无法打开本地文档存储'));
  request.onupgradeneeded = () => {
    const database = request.result;
    if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME, { keyPath: 'document.id' });
  };
  request.onsuccess = () => resolve(request.result);
});

const withStore = async <T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) => {
  const database = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const request = action(transaction.objectStore(STORE_NAME));
    request.onerror = () => reject(request.error || new Error('本地文档存储失败'));
    request.onsuccess = () => resolve(request.result);
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => database.close();
  });
};

export const readLocalDocuments = () => withStore<LocalDocumentRecord[]>('readonly', store => store.getAll());

export const saveLocalDocument = (record: LocalDocumentRecord) => withStore<IDBValidKey>('readwrite', store => store.put(record));
