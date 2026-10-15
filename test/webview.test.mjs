import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const { render } = createRequire(import.meta.url)('../src/table.cjs');

// Minimal DOM surface used by the reconciler, keeping node identity observable.
class Element {
  constructor(tag, key, text) {
    this.nodeType = tag === '#text' ? 3 : 1;
    this.nodeName = this.tagName = tag;
    this.dataset = key ? { key } : {};
    this.attrs = new Map(key ? [['data-key', key]] : []);
    this.childNodes = [];
    this.data = text;
  }
  get attributes() { return [...this.attrs].map(([name, value]) => ({ name, value })); }
  get firstChild() { return this.childNodes[0] ?? null; }
  get nextSibling() { return this.parent?.childNodes[this.parent.childNodes.indexOf(this) + 1] ?? null; }
  hasAttribute(name) { return this.attrs.has(name); }
  getAttribute(name) { return this.attrs.get(name) ?? null; }
  setAttribute(name, value) { this.attrs.set(name, value); }
  removeAttribute(name) { this.attrs.delete(name); }
  insertBefore(node, cursor) {
    node.remove();
    const index = cursor ? this.childNodes.indexOf(cursor) : this.childNodes.length;
    this.childNodes.splice(index, 0, node); node.parent = this;
  }
  remove() {
    if (this.parent) this.parent.childNodes.splice(this.parent.childNodes.indexOf(this), 1);
    this.parent = undefined;
  }
  cloneNode() {
    const node = new Element(this.tagName, this.dataset.key, this.data);
    node.attrs = new Map(this.attrs);
    for (const child of this.childNodes) node.insertBefore(child.cloneNode(), null);
    return node;
  }
}
const page = (keys, text = 'unchanged') => {
  const main = new Element('MAIN');
  for (const key of keys) {
    const details = new Element('DETAILS', key);
    details.insertBefore(new Element('#text', undefined, text), null);
    main.insertBefore(details, null);
  }
  return main;
};

test('live webview updates preserve keyed details nodes and defer changes while selecting text', () => {
  const html = render([], 'Ready');
  const script = html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)[1];
  const current = page(['a', 'b']);
  const [a, b] = current.childNodes;
  a.setAttribute('open', '');
  let selecting = false, incoming, parses = 0;
  const windowListeners = {}, documentListeners = {}, messages = [];
  const context = vm.createContext({
    Node: { TEXT_NODE: 3, ELEMENT_NODE: 1 },
    acquireVsCodeApi: () => ({ postMessage: message => messages.push(message) }),
    window: { getSelection: () => ({ isCollapsed: !selecting }),
      addEventListener: (type, listener) => { windowListeners[type] = listener; } },
    document: { querySelector: () => current, querySelectorAll: () => [],
      addEventListener: (type, listener) => { documentListeners[type] = listener; } },
    DOMParser: class { parseFromString() { parses++; return { querySelector: () => incoming }; } },
    setInterval: () => {},
  });
  vm.runInContext(script, context);
  assert.equal(messages[0].command, 'ready');
  incoming = page(['b', 'a', 'c']);
  windowListeners.message({ data: { command: 'updateResults', html: 'snapshot' } });
  assert.equal(current.childNodes[0], b);
  assert.equal(current.childNodes[1], a);
  assert.equal(a.hasAttribute('open'), true);
  assert.equal(b.hasAttribute('open'), false);
  assert.equal(current.childNodes.length, 3);
  const textNode = a.firstChild;
  selecting = true;
  incoming = page(['a'], 'changed');
  windowListeners.message({ data: { command: 'updateResults', html: 'latest snapshot' } });
  assert.equal(parses, 1);
  assert.equal(a.firstChild.data, 'unchanged');
  selecting = false;
  documentListeners.selectionchange();
  assert.equal(current.firstChild, a);
  assert.equal(a.firstChild, textNode);
  assert.equal(textNode.data, 'changed');
  assert.equal(a.hasAttribute('open'), true);
  assert.equal(current.childNodes.length, 1);
});
