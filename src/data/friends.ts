export interface Friend {
  id: string;
  name: string;
  avatar: string | null;
  monthCount: number;
  joinedAt?: string;
  likes?: number;
  isCurrentUser?: boolean;
}

export const MOCK_FRIENDS: Friend[] = [
  { id: 'f1', name: '旅行者', avatar: null, monthCount: 23, likes: 156, isCurrentUser: false },
  { id: 'f2', name: '深夜书房', avatar: null, monthCount: 18, likes: 89, isCurrentUser: false },
  { id: 'f3', name: '向阳生长', avatar: null, monthCount: 12, likes: 234, isCurrentUser: false },
  { id: 'f4', name: '晴天', avatar: null, monthCount: 7, likes: 45, isCurrentUser: false },
  { id: 'f5', name: '微风拂面', avatar: null, monthCount: 5, likes: 12, isCurrentUser: false },
  { id: 'f6', name: '星河漫步', avatar: null, monthCount: 3, likes: 8, isCurrentUser: false },
  { id: 'f7', name: '慢慢来', avatar: null, monthCount: 0, likes: 0, isCurrentUser: false },
  { id: 'f8', name: '安静角落', avatar: null, monthCount: 0, likes: 0, isCurrentUser: false },
];
