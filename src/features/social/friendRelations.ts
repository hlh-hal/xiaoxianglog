export type FriendStatus = 'none' | 'pending' | 'accepted' | 'declined';

const FRIEND_RELATIONS_KEY = 'xiang_friend_relations';

function readRelations(): Record<string, FriendStatus> {
  try {
    const parsed = JSON.parse(localStorage.getItem(FRIEND_RELATIONS_KEY) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export const friendRelations = {
  get(userId: string, serverStatus?: FriendStatus): FriendStatus {
    if (serverStatus) return serverStatus;
    return readRelations()[userId] || 'none';
  },

  set(userId: string, status: FriendStatus): void {
    const relations = readRelations();
    relations[userId] = status;
    localStorage.setItem(FRIEND_RELATIONS_KEY, JSON.stringify(relations));
  },
};
