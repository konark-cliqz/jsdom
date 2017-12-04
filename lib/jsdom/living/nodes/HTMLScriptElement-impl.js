"use strict";
const whatwgEncoding = require("whatwg-encoding");

const HTMLElementImpl = require("./HTMLElement-impl").implementation;
const { reflectURLAttribute } = require("../../utils");
const resourceLoader = require("../../browser/resource-loader");
const { domSymbolTree } = require("../helpers/internal-constants");
const nodeTypes = require("../node-type");

class HTMLScriptElementImpl extends HTMLElementImpl {
  _attach() {
    super._attach();
    if (this.src) {
      resourceLoader.load(
        this,
        this.src,
        { defaultEncoding: whatwgEncoding.labelToName(this.getAttribute("charset")) || this._ownerDocument._encoding },
        this._eval
      );
    } else if (this.text.trim().length > 0) {
      resourceLoader.enqueue(this, this._ownerDocument.URL, this._eval)(null, this.text);
    }
  }

  _attrModified(name, value, oldValue) {
    super._attrModified(name, value, oldValue);

    if (this._attached && name === "src" && oldValue === null && value !== null) {
      resourceLoader.load(
        this,
        this.src,
        { defaultEncoding: whatwgEncoding.labelToName(this.getAttribute("charset")) || this._ownerDocument._encoding },
        this._eval
      );
    }
  }

  _eval() {
  }

  _getTypeString() {
    const typeAttr = this.getAttribute("type");
    const langAttr = this.getAttribute("language");

    if (typeAttr === "") {
      return "text/javascript";
    }

    if (typeAttr === null && langAttr === "") {
      return "text/javascript";
    }

    if (typeAttr === null && langAttr === null) {
      return "text/javascript";
    }

    if (typeAttr !== null) {
      return typeAttr.trim();
    }

    if (langAttr !== null) {
      return "text/" + langAttr;
    }

    return null;
  }

  get text() {
    let text = "";
    for (const child of domSymbolTree.childrenIterator(this)) {
      if (child.nodeType === nodeTypes.TEXT_NODE) {
        text += child.nodeValue;
      }
    }
    return text;
  }

  set text(text) {
    this.textContent = text;
  }

  get src() {
    return reflectURLAttribute(this, "src");
  }

  set src(V) {
    this.setAttribute("src", V);
  }
}

module.exports = {
  implementation: HTMLScriptElementImpl
};
