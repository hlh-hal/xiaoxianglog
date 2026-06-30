import { api } from '../../services/apiClient';

export interface PublishDiaryPostInput {
  entryId?: string;
  content: string;
  images: string[];
}

/** 社区发布接口适配器，避免 Editor 直接依赖 HTTP 路径。 */
export function publishDiaryPost(input: PublishDiaryPostInput) {
  return api.post('/community/posts', input);
}
