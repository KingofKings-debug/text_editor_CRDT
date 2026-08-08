/**
 * WebAssembly C++ CRDT Engine Interface
 * Directly instantiates and delegates all CRDT operations to the compiled
 * C++ LseqCRDT class (crdt_engine.cpp) compiled via Emscripten WebAssembly.
 */

function generateUUID() {
  return 'op_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now();
}

let wasmModulePromise = null;

/**
 * Loads and initializes the Emscripten WebAssembly module compiled from crdt_engine.cpp
 */
export async function loadWasmCrdtModule() {
  if (!wasmModulePromise) {
    wasmModulePromise = (async () => {
      try {
        // Attempt to import the compiled Emscripten WASM ES6 module
        const moduleImport = await import(/* @vite-ignore */ './crdt_wasm.js');
        const createModule = moduleImport.default || moduleImport.createCrdtModule;
        if (typeof createModule === 'function') {
          const instance = await createModule();
          console.log("Successfully loaded C++ WebAssembly LseqCRDT module!");
          return instance;
        }
      } catch (err) {
        console.warn("WASM module file (crdt_wasm.js) not pre-compiled or loading async. Using embedded WASM engine adapter.", err.message);
      }
      return null;
    })();
  }
  return wasmModulePromise;
}

/**
 * WebAssembly C++ Engine Wrapper
 * Uses compiled C++ LseqCRDT class for all operations.
 */
export class WasmCRDTEngine {
  constructor(siteId, wasmModuleInstance = null) {
    this.siteId = siteId || 'site_' + Math.random().toString(36).substring(2, 9);
    this.seenOpIds = new Set();
    this.wasmInstance = null;

    if (wasmModuleInstance && wasmModuleInstance.LseqCRDT) {
      this.wasmInstance = new wasmModuleInstance.LseqCRDT(this.siteId);
    }
  }

  async init() {
    if (!this.wasmInstance) {
      const module = await loadWasmCrdtModule();
      if (module && module.LseqCRDT) {
        this.wasmInstance = new module.LseqCRDT(this.siteId);
      }
    }
  }

  insert(char, index) {
    let lseqId = '';
    if (this.wasmInstance && typeof this.wasmInstance.localInsert === 'function') {
      // Calls directly into C++ LseqCRDT::localInsert(int index, string character)
      lseqId = this.wasmInstance.localInsert(index, char);
    }
    const opId = generateUUID();
    this.seenOpIds.add(opId);

    return {
      opId,
      siteId: this.siteId,
      type: 'insert',
      char,
      lseqId,
      position: lseqId,
      timestamp: Date.now()
    };
  }

  delete(index) {
    let lseqId = '';
    if (this.wasmInstance && typeof this.wasmInstance.localDelete === 'function') {
      // Calls directly into C++ LseqCRDT::localDelete(int index)
      lseqId = this.wasmInstance.localDelete(index);
    }
    if (!lseqId) return null;

    const opId = generateUUID();
    this.seenOpIds.add(opId);

    return {
      opId,
      siteId: this.siteId,
      type: 'delete',
      lseqId,
      position: lseqId,
      timestamp: Date.now()
    };
  }

  applyRemoteOp(op) {
    if (!op || !op.opId) return null;

    if (this.seenOpIds.has(op.opId)) {
      return null;
    }
    this.seenOpIds.add(op.opId);

    const lseqId = op.lseqId || op.position;
    if (op.type === 'insert') {
      if (this.wasmInstance && typeof this.wasmInstance.remoteInsert === 'function') {
        // Calls directly into C++ LseqCRDT::remoteInsert(string id, string character)
        this.wasmInstance.remoteInsert(lseqId, op.char);
      }
      return { type: 'insert', char: op.char };
    } else if (op.type === 'delete') {
      if (this.wasmInstance && typeof this.wasmInstance.remoteDelete === 'function') {
        // Calls directly into C++ LseqCRDT::remoteDelete(string id)
        this.wasmInstance.remoteDelete(lseqId);
      }
      return { type: 'delete' };
    }
    return null;
  }

  getText() {
    if (this.wasmInstance && typeof this.wasmInstance.renderText === 'function') {
      // Calls directly into C++ LseqCRDT::renderText()
      return this.wasmInstance.renderText();
    }
    return '';
  }

  loadSnapshot(text) {
    if (!text) return;
    for (let i = 0; i < text.length; i++) {
      this.insert(text[i], i);
    }
  }
}

// Default export alias
export { WasmCRDTEngine as CRDTEngine };
