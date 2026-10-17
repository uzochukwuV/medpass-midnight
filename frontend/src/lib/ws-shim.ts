// `isomorphic-ws`'s browser build only default-exports WebSocket, so Midnight's
// named `import { WebSocket } from 'isomorphic-ws'` resolves to undefined and
// Rollup warns. We pass the platform WebSocket to indexerPublicDataProvider
// explicitly; this shim keeps the named import well-defined for any other
// consumer of the package in the bundle.

const WS = globalThis.WebSocket;

export { WS as WebSocket };
export default WS;
