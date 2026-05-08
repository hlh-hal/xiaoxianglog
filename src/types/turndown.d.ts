declare module 'turndown' {
  export default class TurndownService {
    constructor(options?: Record<string, unknown>);
    use(plugin: unknown): this;
    addRule(key: string, rule: Record<string, unknown>): this;
    turndown(input: string): string;
  }
}

declare module 'turndown-plugin-gfm' {
  export const gfm: unknown;
}
