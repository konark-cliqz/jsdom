"use strict";

const parseContentType = require("content-type-parser");
const sniffHTMLEncoding = require("html-encoding-sniffer");
const whatwgEncoding = require("whatwg-encoding");
const { parseDataUrl } = require("../utils");
const { documentBaseURLSerialized } = require("../living/helpers/document-base-url");
const NODE_TYPE = require("../living/node-type");

/* eslint-disable no-restricted-modules */
// TODO: stop using the built-in URL in favor of the spec-compliant whatwg-url package
// This legacy usage is in the process of being purged.
const URL = require("url");
/* eslint-enable no-restricted-modules */

function createResourceLoadHandler(element, resourceUrl, document, loadCallback) {
  if (loadCallback === undefined) {
    loadCallback = () => {
      // do nothing
    };
  }
  return (err, data, response) => {
    const ev = document.createEvent("HTMLEvents");

    if (!err) {
      try {
        loadCallback.call(element, data, resourceUrl, response);
        ev.initEvent("load", false, false);
      } catch (e) {
        err = e;
      }
    }

    if (err) {
      if (!err.isAbortError) {
        ev.initEvent("error", false, false);
        ev.error = err;
        element.dispatchEvent(ev);

        const error = new Error(`Could not load ${element.localName}: "${resourceUrl}"`);
        error.detail = err;
        error.type = "resource loading";

        document._defaultView._virtualConsole.emit("jsdomError", error);
      }
    } else {
      element.dispatchEvent(ev);
    }
  };
}

exports.readFile = function () {
  throw new Error("unsupported readFile");
};

function readDataUrl(dataUrl, { defaultEncoding, detectMetaCharset }, callback) {
  try {
    const data = parseDataUrl(dataUrl);
    // If default encoding does not exist, pass on binary data.
    if (defaultEncoding) {
      const contentType = parseContentType(data.type) || parseContentType("text/plain");
      const sniffOptions = {
        transportLayerEncodingLabel: contentType.get("charset"),
        defaultEncoding
      };

      const encoding = detectMetaCharset ?
                       sniffHTMLEncoding(data.buffer, sniffOptions) :
                       whatwgEncoding.getBOMEncoding(data.buffer) ||
                        whatwgEncoding.labelToName(contentType.get("charset")) ||
                        defaultEncoding;
      const decoded = whatwgEncoding.decode(data.buffer, encoding);

      contentType.set("charset", encoding);
      data.type = contentType.toString();

      callback(null, decoded, { headers: { "content-type": data.type } });
    } else {
      callback(null, data.buffer, { headers: { "content-type": data.type } });
    }
  } catch (err) {
    callback(err, null);
  }
  return null;
}

// NOTE: request wraps tough-cookie cookie jar
// (see: https://github.com/request/request/blob/master/lib/cookies.js).
// Therefore, to pass our cookie jar to the request, we need to create
// request's wrapper and monkey patch it with our jar.
exports.wrapCookieJarForRequest = () => {
  throw new Error("unsupported wrapCookieJarForRequest");
};

function fetch(urlObj, options, callback) {
  if (urlObj.protocol === "data:") {
    return readDataUrl(urlObj.href, options, callback);
  } else if (urlObj.hostname) {
    return exports.download(urlObj, options, callback);
  }
  const filePath = urlObj.pathname
    .replace(/^file:\/\//, "")
    .replace(/^\/([a-z]):\//i, "$1:/")
    .replace(/%20/g, " ");
  return exports.readFile(filePath, options, callback);
}

exports.enqueue = function (element, resourceUrl, callback) {
  const document = element.nodeType === NODE_TYPE.DOCUMENT_NODE ? element : element._ownerDocument;

  if (document._queue) {
    const loadHandler = createResourceLoadHandler(element, resourceUrl || document.URL, document, callback);
    return document._queue.push(loadHandler);
  }

  return () => {
    // do nothing in queue-less documents
  };
};

exports.download = function () {
  throw new Error("unsupported download");
};

exports.load = function (element, urlString, options, callback) {
  const document = element._ownerDocument;
  const documentImpl = document.implementation;

  if (!documentImpl._hasFeature("FetchExternalResources", element.tagName.toLowerCase())) {
    return;
  }

  if (documentImpl._hasFeature("SkipExternalResources", urlString)) {
    return;
  }

  const urlObj = URL.parse(urlString);
  const enqueued = exports.enqueue(element, urlString, callback);
  const customLoader = document._customResourceLoader;
  const requestManager = document._requestManager;
  const cookieJar = document._cookieJar;

  options.accept = element._accept;
  options.cookieJar = cookieJar;
  options.referrer = document.URL;
  options.pool = document._pool;
  options.agentOptions = document._agentOptions;
  options.strictSSL = document._strictSSL;
  options.proxy = document._proxy;
  options.userAgent = document._defaultView.navigator.userAgent;

  let req = null;
  function wrappedEnqueued() {
    if (req && requestManager) {
      requestManager.remove(req);
    }
    // do not trigger if the window is closed
    if (element._ownerDocument && element._ownerDocument.defaultView.document) {
      enqueued.apply(this, arguments);
    }
  }
  if (typeof customLoader === "function") {
    req = customLoader(
      {
        element,
        url: urlObj,
        cookie: cookieJar.getCookieStringSync(urlObj, { http: true }),
        baseUrl: documentBaseURLSerialized(document),
        defaultFetch(fetchCallback) {
          return fetch(urlObj, options, fetchCallback);
        }
      },
      wrappedEnqueued
    );
  } else {
    req = fetch(urlObj, options, wrappedEnqueued);
  }
  if (req && requestManager) {
    requestManager.add(req);
  }
};
