LSeq Collaborative Text Editor

A real-time collaborative text editor built using the LSeq (List Sequence) Conflict-Free Replicated Data Type (CRDT). The editor enables multiple users to edit the same document simultaneously while ensuring all document replicas eventually converge to the same state without requiring centralized conflict resolution.

Features

- Real-time collaborative editing
- LSeq CRDT for conflict-free synchronization
- Concurrent multi-user editing
- Automatic conflict resolution
- Character-level operations
- Eventual consistency across replicas
- Low-latency synchronization
- Optional persistent document storage
- Responsive web interface

Overview

This project implements a collaborative text editor where every participant maintains a local replica of the document. Instead of transmitting the entire document after every change, clients exchange only edit operations such as character insertions and deletions.

Each client applies operations locally and propagates them to other collaborators. Since every operation is deterministic and based on immutable identifiers, all replicas eventually converge to the same document regardless of network latency or message ordering.

About LSeq

LSeq is a sequence CRDT designed for collaborative editing applications.

Unlike traditional text editors that identify characters by their array position, LSeq assigns every character a unique position identifier. These identifiers remain stable throughout the lifetime of the document, allowing concurrent edits to be merged consistently across all replicas.

This approach removes the need for operational transformation while naturally supporting distributed and offline editing.

How Synchronization Works

When a user inserts a character, the client generates a new LSeq identifier and inserts the character into its local replica. The insertion operation is then shared with other collaborators, who independently apply the same operation.

When a character is deleted, the operation references the character's identifier rather than its visual position. Every client removes the same identifier, ensuring consistent deletion across replicas.

Because operations reference immutable identifiers instead of mutable indices, concurrent edits can be merged deterministically without conflicts.

Operation Model

Each edit is represented as an operation.

Insert Operation

An insert operation contains:

- Operation type
- Generated LSeq identifier
- Inserted character
- Originating client information

Delete Operation

A delete operation contains:

- Operation type
- Identifier of the deleted character
- Originating client information

Using identifiers instead of array indices allows every replica to process operations independently while producing identical document states.

Why LSeq?

LSeq provides several advantages for collaborative editing:

- No centralized conflict resolution
- Deterministic merging of concurrent edits
- Eventual consistency across replicas
- Support for offline editing and later synchronization
- Efficient handling of concurrent insertions
- Adaptive identifier allocation that limits identifier growth

These properties make LSeq well suited for distributed collaborative applications.

Scalability

LSeq employs an adaptive allocation strategy for generating identifiers, helping keep identifier sizes relatively small even in large or long-lived collaborative documents. This improves both storage efficiency and synchronization performance compared to earlier sequence CRDTs.

Possible Enhancements

Future improvements may include:

- Rich text formatting
- Collaborative cursor and selection sharing
- User presence indicators
- Undo and redo with CRDT support
- Offline-first synchronization
- Version history
- Authentication and authorization
- End-to-end encryption
- Snapshot-based document loading
- CRDT garbage collection

Technologies

This project is designed around modern web technologies and distributed systems concepts, including:

- LSeq CRDT
- WebSockets
- JavaScript or TypeScript
- Node.js
- React or another frontend framework (optional)

References

- Weiss, M., Urso, P., & Molli, P. Logoot: A Scalable Optimistic Replication Algorithm for Collaborative Editing on P2P Networks.
- Nédelec, B., Molli, P., Mostéfaoui, A., & Desmontils, E. LSEQ: An Adaptive Structure for Sequences in Distributed Collaborative Editing.
- Research literature on Conflict-Free Replicated Data Types (CRDTs).

License

This project is licensed under the MIT License.

---

Contributions, feature requests, and bug reports are welcome.