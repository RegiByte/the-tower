// The window: one WKWebView on the tower's address, with what a browser gives a page and a WKWebView doesn't (dialogs,
// links that leave the tower opening in the default browser) and the Mac's menus. Closing the window hides it, so the
// page keeps its connection and its state until the app quits; quitting leaves the tower running.

import AppKit
import WebKit

/** A web view that leaves the app's own ⌘ keys to the menu, and every other key to the page (a terminal's keymap). */
final class TowerWebView: WKWebView {
  static let appKeys: Set<String> = ["q", "w", "h", "m"]

  override func performKeyEquivalent(with event: NSEvent) -> Bool {
    let mods = event.modifierFlags.intersection(.deviceIndependentFlagsMask).subtracting([.capsLock, .numericPad, .function])
    if mods == .command, let key = event.charactersIgnoringModifiers, TowerWebView.appKeys.contains(key),
      NSApp.mainMenu?.performKeyEquivalent(with: event) == true
    {
      return true
    }
    return super.performKeyEquivalent(with: event)
  }
}

final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate, WKUIDelegate {
  let tower = Tower.bundled
  var window: NSWindow!
  var web: TowerWebView!
  /** The tower's address once it is up: the origin whose pages stay in the window. */
  var home: URL?
  var titleWatch: NSKeyValueObservation?
  var attention: Attention!
  let renderersMenu = NSMenu(title: "Renderer")
  /** Windows the page opened with no address yet (`createWebViewWith`), held until they are given one. */
  var blanks = Set<WKWebView>()

  func applicationDidFinishLaunching(_ notification: Notification) {
    NSApp.mainMenu = mainMenu()
    let config = WKWebViewConfiguration()
    config.mediaTypesRequiringUserActionForPlayback = []
    config.preferences.isElementFullscreenEnabled = true
    // Hidden (⌘W) the page keeps hearing the board, as a background tab does, and rings.
    config.preferences.inactiveSchedulingPolicy = .throttle
    web = TowerWebView(frame: .zero, configuration: config)
    web.isInspectable = true
    web.navigationDelegate = self
    web.uiDelegate = self
    window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1440, height: 900), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
    window.title = "Tower"
    window.tabbingMode = .disallowed
    window.contentView = web
    window.delegate = self
    window.center()
    window.setFrameAutosaveName("Tower")
    titleWatch = web.observe(\.title) { [weak self] web, _ in
      if let title = web.title, !title.isEmpty { self?.window.title = title }
    }
    window.makeKeyAndOrderFront(nil)
    attention = Attention(open: { [weak self] id in self?.openSession(id) }, watching: { [weak self] id in self?.isWatching(id) ?? false })
    NSApp.activate()
    start()
  }

  /** Brings the tower up off the main thread, then opens its default renderer, or says why it couldn't. */
  func start() {
    showStatus("Starting the tower", detail: "tower up, for \(tower.config)", retry: false)
    DispatchQueue.global().async {
      let result = Result { try startTower(self.tower) }
      DispatchQueue.main.async {
        switch result {
        case .success(let url):
          self.home = url
          self.web.load(URLRequest(url: url))
          self.loadRenderers()
          self.attention.start(home: url)
        case .failure(let failure as StartFailure):
          self.showStatus(failure.title, detail: failure.detail, retry: true)
        case .failure(let error):
          self.showStatus("The tower didn't start", detail: String(describing: error), retry: true)
        }
      }
    }
  }

  /** A page of the app's own: a title, the detail as preformatted text, and a Retry link when asked. */
  func showStatus(_ title: String, detail: String, retry: Bool) {
    let escape = { (s: String) in s.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "<", with: "&lt;") }
    web.loadHTMLString("""
      <!doctype html><meta charset="utf-8"><title>Tower</title>
      <style>
        :root { color-scheme: light dark; --bg: #f6f5f2; --fg: #22201c; --dim: #6b665e; --link: #2f5fb3 }
        @media (prefers-color-scheme: dark) { :root { --bg: #1b1a18; --fg: #ecebe7; --dim: #a29d94; --link: #8fb2ee } }
        body { background: var(--bg); color: var(--fg); font: 15px -apple-system, system-ui, sans-serif; margin: 0; padding: 48px 56px }
        h1 { font-size: 20px; font-weight: 600; margin: 0 0 12px }
        pre { color: var(--dim); font: 12px ui-monospace, Menlo, monospace; white-space: pre-wrap }
        a { color: var(--link) }
      </style>
      <h1>\(escape(title))</h1>
      \(retry ? "<p><a href=\"tower-app:retry\">Retry</a></p>" : "")
      <pre>\(escape(detail))</pre>
      """, baseURL: nil)
  }

  /** The View menu's renderers: each one the tower declares and has built (`GET /renderers`). */
  func loadRenderers() {
    guard let home else { return }
    URLSession.shared.dataTask(with: home.appendingPathComponent("renderers")) { data, _, _ in
      guard let data, let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any], let list = json["renderers"] as? [[String: Any]] else { return }
      let names = list.filter { $0["available"] as? Bool == true }.compactMap { $0["name"] as? String }
      DispatchQueue.main.async {
        self.renderersMenu.removeAllItems()
        self.renderersMenu.addItem(withTitle: "Default", action: #selector(self.openDefault), keyEquivalent: "")
        self.renderersMenu.addItem(.separator())
        for name in names {
          let item = self.renderersMenu.addItem(withTitle: name, action: #selector(self.openRenderer(_:)), keyEquivalent: "")
          item.representedObject = name
        }
      }
    }.resume()
  }

  @objc func openDefault() {
    if let home { web.load(URLRequest(url: home)) }
  }

  @objc func openRenderer(_ item: NSMenuItem) {
    if let home, let name = item.representedObject as? String { web.load(URLRequest(url: home.appendingPathComponent("r/\(name)/"))) }
  }

  @objc func reloadPage() {
    if home == nil { start() } else { web.reload() }
  }

  @objc func zoomIn() { web.pageZoom = min(web.pageZoom + 0.1, 3) }
  @objc func zoomOut() { web.pageZoom = max(web.pageZoom - 0.1, 0.5) }
  @objc func actualSize() { web.pageZoom = 1 }

  @objc func showInspector() {
    // The inspector has no public opener; the context menu's Inspect Element is the other way in.
    let inspector = web.perform(NSSelectorFromString("_inspector"))?.takeUnretainedValue() as? NSObject
    inspector?.perform(NSSelectorFromString("show"))
  }

  @objc func showTower() {
    window.makeKeyAndOrderFront(nil)
    NSApp.activate()
  }

  /** A worker's session in the window: the tower page opens one at `/#<id>`, and follows the hash once open. */
  func openSession(_ id: String) {
    showTower()
    guard let home else { return }
    if let url = web.url, isTower(url), url.path == home.path {
      web.evaluateJavaScript("location.hash = \(String(reflecting: id))")
    } else {
      web.load(URLRequest(url: URL(string: "#\(id)", relativeTo: home)!))
    }
  }

  /** Whether the user is looking at the worker's session: the app in front, its window key, at `/#<id>`. */
  func isWatching(_ id: String) -> Bool {
    NSApp.isActive && window.isKeyWindow && web.url?.fragment == id
  }

  // MARK: Window

  func windowShouldClose(_ sender: NSWindow) -> Bool {
    sender.orderOut(nil)
    return false
  }

  func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows: Bool) -> Bool {
    if !hasVisibleWindows { showTower() }
    return true
  }

  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }

  // MARK: Navigation

  /** Whether a URL is the tower's own: the same scheme, host and port as its address. */
  func isTower(_ url: URL) -> Bool {
    guard let home else { return false }
    return url.scheme == home.scheme && url.host == home.host && url.port == home.port
  }

  /** The address of a window opened with none yet. */
  func isBlank(_ url: URL) -> Bool { url.absoluteString.isEmpty || url.absoluteString == "about:blank" }

  /** Opens a link that leaves the tower in the default browser, as a tab's `_blank` would. */
  func openOutside(_ url: URL) {
    if ["http", "https", "mailto"].contains(url.scheme ?? "") { NSWorkspace.shared.open(url) }
  }

  func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
    guard let url = action.request.url else { return decisionHandler(.allow) }
    if blanks.contains(webView), !isBlank(url) {
      openOutside(url)
      blanks.remove(webView)
      return decisionHandler(.cancel)
    }
    if url.scheme == "tower-app" {
      // Only the app's own status page, shown while the tower has no address, offers Retry.
      if url.absoluteString == "tower-app:retry", home == nil { start() }
      return decisionHandler(.cancel)
    }
    // Frames inside the page (shelf pages, served at origins of their own) go where the page sends them.
    let mainFrame = action.targetFrame?.isMainFrame ?? true
    if mainFrame, ["http", "https"].contains(url.scheme ?? ""), !isTower(url) {
      openOutside(url)
      return decisionHandler(.cancel)
    }
    decisionHandler(.allow)
  }

  /**
   * A new window's address goes to the default browser. `window.open()` with none, given its address after (xterm's
   * links do this), gets a web view that never shows, until its first navigation that has one.
   */
  func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
    if let url = action.request.url, !isBlank(url) {
      openOutside(url)
      return nil
    }
    let blank = WKWebView(frame: .zero, configuration: configuration)
    blank.navigationDelegate = self
    blanks.insert(blank)
    return blank
  }

  func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
    guard let home else { return }
    // A load replaced by a newer one (two clicks, ⌘R twice) fails as cancelled, or interrupted in WebKit's terms.
    let code = (error as NSError).code
    if ((error as NSError).domain == NSURLErrorDomain && code == NSURLErrorCancelled) || ((error as NSError).domain == "WebKitErrorDomain" && code == 102) { return }
    let failed = (error as NSError).userInfo[NSURLErrorFailingURLErrorKey] as? URL
    if let failed, !isTower(failed) { return }
    self.home = nil
    showStatus("The tower doesn't answer", detail: "\(home.absoluteString): \(error.localizedDescription)\n\nRetry runs tower up again.", retry: true)
  }

  func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
    webView.reload()
  }

  // MARK: Dialogs

  func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
    let alert = NSAlert()
    alert.messageText = message
    alert.beginSheetModal(for: window) { _ in completionHandler() }
  }

  func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
    let alert = NSAlert()
    alert.messageText = message
    alert.addButton(withTitle: "OK")
    alert.addButton(withTitle: "Cancel")
    alert.beginSheetModal(for: window) { completionHandler($0 == .alertFirstButtonReturn) }
  }

  func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
    let alert = NSAlert()
    alert.messageText = prompt
    let field = NSTextField(frame: NSRect(x: 0, y: 0, width: 320, height: 24))
    field.stringValue = defaultText ?? ""
    alert.accessoryView = field
    alert.addButton(withTitle: "OK")
    alert.addButton(withTitle: "Cancel")
    alert.window.initialFirstResponder = field
    alert.beginSheetModal(for: window) { completionHandler($0 == .alertFirstButtonReturn ? field.stringValue : nil) }
  }

  // MARK: Menus

  func mainMenu() -> NSMenu {
    let main = NSMenu()
    func submenu(_ title: String, _ items: [NSMenuItem]) {
      let menu = NSMenu(title: title)
      items.forEach(menu.addItem)
      main.addItem(withTitle: title, action: nil, keyEquivalent: "").submenu = menu
    }
    func item(_ title: String, _ action: Selector?, _ key: String, _ mods: NSEvent.ModifierFlags = .command) -> NSMenuItem {
      let item = NSMenuItem(title: title, action: action, keyEquivalent: key)
      item.keyEquivalentModifierMask = mods
      return item
    }
    submenu("Tower", [
      item("About Tower", #selector(NSApplication.orderFrontStandardAboutPanel(_:)), ""),
      .separator(),
      item("Hide Tower", #selector(NSApplication.hide(_:)), "h"),
      item("Hide Others", #selector(NSApplication.hideOtherApplications(_:)), "h", [.command, .option]),
      item("Show All", #selector(NSApplication.unhideAllApplications(_:)), ""),
      .separator(),
      item("Quit Tower", #selector(NSApplication.terminate(_:)), "q"),
    ])
    submenu("Edit", [
      item("Undo", Selector(("undo:")), "z"),
      item("Redo", Selector(("redo:")), "z", [.command, .shift]),
      .separator(),
      item("Cut", #selector(NSText.cut(_:)), "x"),
      item("Copy", #selector(NSText.copy(_:)), "c"),
      item("Paste", #selector(NSText.paste(_:)), "v"),
      item("Select All", #selector(NSText.selectAll(_:)), "a"),
    ])
    let renderers = NSMenuItem(title: "Renderer", action: nil, keyEquivalent: "")
    renderers.submenu = renderersMenu
    submenu("View", [
      renderers,
      .separator(),
      item("Reload", #selector(reloadPage), "r"),
      item("Actual Size", #selector(actualSize), "0"),
      item("Zoom In", #selector(zoomIn), "+"),
      item("Zoom Out", #selector(zoomOut), "-"),
      .separator(),
      item("Enter Full Screen", #selector(NSWindow.toggleFullScreen(_:)), "f", [.command, .control]),
      item("Web Inspector", #selector(showInspector), "i", [.command, .option]),
    ])
    submenu("Window", [
      item("Minimize", #selector(NSWindow.performMiniaturize(_:)), "m"),
      item("Close", #selector(NSWindow.performClose(_:)), "w"),
      .separator(),
      item("Tower", #selector(showTower), "1"),
    ])
    return main
  }
}
