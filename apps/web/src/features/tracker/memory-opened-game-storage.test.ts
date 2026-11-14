import { createMemoryOpenedGameStorage } from './memory-opened-game-storage.ts';
import { openedGameStorageContract } from './opened-game-storage-contract.test-helper.ts';

openedGameStorageContract('in-memory storage', async () => createMemoryOpenedGameStorage());
