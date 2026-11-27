import crypto from "node:crypto";
import { sendJson } from "./utils.mjs";

/**
 * High-performance O(1) HTTP Router with method-aware dispatch,
 * correlation IDs, and timing instrumentation.
 */
export class Router {
  constructor() {
    // Map<HTTP_METHOD, Map<pathname, handler>>
    this.routes = new Map();
    // Set of all registered pathnames across all methods
    this.allPaths = new Set();
  }

  /**
   * Register a route handler for a given HTTP method and path
   * @param {string} method HTTP method (GET, POST, etc.)
   * @param {string|string[]} paths Single path or array of paths
   * @param {Function} handler Request handler (req, res, url, correlationId)
   */
  add(method, paths, handler) {
    const m = method.toUpperCase();
    if (!this.routes.has(m)) {
      this.routes.set(m, new Map());
    }
    const methodMap = this.routes.get(m);
    const pathList = Array.isArray(paths) ? paths : [paths];

    for (const p of pathList) {
      methodMap.set(p, handler);
      this.allPaths.add(p);
    }
  }

  get(paths, handler) {
    this.add("GET", paths, handler);
  }

  post(paths, handler) {
    this.add("POST", paths, handler);
  }

  /**
   * Get all methods registered for a given path
   * @param {string} pathname
   * @returns {string[]}
   */
  getAllowedMethods(pathname) {
    const allowed = [];
    for (const [method, pathMap] of this.routes.entries()) {
      if (pathMap.has(pathname)) {
        allowed.push(method);
      }
    }
    return allowed;
  }

  /**
   * Dispatch a request to the matching route handler
   * @param {http.IncomingMessage} req
   * @param {http.ServerResponse} res
   * @param {URL} url
   * @param {string} correlationId
   * @returns {Promise<boolean>} true if handled, false if not matched (e.g. for static fallback)
   */
  async dispatch(req, res, url, correlationId) {
    res.req = req;
    const methodRoutes = this.routes.get(req.method);
    const handler = methodRoutes?.get(url.pathname);

    if (handler) {
      await handler(req, res, url, correlationId);
      return true;
    }

    // Check if the path exists under another HTTP method -> 405 Method Not Allowed
    if (this.allPaths.has(url.pathname)) {
      const allowed = this.getAllowedMethods(url.pathname);
      res.setHeader("Allow", allowed.join(", "));
      sendJson(
        res,
        {
          error: "Method Not Allowed",
          method: req.method,
          path: url.pathname,
          allowedMethods: allowed,
        },
        405
      );
      return true;
    }

    // If an explicit API path doesn't exist -> 404 Not Found
    if (url.pathname.startsWith("/api/")) {
      sendJson(
        res,
        {
          error: "Not Found",
          path: url.pathname,
        },
        404
      );
      return true;
    }

    // Not an API path - delegate to static / SPA file serving
    return false;
  }
}
