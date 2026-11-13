import { createMemoryQueueStorage } from './memory-queue-storage.ts';
import { queueStorageContract } from './queue-storage-contract.test-helper.ts';

queueStorageContract('memory storage', async () => createMemoryQueueStorage());
