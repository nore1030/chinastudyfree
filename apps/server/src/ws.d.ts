/**
 * ws.d.ts —— 运行时依赖 `ws` 的最小类型声明。
 *
 * 为什么手写而不装 @types/ws：
 *   服务端产物要求「自包含单文件、运行时零 node_modules」（见 build.mjs），
 *   而 edge-tts.ts 只用到 ws 的一小部分 API。这里按实际用法声明，
 *   仅供 tsc 类型检查使用，esbuild 打包时整体擦除，不进产物。
 */

declare module "ws" {
  export interface WebSocketConnectOptions {
    host?: string;
    origin?: string;
    headers?: Record<string, string>;
  }

  export interface WebSocketSendOptions {
    compress?: boolean;
  }

  export class WebSocket {
    constructor(url: string, options?: WebSocketConnectOptions);

    send(
      data: string | Buffer,
      options?: WebSocketSendOptions,
      callback?: (err?: Error | null) => void,
    ): void;

    close(): void;

    on(
      event: "message",
      listener: (data: Buffer, isBinary: boolean) => void,
    ): this;
    on(event: "open", listener: () => void): this;
    on(event: "error", listener: (err: Error) => void): this;
    on(
      event: "close",
      listener: (code: number, reason: Buffer) => void,
    ): this;
  }
}
