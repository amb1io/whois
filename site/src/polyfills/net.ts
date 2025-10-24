type NetModule = typeof import("node:net");

let SocketCtor: NetModule["Socket"];
let createConnectionFn: NetModule["createConnection"];
let connectFn: NetModule["connect"];

try {
  const netModule: NetModule = await import("node:net");
  SocketCtor = netModule.Socket;
  createConnectionFn = netModule.createConnection.bind(netModule);
  connectFn = netModule.connect.bind(netModule);
} catch {
  class UnsupportedSocket {
    constructor() {
      throw new Error("net.Socket is not supported in this runtime.");
    }
    setTimeout() {
      /* noop */
    }
  }

  SocketCtor = UnsupportedSocket as unknown as NetModule["Socket"];
  createConnectionFn = (() => {
    throw new Error("net.createConnection is not available in this runtime.");
  }) as NetModule["createConnection"];
  connectFn = createConnectionFn as NetModule["connect"];
}

export const Socket = SocketCtor;
export const createConnection = createConnectionFn;
export const connect = connectFn;

export default {
  Socket,
  createConnection,
  connect,
};
