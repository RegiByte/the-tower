// Who waits on you, outside the window: the Dock badge, a bounce, a notification per wait that begins, and the menu
// bar's list. Read by a page of the app's own that never shows, run at the tower's origin so it reads the board
// through /tower.js and words it with /cards.js, as the tower page does: the same waits, less those the viewer
// dismissed in any renderer (`tower.store`), in the same words. The native side only draws what it is told.

import AppKit
import UserNotifications
import WebKit

/** One wait as the attention page words it. */
struct Wait {
  let key: String
  let id: String
  let title: String
  let body: String
  /** The body on one short line, for a menu. */
  let line: String
}

/**
 * Posts {waits, began, ended} on every board and every change to the dismissed waits: `waits` heeded in the board's
 * order, `began` and `ended` the keys that came and went since the last board (none on the first: what waited when the
 * app opened is not news). Posts {lost} when the tower stops answering.
 */
private let ATTENTION_PAGE = """
  <!doctype html><meta charset="utf-8"><title>Tower attention</title>
  <script src="/tower.js"></script>
  <script type="module">
    const { DISMISSED_KEY, heededWaits, transitions, findCard, statusName, gistLine } = await import('/cards.js')
    let board
    let prev
    const post = async (began = [], ended = []) => {
      const dismissed = new Set((await tower.store.get(DISMISSED_KEY)) ?? [])
      const waits = heededWaits(board, { dismissed }).map((w) => {
        const c = findCard(board, w.id)
        const gist = gistLine(c)
        const body = `${c.project}${gist ? ': ' + gist : ''}`
        const flat = body.replace(/\\s+/g, ' ').trim()
        return { key: w.key, id: w.id, title: `${c.callsign} · ${statusName(c)}`, body, line: flat.length > 64 ? flat.slice(0, 63) + '…' : flat }
      })
      webkit.messageHandlers.attention.postMessage({
        waits,
        began: began.filter((w) => !dismissed.has(w.key)).map((w) => w.key),
        ended: ended.map((w) => w.key),
      })
    }
    tower.subscribe((next) => {
      const { began, ended } = transitions(prev, next)
      prev = board = next
      post(began, ended)
    })
    addEventListener('storage', (e) => board && e.key?.endsWith(DISMISSED_KEY) && post())
    tower.onBoardError((e) => e.code === 'disconnected' && webkit.messageHandlers.attention.postMessage({ lost: true }))
  </script>
  """

final class Attention: NSObject, WKScriptMessageHandler, UNUserNotificationCenterDelegate {
  /** Opens a worker's session in the window: a notification's or a menu item's click. */
  let open: (String) -> Void
  /** Whether the user is looking at that worker now, so its wait needs no notification. */
  let watching: (String) -> Bool
  private var page: WKWebView?
  private var home: URL?
  private var awaitingTower = false
  private var waits: [Wait] = []
  private let status = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
  private let menu = NSMenu()

  init(open: @escaping (String) -> Void, watching: @escaping (String) -> Bool) {
    self.open = open
    self.watching = watching
    super.init()
    status.button?.image = NSImage(systemSymbolName: "building.2", accessibilityDescription: "Tower")
    status.button?.imagePosition = .imageLeading
    status.menu = menu
    let center = UNUserNotificationCenter.current()
    center.delegate = self
    center.requestAuthorization(options: [.alert]) { _, _ in }
    draw()
  }

  /** Reads the board of the tower at `home`, again from the start when called again. */
  func start(home: URL) {
    let config = WKWebViewConfiguration()
    // A web view in no window is suspended by default, and would hear the first board only.
    config.preferences.inactiveSchedulingPolicy = .none
    config.userContentController.add(self, name: "attention")
    let page = WKWebView(frame: .zero, configuration: config)
    page.loadHTMLString(ATTENTION_PAGE, baseURL: home)
    self.page = page
    self.home = home
  }

  /**
   * Once the tower answers again, the page starts over on the modules it serves then: a restarted tower may speak a
   * new API version, which the page's `/tower.js` would refuse on every board.
   */
  private func restartWhenBack() {
    guard let home, !awaitingTower else { return }
    awaitingTower = true
    URLSession.shared.dataTask(with: home.appendingPathComponent("renderers")) { _, response, _ in
      DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
        self.awaitingTower = false
        if (response as? HTTPURLResponse)?.statusCode == 200 { self.start(home: home) } else { self.restartWhenBack() }
      }
    }.resume()
  }

  func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
    guard let body = message.body as? [String: Any] else { return }
    if body["lost"] != nil { return restartWhenBack() }
    guard let list = body["waits"] as? [[String: String]] else { return }
    waits = list.map { Wait(key: $0["key"]!, id: $0["id"]!, title: $0["title"]!, body: $0["body"]!, line: $0["line"]!) }
    let began = Set(body["began"] as? [String] ?? [])
    let ended = body["ended"] as? [String] ?? []
    UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: ended)
    let fresh = waits.filter { began.contains($0.key) && !watching($0.id) }
    for wait in fresh { notify(wait) }
    if !fresh.isEmpty && !NSApp.isActive { NSApp.requestUserAttention(.informationalRequest) }
    draw()
  }

  /** A notification without a sound: the tower page rings its own. */
  private func notify(_ wait: Wait) {
    let content = UNMutableNotificationContent()
    content.title = wait.title
    content.body = wait.body
    content.userInfo = ["id": wait.id]
    UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: wait.key, content: content, trigger: nil))
  }

  /** The Dock badge and the menu bar: the count, then each wait in the order to go to them. */
  private func draw() {
    NSApp.dockTile.badgeLabel = waits.isEmpty ? nil : "\(waits.count)"
    status.button?.title = waits.isEmpty ? "" : "\(waits.count)"
    menu.removeAllItems()
    menu.addItem(withTitle: waits.isEmpty ? "Nobody waits on you" : "\(waits.count) waiting on you", action: nil, keyEquivalent: "")
    for wait in waits {
      let item = menu.addItem(withTitle: wait.title, action: #selector(openWait(_:)), keyEquivalent: "")
      item.target = self
      item.representedObject = wait.id
      item.toolTip = wait.body
      if #available(macOS 14.4, *) { item.subtitle = wait.line }
    }
    menu.addItem(.separator())
    menu.addItem(withTitle: "Open Tower", action: #selector(AppDelegate.showTower), keyEquivalent: "")
    menu.addItem(withTitle: "Quit Tower", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
  }

  @objc private func openWait(_ item: NSMenuItem) {
    if let id = item.representedObject as? String { open(id) }
  }

  func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler done: @escaping (UNNotificationPresentationOptions) -> Void) {
    done([.banner, .list])
  }

  func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler done: @escaping () -> Void) {
    if let id = response.notification.request.content.userInfo["id"] as? String { open(id) }
    done()
  }
}
