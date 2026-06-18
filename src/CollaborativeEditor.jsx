// src/CollaborativeEditor.jsx
import React, { useEffect, useState, useRef, useCallback } from 'react';

export default function CollaborativeEditor({ roomData }) {
    const [text, setText] = useState("");
    const [isWasmReady, setIsWasmReady] = useState(false);

    const crdtInstance = useRef(null);
    const wsRef        = useRef(null);
    const textAreaRef  = useRef(null);
    // Track the intended cursor position independently of React render cycles.
    const nextCursorPos = useRef(null);

    // ── 1. Initialize WebAssembly CRDT Engine ──────────────────────────────
    useEffect(() => {
        async function loadWasm() {
            try {
                if (!window.createCRDTModule) {
                    throw new Error("WASM script not loaded. Check index.html / public folder.");
                }
                const Module = await window.createCRDTModule();
                crdtInstance.current = new Module.LseqCRDT(roomData.siteId);
                setText(crdtInstance.current.renderText());
                setIsWasmReady(true);
            } catch (error) {
                console.error("Failed to load WASM module:", error);
            }
        }
        loadWasm();

        return () => {
            if (crdtInstance.current) crdtInstance.current.delete();
        };
    }, [roomData.siteId]);

    // ── 2. Setup WebSocket for Real-time Sync ──────────────────────────────
    useEffect(() => {
        if (!isWasmReady) return;

        // [FUTURE BACKEND INTEGRATION]
        // wsRef.current = new WebSocket(`ws://localhost:3000/ws/rooms/${roomData.roomId}`);
        //
        // wsRef.current.onmessage = (event) => {
        //   const msg = JSON.parse(event.data);
        //   if (msg.siteId === roomData.siteId) return; // ignore own echo
        //
        //   if (msg.type === 'remote_insert') {
        //     crdtInstance.current.remoteInsert(msg.lseqId, msg.char);
        //   } else if (msg.type === 'remote_delete') {
        //     crdtInstance.current.remoteDelete(msg.lseqId);
        //   }
        //   setText(crdtInstance.current.renderText());
        // };

        return () => {
            if (wsRef.current) wsRef.current.close();
        };
    }, [isWasmReady, roomData.roomId, roomData.siteId]);

    // ── 3. Restore cursor after React re-render ────────────────────────────
    // FIX: Run after every render so cursor never jumps to the end.
    useEffect(() => {
        if (textAreaRef.current && nextCursorPos.current !== null) {
            textAreaRef.current.selectionStart = nextCursorPos.current;
            textAreaRef.current.selectionEnd   = nextCursorPos.current;
            // Don't clear — keep it set so repeated renders land in the right spot.
        }
    });

    // ── 4. Handle Local Editor Input ───────────────────────────────────────
    // FIX: Use onChange (not onInput) for a React controlled component.
    // FIX: Delete now goes through the CRDT via localDelete() instead of
    //       bypassing it with a raw setText() call.
    const handleChange = useCallback((e) => {
        const newValue   = e.target.value;
        const cursor     = e.target.selectionStart; // position after the edit

        const crdt       = crdtInstance.current;
        const oldText    = crdt.renderText();
        const oldLen     = oldText.length;
        const newLen     = newValue.length;
        const delta      = newLen - oldLen;

        if (delta > 0) {
            // ── Insertion ────────────────────────────────────────────────
            // Characters inserted just before `cursor`.
            const insertStart = cursor - delta;
            for (let i = 0; i < delta; i++) {
                const char   = newValue[insertStart + i];
                const lseqId = crdt.localInsert(insertStart + i, char);

                if (wsRef.current?.readyState === WebSocket.OPEN) {
                    wsRef.current.send(JSON.stringify({
                        type:   'remote_insert',
                        lseqId,
                        char,
                        siteId: roomData.siteId,
                    }));
                }
            }
            nextCursorPos.current = cursor;

        } else if (delta < 0) {
            // ── Deletion ─────────────────────────────────────────────────
            // FIX: call localDelete() so the CRDT B-Tree is kept in sync.
            // The deleted range in the OLD string starts at `cursor`
            // (because the cursor is now just before the gap).
            const deleteCount = -delta;
            for (let i = 0; i < deleteCount; i++) {
                // Delete at the same visual index repeatedly; the tree shifts left.
                const lseqId = crdt.localDelete(cursor);
                if (!lseqId) break; // out-of-range guard

                if (wsRef.current?.readyState === WebSocket.OPEN) {
                    wsRef.current.send(JSON.stringify({
                        type:   'remote_delete',
                        lseqId,
                        siteId: roomData.siteId,
                    }));
                }
            }
            nextCursorPos.current = cursor;
        }

        // Sync React state from the single source of truth: the CRDT.
        setText(crdt.renderText());
    }, [roomData.siteId]);

    // ── Render ─────────────────────────────────────────────────────────────
    if (!isWasmReady) {
        return (
            <div style={{ textAlign: 'center', marginTop: '50px' }}>
                Loading C++ CRDT Engine…
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '60vh' }}>
            <textarea
                ref={textAreaRef}
                value={text}
                onChange={handleChange}   /* FIX: onChange, not onInput */
                style={{
                    flex: 1,
                    padding: '20px',
                    fontSize: '16px',
                    lineHeight: '1.5',
                    fontFamily: 'monospace',
                    border: '1px solid #ccc',
                    borderRadius: '8px',
                    resize: 'none',
                    outline: 'none',
                }}
                placeholder="Start typing to generate LSEQ operations…"
            />
        </div>
    );
}