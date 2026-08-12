#include <emscripten/bind.h>
#include <string>
#include <vector>
#include <cstdlib>
#include <ctime>
#include <iostream>
#include <sstream>
#include <iomanip>
#include <algorithm>

using namespace emscripten;

// --- LSEQ ALTERNATING SEQUENCE GENERATOR ---

class LseqGenerator {
private:
    std::string siteId;

    // Split a dot-separated LSEQ ID into its integer components.
    // Each segment looks like "00007-siteId"; stoi() stops at '-' so no substr needed.
    std::vector<int> parseId(const std::string& id) {
        std::vector<int> digits;
        if (id == "0" || id == "~") return digits; // boundary sentinels have no digits

        std::stringstream ss(id);
        std::string item;
        while (std::getline(ss, item, '.')) {
            // stoi stops at the first non-numeric char, so "00007-siteId" -> 7
            digits.push_back(std::stoi(item));
        }
        return digits;
    }

    // Zero-pad to 5 digits so lexicographic order == numeric order.
    std::string formatDigit(int digit) {
        std::stringstream ss;
        ss << std::setw(5) << std::setfill('0') << digit;
        return ss.str();
    }

public:
    LseqGenerator(std::string site) : siteId(site) {
        std::srand(std::time(nullptr));
    }

    std::string generateId(const std::string& leftId, const std::string& rightId) {
        std::vector<int> p = parseId(leftId);
        std::vector<int> q = parseId(rightId);

        std::string newId;
        int depth = 0;

        while (true) {
            // Range within which we can allocate at this depth.
            // If a boundary is absent at this depth, use 0 (left) or 10000 (right).
            int leftDigit  = (depth < (int)p.size()) ? p[depth] : 0;
            int rightDigit = (depth < (int)q.size()) ? q[depth] : 10000;

            int interval = rightDigit - leftDigit - 1;

            if (interval > 0) {
                int step = std::min(interval, 10); // LSEQ step cap
                int newDigit;

                // ALTERNATING STRATEGY
                if (depth % 2 == 0) {
                    // Boundary+: allocate from the left end of the gap
                    newDigit = leftDigit + (std::rand() % step) + 1;
                } else {
                    // Boundary-: allocate from the right end of the gap
                    newDigit = rightDigit - (std::rand() % step) - 1;
                }

                // Build the full dot-separated ID including all ancestor segments.
                // Ancestors come from the LEFT path (p), defaulting to 0 if p is shorter.
                for (int i = 0; i < depth; i++) {
                    int d = (i < (int)p.size()) ? p[i] : 0;
                    newId += formatDigit(d) + "-" + siteId + ".";
                }
                newId += formatDigit(newDigit) + "-" + siteId;
                break;
            }
            depth++;
        }
        return newId;
    }
};

// --- OPTIMIZED B-TREE IMPLEMENTATION ---

struct BTreeNode {
    std::vector<std::string> keys;   // LSEQ identifiers
    std::vector<std::string> values; // characters; "" means tombstoned / deleted
    std::vector<BTreeNode*> children;
    bool isLeaf;

    BTreeNode(bool leaf) : isLeaf(leaf) {}
};

class BTree {
private:
    BTreeNode* root;
    int t; // minimum degree

    // FIX: save the median key/value BEFORE resizing fullChild, so we never
    // read out-of-bounds after the vector is truncated.
    void splitChild(BTreeNode* parent, int i, BTreeNode* fullChild) {
        // --- save median first ---
        std::string medianKey   = fullChild->keys[t - 1];
        std::string medianValue = fullChild->values[t - 1];

        BTreeNode* newNode = new BTreeNode(fullChild->isLeaf);

        // Upper half of fullChild (keys[t .. 2t-2]) goes to newNode
        for (int j = 0; j < t - 1; j++) {
            newNode->keys.push_back(fullChild->keys[j + t]);
            newNode->values.push_back(fullChild->values[j + t]);
        }
        if (!fullChild->isLeaf) {
            for (int j = 0; j < t; j++) {
                newNode->children.push_back(fullChild->children[j + t]);
            }
            fullChild->children.resize(t);
        }

        // Truncate fullChild to lower half (keys[0 .. t-2])
        fullChild->keys.resize(t - 1);
        fullChild->values.resize(t - 1);

        // Attach newNode and promote saved median to parent
        parent->children.insert(parent->children.begin() + i + 1, newNode);
        parent->keys.insert(parent->keys.begin() + i, medianKey);
        parent->values.insert(parent->values.begin() + i, medianValue);
    }

    void insertNonFull(BTreeNode* node, const std::string& key, const std::string& value) {
        int i = (int)node->keys.size() - 1;

        if (node->isLeaf) {
            node->keys.push_back("");
            node->values.push_back("");
            while (i >= 0 && key < node->keys[i]) {
                node->keys[i + 1]   = node->keys[i];
                node->values[i + 1] = node->values[i];
                i--;
            }
            node->keys[i + 1]   = key;
            node->values[i + 1] = value;
        } else {
            while (i >= 0 && key < node->keys[i]) i--;
            i++;
            if ((int)node->children[i]->keys.size() == 2 * t - 1) {
                splitChild(node, i, node->children[i]);
                if (key > node->keys[i]) i++;
            }
            insertNonFull(node->children[i], key, value);
        }
    }

    void inOrderTraversal(BTreeNode* node, std::string& result,
                          std::vector<std::string>& activeKeys) {
        if (!node) return;
        for (int i = 0; i < (int)node->keys.size(); i++) {
            if (!node->isLeaf) inOrderTraversal(node->children[i], result, activeKeys);
            if (node->values[i] != "") {           // skip tombstoned entries
                result += node->values[i];
                activeKeys.push_back(node->keys[i]);
            }
        }
        if (!node->isLeaf)
            inOrderTraversal(node->children[node->keys.size()], result, activeKeys);
    }

    BTreeNode* search(BTreeNode* node, const std::string& key, int& index) {
        int i = 0;
        while (i < (int)node->keys.size() && key > node->keys[i]) i++;
        if (i < (int)node->keys.size() && key == node->keys[i]) {
            index = i;
            return node;
        }
        if (node->isLeaf) return nullptr;
        return search(node->children[i], key, index);
    }

public:
    BTree(int degree) : t(degree) {
        root = new BTreeNode(true);
    }

    void insert(const std::string& key, const std::string& value) {
        if ((int)root->keys.size() == 2 * t - 1) {
            BTreeNode* newRoot = new BTreeNode(false);
            newRoot->children.push_back(root);
            splitChild(newRoot, 0, root);
            root = newRoot;
        }
        insertNonFull(root, key, value);
    }

    // Tombstone deletion: mark the value empty without restructuring the tree.
    void tombstoneDelete(const std::string& key) {
        int index;
        BTreeNode* node = search(root, key, index);
        if (node) node->values[index] = "";
    }

    std::string render(std::vector<std::string>& activeKeys) {
        std::string result;
        inOrderTraversal(root, result, activeKeys);
        return result;
    }
};

// --- CRDT FACADE FOR JAVASCRIPT ---

class LseqCRDT {
private:
    BTree          documentTree;
    LseqGenerator  generator;

    // Cached flat key list so JS can map a visual index to an LSEQ id for deletion.
    std::vector<std::string> cachedKeys;

public:
    // t=50 keeps the tree extremely shallow even for large documents.
    LseqCRDT(std::string site) : generator(site), documentTree(50) {
        // Sentinel boundaries: "0" sorts before all real IDs, "~" sorts after.
        documentTree.insert("0", "");
        documentTree.insert("~", "");
    }

    // Insert a character at the given visible index.
    // Returns the generated LSEQ ID (broadcast this to remote peers).
    std::string localInsert(int index, const std::string& character) {
        cachedKeys.clear();
        documentTree.render(cachedKeys);

        std::string leftId  = (index <= 0)
                                  ? "0"
                                  : cachedKeys[index - 1];
        std::string rightId = (index >= (int)cachedKeys.size())
                                  ? "~"
                                  : cachedKeys[index];

        std::string newId = generator.generateId(leftId, rightId);
        documentTree.insert(newId, character);
        return newId;
    }

    // Delete the character at the given visible index.
    // Returns the tombstoned LSEQ ID (broadcast this to remote peers).
    // FIX: expose this so JavaScript no longer has to bypass the CRDT for deletes.
    std::string localDelete(int index) {
        cachedKeys.clear();
        documentTree.render(cachedKeys);

        if (index < 0 || index >= (int)cachedKeys.size()) return "";

        std::string id = cachedKeys[index];
        documentTree.tombstoneDelete(id);
        return id;
    }

    void remoteInsert(const std::string& id, const std::string& character) {
        documentTree.insert(id, character);
    }

    void remoteDelete(const std::string& id) {
        documentTree.tombstoneDelete(id);
    }

    std::string renderText() {
        cachedKeys.clear();
        return documentTree.render(cachedKeys);
    }
};

// --- EMSCRIPTEN WASM BINDINGS ---

EMSCRIPTEN_BINDINGS(crdt_module) {
    class_<LseqCRDT>("LseqCRDT")
        .constructor<std::string>()
        .function("localInsert",  &LseqCRDT::localInsert)
        .function("localDelete",  &LseqCRDT::localDelete)   // new — fixes delete bug
        .function("remoteInsert", &LseqCRDT::remoteInsert)
        .function("remoteDelete", &LseqCRDT::remoteDelete)
        .function("renderText",   &LseqCRDT::renderText);
}
